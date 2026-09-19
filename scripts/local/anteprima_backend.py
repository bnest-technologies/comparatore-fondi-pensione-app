# -*- coding: utf-8 -*-
"""
Backend in ANTEPRIMA LOCALE, senza credenziali: simula un utente gia autenticato.

Serve a vedere il sito sul proprio computer come lo vede un abbonato (o un utente Free),
senza login Google, senza segreti e senza toccare il database degli utenti.

    python scripts/local/anteprima_backend.py            # utente Full Access
    python scripts/local/anteprima_backend.py --free     # utente Free

Poi, in un altro terminale:
    cd app/frontend && VITE_API_BASE=http://localhost:8000 npx vite --port 5173

NON e codice dell'applicazione: il Dockerfile copia solo app/backend, questo file non
finisce mai online. Le sostituzioni valgono solo per il processo avviato da qui.
"""
import os
import sys
from pathlib import Path

RADICE = Path(__file__).resolve().parents[2]
BACKEND = RADICE / "app" / "backend"
sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)

GRATUITO = "--free" in sys.argv
os.environ.setdefault("APP_ENV", "development")
os.environ.setdefault("APP_JWT_SECRET", "anteprima-locale-segreto-lungo-almeno-32-caratteri")
os.environ.setdefault("APP_JWT_SECRET_KEY", os.environ["APP_JWT_SECRET"])
os.environ.setdefault("APP_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")

import main                                   # noqa: E402  (dopo aver impostato l'ambiente)
from backend.auth import auth_required        # noqa: E402
from backend.auth.models import AuthClaims    # noqa: E402
from schemas.user import UserProfile          # noqa: E402

UTENTE = {
    "id": "anteprima-locale",
    "email": "anteprima@example.com",
    "name": "Anteprima locale",
    "picture": None,
    "roles": ["free"] if GRATUITO else ["subscriber"],
    "plan": "free" if GRATUITO else "full-access",
    "status": "active",
}
PROFILO = UserProfile(**UTENTE)


async def utente_corrente(request=None):
    return dict(UTENTE)


async def profilo(user_id: str):
    return PROFILO


def claims():
    return AuthClaims(sub=UTENTE["id"], email=UTENTE["email"], roles=UTENTE["roles"], plan=UTENTE["plan"])


# sostituisce la lettura dell'utente in ogni modulo che l'ha importata
for nome, modulo in list(sys.modules.items()):
    if modulo is None:
        continue
    if hasattr(modulo, "get_current_user") and callable(getattr(modulo, "get_current_user")):
        setattr(modulo, "get_current_user", utente_corrente)
    if nome.endswith("user_service") and hasattr(modulo, "get_user_by_id"):
        setattr(modulo, "get_user_by_id", profilo)

main.app.dependency_overrides[auth_required] = claims

if __name__ == "__main__":
    import uvicorn
    tipo = "Free" if GRATUITO else "Full Access"
    print(f"\n  Anteprima locale: utente {tipo} simulato su http://localhost:8000\n")
    uvicorn.run(main.app, host="127.0.0.1", port=8000, log_level="warning")
