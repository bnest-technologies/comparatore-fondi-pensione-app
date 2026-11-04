"""
Test della verifica dei token SSO di PrevidenzaPro.

E il punto in cui un errore diventa un accesso non autorizzato, quindi qui si
controlla soprattutto cosa viene rifiutato: firme false, token scaduti o gia
usati, destinatari sbagliati, algoritmi che non abbiamo scelto noi.

Eseguire: pytest tests/services/test_sso_service.py
"""
from __future__ import annotations

import json
import time
import uuid
from typing import Any, Dict, Optional

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt.algorithms import RSAAlgorithm

from backend.config.sso import get_sso_config, reset_sso_config
from backend.services import sso_service
from backend.services.sso_service import SSOError

EMITTENTE = "https://staging.previdenzapro.it"
DESTINATARIO = "comparatore-fondi-pensione"


def _coppia_chiavi():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def _jwks(chiavi: Dict[str, Any]) -> Dict[str, Any]:
    """Costruisce un documento JWKS dalle chiavi pubbliche indicate."""
    elenco = []
    for kid, privata in chiavi.items():
        jwk = json.loads(RSAAlgorithm.to_jwk(privata.public_key()))
        jwk.update({"kid": kid, "alg": "RS256", "use": "sig"})
        elenco.append(jwk)
    return {"keys": elenco}


def _token(
    privata,
    kid: str,
    *,
    claims_extra: Optional[Dict[str, Any]] = None,
    emittente: str = EMITTENTE,
    destinatario: str = DESTINATARIO,
    durata: int = 60,
    eta: int = 0,
    algoritmo: str = "RS256",
    chiave_firma: Any = None,
) -> str:
    adesso = int(time.time()) - eta
    claims = {
        "iss": emittente,
        "aud": destinatario,
        "sub": "7f3a1c20-0000-4000-8000-000000000001",
        "jti": str(uuid.uuid4()),
        "iat": adesso,
        "exp": adesso + durata,
        "email": "consulente@example.com",
        "email_verified": True,
        "name": "Mario Rossi",
    }
    claims.update(claims_extra or {})
    return jwt.encode(claims, chiave_firma or privata, algorithm=algoritmo, headers={"kid": kid})


@pytest.fixture
def ambiente(monkeypatch):
    """Configura l'SSO e restituisce chiave, kid e un lettore di JWKS finto."""
    monkeypatch.setenv("APP_SSO_ENABLED", "true")
    monkeypatch.setenv("APP_SSO_ISSUER", EMITTENTE)
    monkeypatch.setenv("APP_SSO_AUDIENCE", DESTINATARIO)
    monkeypatch.setenv("APP_SSO_JWKS_URL", f"{EMITTENTE}/.well-known/jwks.json")
    monkeypatch.setenv("APP_SSO_PARENT_ORIGINS", EMITTENTE)
    # il registro dei token usati resta in memoria: niente Firestore nei test
    monkeypatch.setenv("APP_FIRESTORE_ENABLED", "false")
    # in produzione due riletture forzate del JWKS distano almeno un minuto;
    # qui non aspettiamo
    monkeypatch.setenv("APP_SSO_JWKS_MIN_REFETCH", "0")
    reset_sso_config()
    sso_service.reset_cache()

    privata = _coppia_chiavi()
    kid = "chiave-2026-01"
    stato = {"chiavi": {kid: privata}, "letture": 0}

    async def leggi_jwks(_url: str) -> Dict[str, Any]:
        stato["letture"] += 1
        return _jwks(stato["chiavi"])

    yield {"privata": privata, "kid": kid, "jwks": leggi_jwks, "stato": stato}

    reset_sso_config()
    sso_service.reset_cache()


async def _verifica(token: str, ambiente) -> Any:
    return await sso_service.verifica_token(token, fetch_jwks=ambiente["jwks"])


def _durata_sessione(sessione: str) -> int:
    """Quanti secondi dura la sessione emessa dal comparatore."""
    claims = jwt.decode(sessione, options={"verify_signature": False}, algorithms=["HS256"])
    return int(claims["exp"]) - int(claims["iat"])


