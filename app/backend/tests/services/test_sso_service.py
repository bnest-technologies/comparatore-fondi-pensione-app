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
