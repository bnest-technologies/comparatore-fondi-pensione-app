"""
Rotte per l'accesso con identita PrevidenzaPro.

    POST /auth/sso/exchange   scambia un token PrevidenzaPro con la nostra sessione
    GET  /auth/sso/config     dice al frontend se l'accesso SSO e disponibile
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from backend.config.sso import get_sso_config
from backend.schemas.user import UserPublic
from backend.services import sso_service
from backend.services.sso_service import SSOError

logger = logging.getLogger(__name__)

router = APIRouter()

# Quali errori sono colpa di chi chiama e quali di come e configurato il servizio.
CODICI_NON_CONFIGURATO = {"sso_non_configurato"}
CODICI_SERVIZIO = {"jwks_non_raggiungibile", "jwks_vuoto"}


class RichiestaScambio(BaseModel):
    token: str = Field(..., min_length=20, max_length=8192, description="JWT emesso da PrevidenzaPro")


class RispostaScambio(BaseModel):
    token: str = Field(..., description="Sessione del comparatore, da usare come Bearer")
    user: UserPublic


class RispostaConfigSSO(BaseModel):
    enabled: bool
    parent_origins: list[str]


@router.get("/sso/config", response_model=RispostaConfigSSO)
async def config_sso() -> RispostaConfigSSO:
    """
    Stato dell'integrazione su questo ambiente.

    Non espone ne l'emittente ne l'indirizzo del JWKS: al frontend serve solo
    sapere se puo tentare l'accesso incorporato e da quali pagine accettare i
    messaggi.
    """
    config = get_sso_config()
    return RispostaConfigSSO(enabled=config.configurato, parent_origins=config.parent_origins)


@router.post("/sso/exchange", response_model=RispostaScambio)
async def scambia_token(richiesta: RichiestaScambio) -> RispostaScambio:
    """
    Verifica il token di PrevidenzaPro ed emette la sessione del comparatore.

    Il token vale pochi secondi e una sola volta: un secondo tentativo con lo
    stesso token viene rifiutato.
    """
    try:
        sessione, profilo = await sso_service.accedi_con_sso(richiesta.token)
    except SSOError as exc:
        if exc.codice in CODICI_NON_CONFIGURATO:
            logger.error("Tentativo di accesso SSO su un ambiente senza configurazione")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Accesso da PrevidenzaPro non disponibile su questo ambiente",
            ) from exc
        if exc.codice in CODICI_SERVIZIO:
            logger.error("Verifica SSO non possibile: %s", exc.motivo)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Verifica dell'identita momentaneamente non disponibile",
            ) from exc

        # Il motivo preciso resta nei log: a chi chiama diciamo solo che non va.
        logger.warning("Token SSO rifiutato (%s): %s", exc.codice, exc.motivo)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Accesso non valido o scaduto",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Errore inatteso durante lo scambio del token SSO")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Errore durante l'accesso",
        ) from exc

    return RispostaScambio(
        token=sessione,
        user=UserPublic(
            id=profilo.id,
            email=profilo.email,
            name=profilo.name,
            picture=profilo.picture,
            roles=profilo.roles or ["user"],
            plan=profilo.plan,
            status=profilo.status,
            credits=profilo.credits or 0,
        ),
    )
