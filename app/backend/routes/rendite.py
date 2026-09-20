"""
Rendite Routes - coefficienti di conversione del montante in rendita.

Contenuto premium. La distinzione fra i due endpoint e voluta:

  /api/rendite/disponibilita  -> aperto a tutti: dice COSA c'e, non i valori.
                                 Serve al simulatore per dichiarare la copertura
                                 a chi non e abbonato, senza mostrare cifre.
  /api/rendite/{albo}         -> solo abbonati: le tavole vere.

I coefficienti non entrano nel bundle del frontend: sono decine di migliaia di
valori e rallenterebbero il caricamento per tutti, anche per chi non apre mai la
sezione. Vengono serviti un fondo per volta, solo quando servono.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from typing import Optional, Dict, Any
from pathlib import Path
import json
import logging

from backend.auth import auth_required
from backend.auth.models import AuthClaims
from backend.auth.roles import Permission, UserRole, UserStatus, can_access_feature
from backend.services import user_service

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/rendite", tags=["rendite"])

# Prodotto dalla pipeline di estrazione e validazione. Sta in app/backend/data perche
# il Dockerfile copia solo app/backend: fuori da qui il container non lo vedrebbe.
DB_PATH = Path(__file__).resolve().parents[1] / "data" / "rendite_database.json"

_cache: Optional[Dict[str, Any]] = None


def _database() -> Dict[str, Any]:
    """Carica il database una volta sola: e un file statico, cambia solo coi rilasci."""
    global _cache
    if _cache is None:
        if not DB_PATH.exists():
            logger.warning("Database rendite non trovato in %s", DB_PATH)
            _cache = {"manifest": {}, "fondi": {}}
        else:
            with open(DB_PATH, encoding="utf-8") as f:
                _cache = json.load(f)
            logger.info("Database rendite caricato: %d fondi", len(_cache.get("fondi", {})))
    return _cache


async def _is_subscriber(claims: AuthClaims) -> bool:
    profile = await user_service.get_user_by_id(claims.sub)
    if not profile:
        return False
    role = UserRole.FREE
    if "admin" in profile.roles:
        role = UserRole.ADMIN
    elif "subscriber" in profile.roles:
        role = UserRole.SUBSCRIBER
    user_status = UserStatus(profile.status or "pending")
    # Il frontend sblocca i contenuti premium col piano 'full-access' attivo: se un
    # amministratore aggiorna solo il piano e non il ruolo, il cliente non deve
    # vedere la sezione aperta e ricevere un rifiuto dal server.
    if getattr(profile, "plan", None) == "full-access" and user_status == UserStatus.ACTIVE:
        return True
    # in assenza di un permesso dedicato si riusa quello dei fondi completi:
    # le rendite sono contenuto premium allo stesso titolo
    return can_access_feature(role, user_status, Permission.VIEW_ALL_FUNDS)


def _riepilogo_fondo(fondo: Dict[str, Any]) -> Dict[str, Any]:
    """Cosa si puo dire di un fondo senza rivelare un solo coefficiente."""
    tipologie, tassi, sessi = set(), set(), set()
    n_tabelle = 0
    eta_min, eta_max = None, None
    for conv in fondo.get("convenzioni", []):
        for s in conv.get("set", []):
            for t in s.get("tabelle", []):
                n_tabelle += 1
                if t.get("tipologia"):
                    tipologie.add(t["tipologia"])
                if t.get("tasso_tecnico") is not None:
                    tassi.add(t["tasso_tecnico"])
                if t.get("sesso"):
                    sessi.add(t["sesso"])
                righe = t.get("righe") or []
                eta = [r[0] for r in righe if isinstance(r, list) and r]
                if eta:
                    eta_min = min(eta) if eta_min is None else min(eta_min, min(eta))
                    eta_max = max(eta) if eta_max is None else max(eta_max, max(eta))
    return {
        "disponibile": n_tabelle > 0 and fondo.get("file_pertinente") is not False,
        "tipologie": sorted(tipologie),
        "tassi_tecnici": sorted(tassi),
        "distingue_sesso": "M" in sessi or "F" in sessi,
        "eta_minima": eta_min,
        "eta_massima": eta_max,
        "n_tabelle": n_tabelle,
    }


@router.get("/disponibilita")
async def disponibilita(albo: Optional[str] = None):
    """
    Cosa copre il servizio. Aperto di proposito: e l'informazione che permette a
    chi non e abbonato di sapere che il dato esiste, senza vederne il valore.
    """
    db = _database()
    fondi = db.get("fondi", {})

    if albo:
        chiave = str(albo).lstrip("0") or "0"
        fondo = fondi.get(chiave)
        if not fondo:
            return {"albo": chiave, "disponibile": False,
                    "motivo": "il fondo non pubblica tavole dei coefficienti"}
        return {"albo": chiave, **_riepilogo_fondo(fondo)}

    con_dati = [a for a, f in fondi.items() if _riepilogo_fondo(f)["disponibile"]]
    return {
        "fondi_coperti": len(con_dati),
        "albi_coperti": sorted(con_dati, key=lambda x: int(x) if x.isdigit() else 0),
        "aggiornamento": db.get("manifest", {}).get("ultimo_aggiornamento"),
    }


@router.get("/{albo}")
async def coefficienti(albo: str, claims: AuthClaims = Depends(auth_required)):
    """Le tavole di un singolo fondo. Un fondo per chiamata: mai l'intero database."""
    if not await _is_subscriber(claims):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "subscription_required",
                "message": "I coefficienti di rendita sono riservati agli abbonati.",
                "disponibilita": "/api/rendite/disponibilita",
            },
        )

    chiave = str(albo).lstrip("0") or "0"
    fondo = _database().get("fondi", {}).get(chiave)
    if not fondo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Nessun coefficiente disponibile per il fondo con albo {chiave}",
        )
    return fondo


@router.post("/ricarica")
async def ricarica(claims: AuthClaims = Depends(auth_required)):
    """Ricarica il database dopo un aggiornamento dei dati. Solo amministratori."""
    profile = await user_service.get_user_by_id(claims.sub)
    if not profile or "admin" not in profile.roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Riservato agli amministratori")
    global _cache
    _cache = None
    db = _database()
    return {"ricaricato": True, "fondi": len(db.get("fondi", {}))}