async def _accedi(ambiente, monkeypatch, *, claims_extra: dict):
    """
    Accesso completo attraverso accedi_con_sso, con un profilo finto al posto
    di Firestore. Restituisce la sessione emessa e l'identita letta dal token.
    """
    from backend.schemas.user import UserProfile
    from backend.services import user_service

    async def nessun_profilo(_valore):
        return None

    async def profilo_finto(profilo, *, mark_login=False):
        return UserProfile(id=profilo.id, email=profilo.email, name=profilo.name,
                           plan=profilo.plan, status=profilo.status, roles=["user"])

    monkeypatch.setattr(user_service, "get_user_by_id", nessun_profilo)
    monkeypatch.setattr(user_service, "get_user_by_email", nessun_profilo)
    monkeypatch.setattr(user_service, "upsert_user", profilo_finto)

    token = _token(ambiente["privata"], ambiente["kid"], claims_extra=claims_extra)
    identita = await sso_service.verifica_token(token, fetch_jwks=ambiente["jwks"])

    # stesso token, nuovo jti: verifica_token lo ha gia consumato
    token = _token(ambiente["privata"], ambiente["kid"], claims_extra=claims_extra)
    sessione, _ = await sso_service.accedi_con_sso(token, fetch_jwks=ambiente["jwks"])
    return sessione, identita


# --------------------------------------------------------------------------- #
# Token validi
# --------------------------------------------------------------------------- #

@pytest.mark.asyncio
async def test_token_valido_restituisce_identita(ambiente):
    token = _token(ambiente["privata"], ambiente["kid"])
    identita = await _verifica(token, ambiente)

    assert identita.sub == "7f3a1c20-0000-4000-8000-000000000001"
    assert identita.email == "consulente@example.com"
    assert identita.email_verificata is True
    assert identita.nome == "Mario Rossi"
    assert identita.piano == "full-access"


@pytest.mark.asyncio
async def test_email_normalizzata_in_minuscolo(ambiente):
    token = _token(ambiente["privata"], ambiente["kid"], claims_extra={"email": "Consulente@Example.IT"})
    identita = await _verifica(token, ambiente)
    assert identita.email == "consulente@example.it"


@pytest.mark.asyncio
async def test_campi_aggiuntivi_non_disturbano(ambiente):
    """
    PrevidenzaPro mette nel token anche campi che a noi oggi non servono.
    Devono passare senza far fallire la verifica e restare leggibili, perche
    serviranno quando arriveranno le API degli abbonamenti.
    """
    token = _token(ambiente["privata"], ambiente["kid"], claims_extra={
        "organization_id": "org_0001",
        "software": "comparatore-fondi-pensione",
        "access_level": "licensed",
        "authorization_valid_until": "2027-06-12T23:59:59+02:00",
        "campo_che_inventeranno_domani": {"annidato": [1, 2, 3]},
    })
    identita = await _verifica(token, ambiente)

    assert identita.email == "consulente@example.com"
    assert identita.piano == "full-access"
    assert identita.claims["organization_id"] == "org_0001"
    assert identita.claims["access_level"] == "licensed"
    assert identita.claims["authorization_valid_until"] == "2027-06-12T23:59:59+02:00"


@pytest.mark.asyncio
async def test_campi_aggiuntivi_finiscono_nel_profilo(ambiente, monkeypatch):
    """I campi utili si conservano sul profilo dell'utente."""
    from backend.services import user_service

    salvati = {}

    async def nessun_profilo(_valore):
        return None

    async def intercetta(profilo, *, mark_login=False):
        salvati.update(profilo.model_dump())
        from backend.schemas.user import UserProfile
        return UserProfile(id=profilo.id, email=profilo.email, name=profilo.name,
                           plan=profilo.plan, status=profilo.status, roles=["user"])

    monkeypatch.setattr(user_service, "get_user_by_id", nessun_profilo)
    monkeypatch.setattr(user_service, "get_user_by_email", nessun_profilo)
    monkeypatch.setattr(user_service, "upsert_user", intercetta)

    token = _token(ambiente["privata"], ambiente["kid"], claims_extra={
        "organization_id": "org_0001",
        "access_level": "licensed",
        "authorization_valid_until": "2027-06-12T23:59:59+02:00",
    })
    identita = await _verifica(token, ambiente)
    await sso_service.trova_o_crea_utente(identita)

    conservati = salvati["metadata"]["previdenzapro"]
    assert conservati["sub"] == identita.sub
    assert conservati["organization_id"] == "org_0001"
    assert conservati["access_level"] == "licensed"
    assert conservati["authorization_valid_until"] == "2027-06-12T23:59:59+02:00"
    # l'identificativo interno nasce dal loro sub, senza rischio di collisioni
    assert salvati["id"] == f"pp_{identita.sub}"
    assert salvati["status"] == "active"


