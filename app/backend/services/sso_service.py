"""
Accesso al comparatore con un'identita emessa da PrevidenzaPro.

Il flusso e questo:

  1. PrevidenzaPro verifica che l'utente abbia diritto al comparatore ed emette
     un JWT firmato RS256, valido pochi secondi e utilizzabile una sola volta.
  2. La pagina che incorpora il comparatore passa il token all'iframe.
  3. Il comparatore chiama /auth/sso/exchange, questo modulo verifica il token,
     crea o ritrova l'utente ed emette la nostra sessione.

Il controllo degli accessi resta a PrevidenzaPro: se non emette il token,
l'utente non entra. Qui ci limitiamo a verificare che il token sia autentico,
recente e non gia usato.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional

import httpx
import jwt
from jwt.algorithms import RSAAlgorithm

from backend.config.sso import SSOConfig, get_sso_config
from backend.schemas.user import UserProfile, UserProfileCreate
from backend.services import auth_service, user_service

logger = logging.getLogger(__name__)

ALGORITMO = "RS256"
PREFISSO_ID = "pp"
CHIAVE_METADATI = "previdenzapro"

# Campi che PrevidenzaPro mette nel token e che a noi oggi non servono per
# decidere l'accesso, ma che conserviamo sul profilo: torneranno utili quando
# arriveranno le API degli abbonamenti, e intanto aiutano a capire un accesso
# guardando il profilo. Un campo che non c'e viene semplicemente saltato.
CLAIM_DA_CONSERVARE = (
    "organization_id",
    "software",
    "access_level",
    "authorization_valid_until",
)


class SSOError(Exception):
    """Token non valido, scaduto, gia usato o emesso da chi non conosciamo."""

    def __init__(self, motivo: str, *, codice: str = "token_non_valido"):
        super().__init__(motivo)
        self.motivo = motivo
        self.codice = codice


@dataclass(frozen=True)
class IdentitaSSO:
    """Quello che il token ci dice dell'utente, gia normalizzato."""

    sub: str
    email: Optional[str]
    email_verificata: bool
    nome: Optional[str]
    piano: str
    jti: str
    claims: Dict[str, Any]
    # fino a quando PrevidenzaPro autorizza questo utente, in epoch; None se
    # non lo dichiara
    autorizzazione_fino_a: Optional[int] = None


def _istante_da_claim(valore: Any) -> Optional[int]:
    """
    Legge una scadenza dal token e la riporta a epoch.

    PrevidenzaPro la manda come data ISO 8601 con fuso orario; accettiamo anche
    un numero, cosi un cambio di formato da parte loro non ci blocca. Un valore
    illeggibile viene segnalato e ignorato: non deve impedire l'accesso.
    """
    if valore is None:
        return None
    if isinstance(valore, bool):
        return None
    if isinstance(valore, (int, float)):
        return int(valore)
    if not isinstance(valore, str):
        return None

    testo = valore.strip()
    if not testo:
        return None
    if testo.isdigit():
        return int(testo)

    from datetime import datetime, timezone
    try:
        istante = datetime.fromisoformat(testo.replace("Z", "+00:00"))
    except ValueError:
        logger.warning("Scadenza dell'autorizzazione illeggibile nel token: %r", testo)
        return None
    if istante.tzinfo is None:
        istante = istante.replace(tzinfo=timezone.utc)
    return int(istante.timestamp())


# --------------------------------------------------------------------------- #
# Chiavi pubbliche (JWKS)
# --------------------------------------------------------------------------- #

