from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
import os
from backend.settings import settings
from backend.routes import (
    health, 
    auth, 
    users, 
    protected, 
    google_auth, 
    payments, 
    consent, 
    notifications, 
    feedback, 
    admin,
    admin_feedback,
    funds,
    simulator,
    content,
    rendite
)
from backend.middleware.request_id import RequestIDMiddleware
from backend.middleware.logging import LoggingMiddleware
from backend.middleware.security_headers import SecurityHeadersMiddleware
from backend.providers.firebase_auth import initialize_firebase_app


app = FastAPI(title="Webapp Factory API", version="1.0.0")

import logging
logger = logging.getLogger("uvicorn.error")


@app.on_event("startup")
def log_startup_info():
    try:
        # Initialize Firebase Admin SDK
        initialize_firebase_app()
        logger.info("Firebase Admin SDK initialized")
        
        # Print some auth-related configuration so users can see missing values at startup
        client_id = getattr(settings, 'GOOGLE_CLIENT_ID', None)
        client_secret_present = bool(getattr(settings, 'GOOGLE_CLIENT_SECRET', None))
        try:
            from backend.services.auth_service import _get_redirect_uri

            redirect_uri = _get_redirect_uri("google")
        except Exception:
            redirect_uri = None
        logger.info("Auth startup: GOOGLE_CLIENT_ID=%s GOOGLE_CLIENT_SECRET_PRESENT=%s OAUTH_REDIRECT_URI=%s", client_id, client_secret_present, redirect_uri)
    except Exception:
        logger.exception("Failed to log startup auth info")

# Add security headers middleware
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestIDMiddleware)
app.add_middleware(LoggingMiddleware)
# compressione delle risposte grandi (tavole delle rendite per il confronto: ~570 KB -> ~100 KB)
app.add_middleware(GZipMiddleware, minimum_size=2048)
allow_origin_regex = os.getenv("APP_CORS_ALLOW_ORIGIN_REGEX")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=allow_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router, prefix="/auth", tags=["auth"])
# New Google OAuth routes with GIS popup flow
app.include_router(google_auth.router, prefix="/auth", tags=["auth", "google"])
app.include_router(users.router, prefix="/users", tags=["users"])
app.include_router(payments.router, prefix="/payments", tags=["payments"])

# Feature-specific routes with role-based access control
app.include_router(funds.router, prefix="/api", tags=["funds"])  # Fund comparison
app.include_router(simulator.router, prefix="/api", tags=["simulator"])  # Pension simulator
app.include_router(content.router, prefix="/api", tags=["content"])  # Guides & FAQ
app.include_router(admin.router, prefix="/api", tags=["admin"])  # Admin management
app.include_router(admin_feedback.router, prefix="/api", tags=["admin", "feedback"])  # Admin feedback
app.include_router(rendite.router, prefix="/api", tags=["rendite"])  # Coefficienti di rendita (premium)

# Legacy routes
app.include_router(protected.router)
app.include_router(consent.router)
app.include_router(notifications.router)
app.include_router(feedback.router)

# Prometheus metrics endpoint
from prometheus_client import make_asgi_app
metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)