# --------------------------------------------------------------------------- #
# Scadenza dell'autorizzazione
# --------------------------------------------------------------------------- #

@pytest.mark.asyncio
@pytest.mark.parametrize("scritta_come", ["iso_con_fuso", "iso_zulu", "epoch", "epoch_stringa"])
async def test_scadenza_autorizzazione_letta_in_ogni_formato(ambiente, scritta_come):
    from datetime import datetime, timezone
    fra_un_ora = int(time.time()) + 3600
    istante = datetime.fromtimestamp(fra_un_ora, tz=timezone.utc)
    valore = {
        "iso_con_fuso": istante.astimezone().isoformat(),
        "iso_zulu": istante.isoformat().replace("+00:00", "Z"),
        "epoch": fra_un_ora,
        "epoch_stringa": str(fra_un_ora),
    }[scritta_come]

    token = _token(ambiente["privata"], ambiente["kid"],
                   claims_extra={"authorization_valid_until": valore})
    identita = await _verifica(token, ambiente)
    assert abs(identita.autorizzazione_fino_a - fra_un_ora) <= 1


@pytest.mark.asyncio
async def test_autorizzazione_gia_scaduta_rifiutata(ambiente):
    """Il token puo essere valido, ma se l'autorizzazione e finita non si entra."""
    token = _token(ambiente["privata"], ambiente["kid"], claims_extra={
        "authorization_valid_until": int(time.time()) - 3600,
    })
    with pytest.raises(SSOError) as errore:
        await _verifica(token, ambiente)
    assert errore.value.codice == "autorizzazione_scaduta"


@pytest.mark.asyncio
@pytest.mark.parametrize("valore", [
    "quando sara",      # testo che non e una data
    "",                 # stringa vuota
    "   ",              # solo spazi
    True,               # un booleano non e una data
    {"fino_al": 123},   # oggetto al posto della data
    ["2027-01-01"],     # lista al posto della data
])
async def test_scadenza_illeggibile_rifiutata(ambiente, valore):
    """
    Il campo puo mancare, ma se c'e e non si legge non si entra: una scadenza
    illeggibile non deve valere come "nessuna scadenza".
    """
    token = _token(ambiente["privata"], ambiente["kid"],
                   claims_extra={"authorization_valid_until": valore})
    with pytest.raises(SSOError) as errore:
        await _verifica(token, ambiente)
    assert errore.value.codice == "autorizzazione_non_valida"


@pytest.mark.asyncio
async def test_senza_il_campo_si_entra(ambiente):
    """Il campo resta facoltativo: senza, l'accesso non ha vincoli di scadenza."""
    token = _token(ambiente["privata"], ambiente["kid"], claims_extra={})
    identita = await _verifica(token, ambiente)
    assert identita.autorizzazione_fino_a is None


@pytest.mark.asyncio
async def test_senza_scadenza_la_sessione_dura_quanto_di_consueto(ambiente, monkeypatch):
    sessione, _ = await _accedi(ambiente, monkeypatch, claims_extra={})
    durata = _durata_sessione(sessione)
    assert durata > 10 * 60, "senza vincoli la sessione usa la durata configurata"


@pytest.mark.asyncio
async def test_la_sessione_non_sopravvive_all_autorizzazione(ambiente, monkeypatch):
    """
    Se l'autorizzazione scade fra cinque minuti, la sessione dura cinque minuti
    e non la mezz'ora consueta.
    """
    fra_cinque_minuti = int(time.time()) + 300
    sessione, _ = await _accedi(ambiente, monkeypatch, claims_extra={
        "authorization_valid_until": fra_cinque_minuti,
    })
    durata = _durata_sessione(sessione)
    assert 240 <= durata <= 300, f"attesi circa 5 minuti, ottenuti {durata}s"