class CacheJWKS:
    """
    Tiene in memoria le chiavi pubbliche di chi emette i token.

    Il JWKS si rilegge alla scadenza della cache e, fuori scadenza, anche quando
    arriva un `kid` sconosciuto: cosi una rotazione delle chiavi non ci blocca.
    Per non trasformare un token malevolo in un attacco al loro server, fra due
    riletture forzate passa almeno `intervallo_minimo` secondi.
    """

    def __init__(self):
        self._chiavi: Dict[str, Any] = {}
        self._scadenza: float = 0.0
        self._ultima_rilettura: float = 0.0
        self._lock = asyncio.Lock()

    def svuota(self) -> None:
        self._chiavi = {}
        self._scadenza = 0.0
        self._ultima_rilettura = 0.0

    async def chiave(self, kid: str, config: SSOConfig, fetch: Optional[Callable] = None) -> Any:
        adesso = time.time()
        if kid in self._chiavi and adesso < self._scadenza:
            return self._chiavi[kid]

        scaduta = adesso >= self._scadenza
        rilettura_consentita = adesso - self._ultima_rilettura >= config.jwks_min_refetch_seconds
        if not scaduta and not rilettura_consentita:
            # kid sconosciuto ma abbiamo appena riletto: non insistiamo
            raise SSOError(f"Chiave di firma sconosciuta: {kid}", codice="chiave_sconosciuta")

        async with self._lock:
            # un'altra richiesta puo aver gia aggiornato mentre aspettavamo
            if kid in self._chiavi and time.time() < self._scadenza:
                return self._chiavi[kid]
            await self._rileggi(config, fetch)

        if kid not in self._chiavi:
            raise SSOError(f"Chiave di firma sconosciuta: {kid}", codice="chiave_sconosciuta")
        return self._chiavi[kid]

    async def _rileggi(self, config: SSOConfig, fetch: Optional[Callable]) -> None:
        self._ultima_rilettura = time.time()
        try:
            documento = await (fetch(config.jwks_url) if fetch else _scarica_jwks(config.jwks_url))
        except SSOError:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.error("JWKS non raggiungibile su %s: %s", config.jwks_url, exc)
            raise SSOError("Chiavi di firma non raggiungibili", codice="jwks_non_raggiungibile") from exc

        chiavi: Dict[str, Any] = {}
        for jwk in (documento or {}).get("keys", []):
            kid = jwk.get("kid")
            if not kid or jwk.get("kty") != "RSA":
                continue
            if jwk.get("alg") and jwk["alg"] != ALGORITMO:
                continue
            try:
                chiavi[kid] = RSAAlgorithm.from_jwk(json.dumps(jwk))
            except Exception as exc:  # noqa: BLE001
                logger.warning("Chiave JWKS illeggibile kid=%s: %s", kid, exc)

        if not chiavi:
            raise SSOError("Il JWKS non contiene chiavi RSA utilizzabili", codice="jwks_vuoto")

        self._chiavi = chiavi
        self._scadenza = time.time() + config.jwks_ttl_seconds
        logger.info("JWKS aggiornato: %d chiavi, valide per %ds", len(chiavi), config.jwks_ttl_seconds)


async def _scarica_jwks(url: str) -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=10.0) as client:
        risposta = await client.get(url, headers={"Accept": "application/json"})
        risposta.raise_for_status()
        return risposta.json()


_cache_jwks = CacheJWKS()


# --------------------------------------------------------------------------- #
# Token gia usati
# --------------------------------------------------------------------------- #

class RegistroJti:
    """
    Impedisce che lo stesso token venga speso due volte.

    In memoria basta finche gira una sola istanza del backend. Con piu istanze
    su Cloud Run la memoria non e condivisa, quindi il registro va anche su
    Firestore: la memoria resta davanti come filtro veloce.
    """

    def __init__(self):
        self._visti: Dict[str, float] = {}

    def svuota(self) -> None:
        self._visti = {}

    def _pulisci(self) -> None:
        adesso = time.time()
        if len(self._visti) > 1000:
            self._visti = {k: v for k, v in self._visti.items() if v > adesso}

    async def registra(self, jti: str, scadenza: float) -> None:
        """Registra il token. Solleva SSOError se risulta gia usato."""
        adesso = time.time()
        self._pulisci()
        if self._visti.get(jti, 0) > adesso:
            raise SSOError("Token gia utilizzato", codice="token_gia_usato")
        self._visti[jti] = scadenza

        if not await self._registra_su_firestore(jti, scadenza):
            return

    async def _registra_su_firestore(self, jti: str, scadenza: float) -> bool:
        """
        True se la scrittura e andata a buon fine. Se Firestore non e attivo o
        non risponde non blocchiamo l'accesso: il filtro in memoria resta.
        """
        try:
            from backend.providers.firestore import get_collection_name, get_firestore_client
        except Exception:  # noqa: BLE001
            return False

        import os

        if os.getenv("APP_FIRESTORE_ENABLED", "true").lower() not in ("true", "1", "yes"):
            return False

        try:
            client = get_firestore_client()
            nome = get_collection_name("sso_jti", "sso_jti")
            documento = client.collection(nome).document(jti)

            def _scrivi() -> bool:
                from datetime import datetime, timezone

                istantanea = documento.get()
                if istantanea.exists:
                    return False
                documento.set({
                    "usato_il": datetime.now(timezone.utc),
                    "scade_il": datetime.fromtimestamp(scadenza, tz=timezone.utc),
                })
                return True

            creato = await asyncio.to_thread(_scrivi)
            if not creato:
                raise SSOError("Token gia utilizzato", codice="token_gia_usato")
            return True
        except SSOError:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.warning("Registro jti su Firestore non disponibile: %s", exc)
            return False


