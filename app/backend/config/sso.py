"""
Configurazione del single sign-on con PrevidenzaPro.

Il comparatore accetta identita emesse da un sistema esterno (oggi PrevidenzaPro,
domani altri software della stessa piattaforma). Ogni parametro si legge da
variabile d'ambiente, cosi lo stesso codice vale per staging e produzione.

Variabili (prefisso APP_SSO_):
    APP_SSO_ENABLED            "true" per accettare gli accessi SSO
    APP_SSO_ISSUER             valore atteso nel claim "iss"
    APP_SSO_AUDIENCE           valore atteso nel claim "aud" (il comparatore)
    APP_SSO_JWKS_URL           indirizzo del JWKS con le chiavi pubbliche
    APP_SSO_JWKS_TTL_SECONDS   durata della cache del JWKS (default 3600)
    APP_SSO_JWKS_MIN_REFETCH   intervallo minimo fra due riletture forzate del
                               JWKS, in secondi (default 60)
    APP_SSO_LEEWAY_SECONDS     tolleranza sullo scarto di orologio (default 60)
    APP_SSO_MAX_TOKEN_AGE      eta massima del token in secondi (default 120)
    APP_SSO_PARENT_ORIGINS     origini autorizzate a incorporare il comparatore,
                               separate da virgola
    APP_SSO_CLAIM_EMAIL        nome del claim con l'email (default "email")
    APP_SSO_CLAIM_EMAIL_VERIFIED  default "email_verified"
    APP_SSO_CLAIM_NAME         nome del claim con il nome (default "name")
    APP_SSO_CLAIM_PLAN         claim facoltativo con il livello di accesso
    APP_SSO_CLAIM_AUTH_UNTIL   claim con la scadenza dell'autorizzazione
                               (default "authorization_valid_until")
    APP_SSO_DEFAULT_PLAN       piano assegnato quando il claim non c'e
                               (default "full-access")
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from typing import List


def _flag(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _intero(name: str, default: int) -> int:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _elenco(name: str) -> List[str]:
    raw = os.getenv(name) or ""
    return [v.strip().rstrip("/") for v in raw.split(",") if v.strip()]


@dataclass(frozen=True)
class SSOConfig:
    enabled: bool = False
    issuer: str = ""
    audience: str = ""
    jwks_url: str = ""
    jwks_ttl_seconds: int = 3600
    jwks_min_refetch_seconds: int = 60
    leeway_seconds: int = 60
    max_token_age_seconds: int = 120
    parent_origins: List[str] = field(default_factory=list)
    claim_email: str = "email"
    claim_email_verified: str = "email_verified"
    claim_name: str = "name"
    claim_plan: str = ""
    claim_authorization_until: str = "authorization_valid_until"
    default_plan: str = "full-access"

    @property
    def configurato(self) -> bool:
        """True quando ci sono tutti i parametri per verificare un token."""
        return bool(self.enabled and self.issuer and self.audience and self.jwks_url)

    def origine_ammessa(self, origin: str | None) -> bool:
        if not origin:
            return False
        return origin.rstrip("/") in self.parent_origins


@lru_cache(maxsize=1)
def get_sso_config() -> SSOConfig:
    return SSOConfig(
        enabled=_flag("APP_SSO_ENABLED", False),
        issuer=(os.getenv("APP_SSO_ISSUER") or "").strip(),
        audience=(os.getenv("APP_SSO_AUDIENCE") or "").strip(),
        jwks_url=(os.getenv("APP_SSO_JWKS_URL") or "").strip(),
        jwks_ttl_seconds=_intero("APP_SSO_JWKS_TTL_SECONDS", 3600),
        jwks_min_refetch_seconds=_intero("APP_SSO_JWKS_MIN_REFETCH", 60),
        leeway_seconds=_intero("APP_SSO_LEEWAY_SECONDS", 60),
        max_token_age_seconds=_intero("APP_SSO_MAX_TOKEN_AGE", 120),
        parent_origins=_elenco("APP_SSO_PARENT_ORIGINS"),
        claim_email=(os.getenv("APP_SSO_CLAIM_EMAIL") or "email").strip(),
        claim_email_verified=(os.getenv("APP_SSO_CLAIM_EMAIL_VERIFIED") or "email_verified").strip(),
        claim_name=(os.getenv("APP_SSO_CLAIM_NAME") or "name").strip(),
        claim_plan=(os.getenv("APP_SSO_CLAIM_PLAN") or "").strip(),
        claim_authorization_until=(
            os.getenv("APP_SSO_CLAIM_AUTH_UNTIL") or "authorization_valid_until").strip(),
        default_plan=(os.getenv("APP_SSO_DEFAULT_PLAN") or "full-access").strip(),
    )


def reset_sso_config() -> None:
    """Svuota la cache: serve ai test che cambiano le variabili d'ambiente."""
    get_sso_config.cache_clear()