@pytest.mark.asyncio
async def test_autorizzazione_lontana_non_allunga_la_sessione(ambiente, monkeypatch):
    """La scadenza dell'autorizzazione accorcia la sessione, non la allunga."""
    fra_un_anno = int(time.time()) + 365 * 24 * 3600
    sessione, _ = await _accedi(ambiente, monkeypatch, claims_extra={
        "authorization_valid_until": fra_un_anno,
    })
    assert _durata_sessione(sessione) < 24 * 3600


@pytest.mark.asyncio
async def test_il_sub_di_previdenzapro_resta_nella_sessione(ambiente, monkeypatch):
    sessione, identita = await _accedi(ambiente, monkeypatch, claims_extra={})
    claims = jwt.decode(sessione, options={"verify_signature": False}, algorithms=["HS256"])
    assert claims["sso_sub"] == identita.sub
    assert claims["provider"] == "previdenzapro"


@pytest.mark.asyncio
async def test_il_jwks_viene_riusato_dalla_cache(ambiente):
    for _ in range(3):
        await _verifica(_token(ambiente["privata"], ambiente["kid"]), ambiente)
    assert ambiente["stato"]["letture"] == 1


@pytest.mark.asyncio
async def test_rotazione_chiave_rilegge_il_jwks(ambiente):
    """Un kid sconosciuto deve far rileggere il JWKS, non respingere l'utente."""
    await _verifica(_token(ambiente["privata"], ambiente["kid"]), ambiente)

    nuova = _coppia_chiavi()
    ambiente["stato"]["chiavi"]["chiave-2026-02"] = nuova

    identita = await _verifica(_token(nuova, "chiave-2026-02"), ambiente)
    assert identita.sub
    assert ambiente["stato"]["letture"] == 2


# --------------------------------------------------------------------------- #
# Token da rifiutare
# --------------------------------------------------------------------------- #

@pytest.mark.asyncio
async def test_firma_di_un_altro_rifiutata(ambiente):
    """Token ben formato ma firmato con una chiave che non e nel loro JWKS."""
    estranea = _coppia_chiavi()
    token = _token(estranea, ambiente["kid"])
    with pytest.raises(SSOError):
        await _verifica(token, ambiente)


@pytest.mark.asyncio
async def test_algoritmo_none_rifiutato(ambiente):
    """Il classico attacco: togliere la firma dichiarando alg=none."""
    claims = {
        "iss": EMITTENTE, "aud": DESTINATARIO, "sub": "x", "jti": str(uuid.uuid4()),
        "iat": int(time.time()), "exp": int(time.time()) + 60,
    }
    token = jwt.encode(claims, key=None, algorithm="none", headers={"kid": ambiente["kid"]})
    with pytest.raises(SSOError) as errore:
        await _verifica(token, ambiente)
    assert errore.value.codice == "algoritmo_non_ammesso"


@pytest.mark.asyncio
async def test_confusione_di_algoritmo_rifiutata(ambiente):
    """
    Token simmetrico che si spaccia per uno dei loro, con un kid valido.

    Se accettassimo l'algoritmo dichiarato dal token invece di imporre RS256,
    basterebbe conoscere il JWKS (che e pubblico) per fabbricare accessi.
    """
    claims = {
        "iss": EMITTENTE, "aud": DESTINATARIO, "sub": "x", "jti": str(uuid.uuid4()),
        "iat": int(time.time()), "exp": int(time.time()) + 60,
    }
    token = jwt.encode(claims, key="segreto-dell-attaccante", algorithm="HS256",
                       headers={"kid": ambiente["kid"]})
    with pytest.raises(SSOError) as errore:
        await _verifica(token, ambiente)
    assert errore.value.codice == "algoritmo_non_ammesso"


@pytest.mark.asyncio
async def test_token_scaduto_rifiutato(ambiente):
    token = _token(ambiente["privata"], ambiente["kid"], durata=10, eta=600)
    with pytest.raises(SSOError) as errore:
        await _verifica(token, ambiente)
    assert errore.value.codice == "token_scaduto"


@pytest.mark.asyncio
async def test_token_vecchio_ma_non_scaduto_rifiutato(ambiente):
    """
    Emesso un'ora fa con scadenza lunga: la convenzione e che i token nascano
    al momento dell'accesso, quindi non lo accettiamo.
    """
    token = _token(ambiente["privata"], ambiente["kid"], durata=7200, eta=3600)
    with pytest.raises(SSOError) as errore:
        await _verifica(token, ambiente)
    assert errore.value.codice == "token_scaduto"