_registro_jti = RegistroJti()


# --------------------------------------------------------------------------- #
# Verifica del token
# --------------------------------------------------------------------------- #

async def verifica_token(token: str, *, fetch_jwks: Optional[Callable] = None) -> IdentitaSSO:
    """Verifica firma, destinatario, scadenza e unicita del token SSO."""
    config = get_sso_config()
    if not config.configurato:
        raise SSOError("Accesso SSO non configurato su questo ambiente", codice="sso_non_configurato")

    if not token or token.count(".") != 2:
        raise SSOError("Token malformato")

    try:
        intestazione = jwt.get_unverified_header(token)
    except Exception as exc:  # noqa: BLE001
        raise SSOError("Intestazione del token illeggibile") from exc

    # L'algoritmo lo imponiamo noi: un token che dichiara "none" o un algoritmo
    # simmetrico non deve nemmeno arrivare alla verifica della firma.
    if intestazione.get("alg") != ALGORITMO:
        raise SSOError(f"Algoritmo non ammesso: {intestazione.get('alg')}", codice="algoritmo_non_ammesso")

    kid = intestazione.get("kid")
    if not kid:
        raise SSOError("Token senza kid: non sappiamo con quale chiave verificarlo")

    chiave = await _cache_jwks.chiave(kid, config, fetch_jwks)

    try:
        claims = jwt.decode(
            token,
            key=chiave,
            algorithms=[ALGORITMO],
            audience=config.audience,
            issuer=config.issuer,
            leeway=config.leeway_seconds,
            options={"require": ["exp", "iat", "sub", "jti", "aud", "iss"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise SSOError("Token scaduto", codice="token_scaduto") from exc
    except jwt.InvalidAudienceError as exc:
        raise SSOError("Token emesso per un altro software", codice="destinatario_errato") from exc
    except jwt.InvalidIssuerError as exc:
        raise SSOError("Token emesso da un sistema sconosciuto", codice="emittente_errato") from exc
    except jwt.MissingRequiredClaimError as exc:
        raise SSOError(f"Nel token manca il campo {exc.claim}", codice="claim_mancante") from exc
    except jwt.InvalidTokenError as exc:
        raise SSOError("Firma del token non valida") from exc

    # Un token vecchio ma non ancora scaduto non ci interessa: devono essere
    # emessi al momento dell'accesso, non riciclati.
    emesso_il = float(claims.get("iat", 0))
    eta = time.time() - emesso_il
    if eta > config.max_token_age_seconds + config.leeway_seconds:
        raise SSOError("Token troppo vecchio", codice="token_scaduto")

    # Scadenza dell'autorizzazione: se e gia passata non si entra, anche se il
    # token in se sarebbe ancora valido.
    autorizzazione_fino_a = _istante_da_claim(claims.get(config.claim_authorization_until))
    if autorizzazione_fino_a is not None and autorizzazione_fino_a <= time.time() - config.leeway_seconds:
        raise SSOError("Autorizzazione scaduta", codice="autorizzazione_scaduta")

    jti = str(claims["jti"])
    scadenza = float(claims.get("exp", time.time() + 60))
    await _registro_jti.registra(jti, scadenza)

    email = claims.get(config.claim_email)
    verificata = claims.get(config.claim_email_verified)
    piano = config.default_plan
    if config.claim_plan and claims.get(config.claim_plan):
        piano = str(claims[config.claim_plan])

    return IdentitaSSO(
        sub=str(claims["sub"]),
        email=str(email).strip().lower() if email else None,
        # se il campo non c'e diamo per buona l'email: il controllo sull'identita
        # lo ha gia fatto PrevidenzaPro prima di emettere il token
        email_verificata=True if verificata is None else bool(verificata),
        nome=str(claims[config.claim_name]) if claims.get(config.claim_name) else None,
        piano=piano,
        jti=jti,
        claims=claims,
        autorizzazione_fino_a=autorizzazione_fino_a,
    )


# --------------------------------------------------------------------------- #
# Utente e sessione
# --------------------------------------------------------------------------- #

async def trova_o_crea_utente(identita: IdentitaSSO) -> UserProfile:
    """
    Ritrova il profilo dell'utente o lo crea.

    L'ordine conta:
      1. per identificativo PrevidenzaPro, se lo abbiamo gia visto;
      2. per email verificata, cosi chi entrava con Google ritrova il suo
         profilo invece di ripartire da zero;
      3. altrimenti si crea un profilo nuovo.

    Se l'email non coincide preferiamo un doppione a un'associazione sbagliata.
    """
    id_interno = f"{PREFISSO_ID}_{identita.sub}"

    esistente = await user_service.get_user_by_id(id_interno)
    collegamento = "identificativo"

    if esistente is None and identita.email and identita.email_verificata:
        per_email = await user_service.get_user_by_email(identita.email)
        if per_email is not None:
            esistente = per_email
            collegamento = "email"
            logger.info(
                "SSO: profilo esistente collegato per email utente=%s sub=%s",
                per_email.id, identita.sub,
            )

    if esistente is None and not identita.email:
        raise SSOError("Il token non contiene l'email dell'utente", codice="email_mancante")

    id_profilo = esistente.id if esistente else id_interno
    metadati = dict(getattr(esistente, "metadata", None) or {})
    metadati[CHIAVE_METADATI] = {
        **(metadati.get(CHIAVE_METADATI) or {}),
        "sub": identita.sub,
        "collegato_per": collegamento,
        "ultimo_accesso_sso": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        **{c: identita.claims[c] for c in CLAIM_DA_CONSERVARE if identita.claims.get(c) is not None},
    }

    profilo = UserProfileCreate(
        id=id_profilo,
        email=identita.email or (esistente.email if esistente else None),
        name=identita.nome or (esistente.name if esistente else None),
        picture=esistente.picture if esistente else None,
        # il diritto di accesso lo ha gia deciso PrevidenzaPro emettendo il token:
        # l'utente entra attivo, senza passare dall'approvazione di un amministratore
        plan=identita.piano,
        status="active",
        metadata=metadati,
    )

    aggiornato = await user_service.upsert_user(profilo, mark_login=True)
    return aggiornato or esistente  # type: ignore[return-value]


async def accedi_con_sso(token: str, *, fetch_jwks: Optional[Callable] = None) -> tuple[str, UserProfile]:
    """Verifica il token, prepara l'utente ed emette la sessione del comparatore."""
    identita = await verifica_token(token, fetch_jwks=fetch_jwks)
    profilo = await trova_o_crea_utente(identita)

    extra: Dict[str, Any] = {"sso_sub": identita.sub}
    if identita.autorizzazione_fino_a is not None:
        extra["sso_auth_until"] = identita.autorizzazione_fino_a

    sessione = auth_service.create_session_token(
        user_id=profilo.id,
        email=profilo.email,
        name=profilo.name,
        picture=profilo.picture,
        provider="previdenzapro",
        roles=profilo.roles or ["user"],
        plan=profilo.plan or identita.piano,
        extra_claims=extra,
        # la sessione non sopravvive all'autorizzazione: se questa scade prima
        # dei 30 minuti consueti, la sessione scade con lei
        expires_at=identita.autorizzazione_fino_a,
    )
    logger.info(
        "Accesso SSO completato utente=%s sub=%s piano=%s autorizzato_fino_a=%s",
        profilo.id, identita.sub, profilo.plan,
        identita.autorizzazione_fino_a if identita.autorizzazione_fino_a is not None else "non dichiarato",
    )
    return sessione, profilo


def reset_cache() -> None:
    """Svuota cache delle chiavi e registro dei token: serve ai test."""
    _cache_jwks.svuota()
    _registro_jti.svuota()