@pytest.mark.asyncio
async def test_destinatario_di_un_altro_software_rifiutato(ambiente):
    token = _token(ambiente["privata"], ambiente["kid"], destinatario="altro-software")
    with pytest.raises(SSOError) as errore:
        await _verifica(token, ambiente)
    assert errore.value.codice == "destinatario_errato"


@pytest.mark.asyncio
async def test_emittente_sconosciuto_rifiutato(ambiente):
    token = _token(ambiente["privata"], ambiente["kid"], emittente="https://sito-non-nostro.it")
    with pytest.raises(SSOError) as errore:
        await _verifica(token, ambiente)
    assert errore.value.codice == "emittente_errato"


@pytest.mark.asyncio
async def test_token_senza_jti_rifiutato(ambiente):
    adesso = int(time.time())
    claims = {
        "iss": EMITTENTE, "aud": DESTINATARIO, "sub": "x",
        "iat": adesso, "exp": adesso + 60,
    }
    token = jwt.encode(claims, ambiente["privata"], algorithm="RS256", headers={"kid": ambiente["kid"]})
    with pytest.raises(SSOError) as errore:
        await _verifica(token, ambiente)
    assert errore.value.codice == "claim_mancante"


@pytest.mark.asyncio
async def test_token_senza_kid_rifiutato(ambiente):
    adesso = int(time.time())
    claims = {
        "iss": EMITTENTE, "aud": DESTINATARIO, "sub": "x", "jti": str(uuid.uuid4()),
        "iat": adesso, "exp": adesso + 60,
    }
    token = jwt.encode(claims, ambiente["privata"], algorithm="RS256")
    with pytest.raises(SSOError):
        await _verifica(token, ambiente)


@pytest.mark.asyncio
async def test_riuso_dello_stesso_token_rifiutato(ambiente):
    """Il token vale una volta sola: il secondo tentativo deve fallire."""
    token = _token(ambiente["privata"], ambiente["kid"])
    await _verifica(token, ambiente)
    with pytest.raises(SSOError) as errore:
        await _verifica(token, ambiente)
    assert errore.value.codice == "token_gia_usato"


@pytest.mark.asyncio
async def test_token_malformato_rifiutato(ambiente):
    with pytest.raises(SSOError):
        await _verifica("non-e-un-token", ambiente)


@pytest.mark.asyncio
async def test_sso_spento_rifiuta_tutto(ambiente, monkeypatch):
    monkeypatch.setenv("APP_SSO_ENABLED", "false")
    reset_sso_config()
    token = _token(ambiente["privata"], ambiente["kid"])
    with pytest.raises(SSOError) as errore:
        await _verifica(token, ambiente)
    assert errore.value.codice == "sso_non_configurato"


@pytest.mark.asyncio
async def test_jwks_non_raggiungibile_non_sembra_colpa_dell_utente(ambiente):
    async def rotto(_url):
        raise RuntimeError("connessione rifiutata")

    token = _token(ambiente["privata"], ambiente["kid"])
    with pytest.raises(SSOError) as errore:
        await sso_service.verifica_token(token, fetch_jwks=rotto)
    assert errore.value.codice == "jwks_non_raggiungibile"


# --------------------------------------------------------------------------- #
# Configurazione
# --------------------------------------------------------------------------- #

def test_origini_ammesse_lette_dalla_configurazione(monkeypatch):
    monkeypatch.setenv("APP_SSO_PARENT_ORIGINS", "https://staging.previdenzapro.it, https://app.previdenzapro.it/")
    reset_sso_config()
    config = get_sso_config()

    assert config.origine_ammessa("https://staging.previdenzapro.it") is True
    assert config.origine_ammessa("https://app.previdenzapro.it") is True
    assert config.origine_ammessa("https://previdenzapro.it.sito-finto.com") is False
    assert config.origine_ammessa(None) is False
    reset_sso_config()


def test_piano_predefinito_sovrascrivibile(monkeypatch):
    monkeypatch.setenv("APP_SSO_DEFAULT_PLAN", "free")
    reset_sso_config()
    assert get_sso_config().default_plan == "free"
    reset_sso_config()
