from dataclasses import dataclass
from typing import Optional, Dict, Any, List
import jwt
import base64
import json
import os
import secrets
import time
import httpx
from urllib.parse import urlencode
from fastapi import HTTPException
from ..settings import settings
from ..services import user_service
from ..schemas.user import UserProfileCreate
from ..services.admin_notification_service import get_admin_notification_service
from config.auth import AuthMode
import logging

logger = logging.getLogger("uvicorn.error")


@dataclass
class Session:
    token: str


@dataclass
class OAuthProvider:
    """OAuth provider configuration"""
    name: str
    authorization_url: str
    token_url: str
    user_info_url: str
    scopes: list[str]
    client_id_env: str
    client_secret_env: str
    
    def get_credentials(self) -> tuple[str, str]:
        """Get client ID and secret from environment"""
        # Try APP_ prefixed env vars first (project convention), then plain env names
        app_prefixed_id = f"APP_{self.client_id_env}"
        app_prefixed_secret = f"APP_{self.client_secret_env}"

        client_id = os.getenv(app_prefixed_id) or os.getenv(self.client_id_env)
        client_secret = os.getenv(app_prefixed_secret) or os.getenv(self.client_secret_env)

        # Fallback to settings for backward-compatible configuration (e.g. Settings.GOOGLE_CLIENT_ID)
        if not client_id:
            # settings has backward-compat properties like GOOGLE_CLIENT_ID
            try:
                client_id = getattr(settings, self.client_id_env, None)
            except Exception:
                client_id = None

        if not client_secret:
            try:
                client_secret = getattr(settings, self.client_secret_env, None)
            except Exception:
                client_secret = None

        if not client_id or not client_secret:
            missing = []
            if not client_id:
                missing.append(f"{app_prefixed_id} or {self.client_id_env}")
            if not client_secret:
                missing.append(f"{app_prefixed_secret} or {self.client_secret_env}")
            raise HTTPException(
                status_code=500,
                detail=(
                    f"{self.name} OAuth is not configured. Missing: {', '.join(missing)}. "
                    "Set the environment variables or configure auth in settings."
                ),
            )

        return client_id, client_secret


# Provider configurations
OAUTH_PROVIDERS: Dict[str, OAuthProvider] = {
    "google": OAuthProvider(
        name="Google",
        authorization_url="https://accounts.google.com/o/oauth2/v2/auth",
        token_url="https://oauth2.googleapis.com/token",
        user_info_url="https://www.googleapis.com/oauth2/v2/userinfo",
        scopes=["openid", "email", "profile"],
        client_id_env="GOOGLE_CLIENT_ID",
        client_secret_env="GOOGLE_CLIENT_SECRET",
    )
}


def _normalize_plan(plan: Optional[str], fallback: str = "free") -> str:
    if not plan:
        return fallback
    normalized = str(plan).strip().lower().replace(" ", "-")
    return normalized or fallback


def _build_anonymous_user(plan: Optional[str] = None) -> Dict[str, Any]:
    """Return a synthetic user payload for no-auth environments."""
    fallback_plan = plan or "free"
    return {
        "id": os.getenv("APP_AUTH_NOAUTH_USER_ID", "anonymous"),
        "email": os.getenv("APP_AUTH_NOAUTH_EMAIL", "demo@example.com"),
        "name": os.getenv("APP_AUTH_NOAUTH_NAME", "Demo User"),
        "picture": None,
        "roles": ["user"],
        "plan": _normalize_plan(fallback_plan, fallback_plan),
    }


def _get_jwt_runtime_settings() -> tuple[str, str, int, Optional[str], Optional[str]]:
    """Return secret, algorithm, expiration (minutes), audience, issuer."""
    jwt_secret = (
        os.getenv("APP_JWT_SECRET")
        or os.getenv("APP_JWT_SECRET_KEY")
        or "dev-secret-key"
    )
    jwt_algorithm = os.getenv("APP_JWT_ALGORITHM", "HS256")
    # Parse expiration minutes safely: environment may contain placeholders or invalid values
    jwt_expire_raw = os.getenv("APP_JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "60")
    try:
        jwt_expire_minutes = int(str(jwt_expire_raw))
    except Exception:
        logger.warning(
            "Invalid APP_JWT_ACCESS_TOKEN_EXPIRE_MINUTES value '%s', falling back to default 60",
            jwt_expire_raw,
        )
        jwt_expire_minutes = 60
    jwt_audience = os.getenv("APP_JWT_AUDIENCE")
    jwt_issuer = os.getenv("APP_JWT_ISSUER")

    auth_config = getattr(settings, "auth_config", None)
    if auth_config and auth_config.jwt:
        jwt_secret = auth_config.jwt.secret_key
        jwt_algorithm = auth_config.jwt.algorithm
        jwt_expire_minutes = auth_config.jwt.access_token_expire_minutes
        jwt_audience = getattr(auth_config.jwt, "audience", jwt_audience)
        jwt_issuer = getattr(auth_config.jwt, "issuer", jwt_issuer)

    return jwt_secret, jwt_algorithm, jwt_expire_minutes, jwt_audience, jwt_issuer


def create_session_token(
    *,
    user_id: str,
    email: Optional[str],
    name: Optional[str],
    picture: Optional[str],
    provider: str,
    roles: Optional[List[str]] = None,
    plan: Optional[str] = None,
    extra_claims: Optional[Dict[str, Any]] = None,
    expires_at: Optional[int] = None,
) -> str:
    """
    Create a signed JWT containing session data for the user.

    `expires_at` (epoch seconds) caps the session: the token never lives past
    that moment, even if the configured session length would be longer. Used by
    the PrevidenzaPro SSO, where the session must not outlive the authorization.
    """

    jwt_secret, jwt_algorithm, jwt_expire_minutes, jwt_audience, jwt_issuer = _get_jwt_runtime_settings()
    
    logger.debug(f"[create_session_token] Creating token for user_id={user_id}")
    logger.debug(f"[create_session_token] Using JWT secret (first 10 chars): {jwt_secret[:10]}...")
    logger.debug(f"[create_session_token] Using JWT algorithm: {jwt_algorithm}")
    logger.debug(f"[create_session_token] Expire minutes: {jwt_expire_minutes}")
    logger.debug(f"[create_session_token] Audience: {jwt_audience}, Issuer: {jwt_issuer}")
    
    issued_at = int(time.time())
    expires = issued_at + jwt_expire_minutes * 60
    if expires_at is not None:
        expires = min(expires, int(expires_at))
    normalized_plan = _normalize_plan(plan or "free", plan or "free")
    claims: Dict[str, Any] = {
        "sub": user_id,
        "email": email,
        "name": name,
        "picture": picture,
        "provider": provider,
        "roles": roles or ["user"],
        "plan": normalized_plan,
        "iat": issued_at,
        "exp": expires,
    }

    if jwt_audience:
        claims["aud"] = jwt_audience
    if jwt_issuer:
        claims["iss"] = jwt_issuer
    if extra_claims:
        claims.update(extra_claims)

    return jwt.encode(claims, jwt_secret, algorithm=jwt_algorithm)


def get_provider(provider_name: str) -> OAuthProvider:
    """Get OAuth provider configuration by name"""
    provider = OAUTH_PROVIDERS.get(provider_name.lower())
    if not provider:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown OAuth provider: {provider_name}. Supported providers: {', '.join(OAUTH_PROVIDERS.keys())}"
        )
    return provider


def _get_redirect_uri(provider_name: str) -> str:
    """Resolve redirect URI using environment or settings without hardcoded defaults.

    Order of precedence:
      1. APP_OAUTH_REDIRECT_URI_TEMPLATE (supports '{provider}')
      2. APP_OAUTH_REDIRECT_URI
      3. settings.OAUTH_REDIRECT_URI

    If the chosen value contains '{provider}' it will be formatted. If it ends with
    '/auth/callback' but doesn't include provider, the provider segment will be
    inserted (e.g. '/auth/callback' -> '/auth/{provider}/callback').
    """
    template_from_env_template = os.getenv("APP_OAUTH_REDIRECT_URI_TEMPLATE")
    template_from_env_explicit = os.getenv("APP_OAUTH_REDIRECT_URI")
    template_from_settings = getattr(settings, "OAUTH_REDIRECT_URI", None)
    template = template_from_env_template or template_from_env_explicit or template_from_settings
    template_source = (
        "APP_OAUTH_REDIRECT_URI_TEMPLATE"
        if template_from_env_template
        else "APP_OAUTH_REDIRECT_URI"
        if template_from_env_explicit
        else "settings.OAUTH_REDIRECT_URI"
    )

    if not template:
        raise HTTPException(
            status_code=500,
            detail=(
                "OAuth redirect URI is not configured. Set APP_OAUTH_REDIRECT_URI_TEMPLATE or "
                "APP_OAUTH_REDIRECT_URI or configure auth.oauth_redirect_uri in settings."
            ),
        )

    # If template contains formatting placeholder, use it
    if "{provider}" in template:
        try:
            resolved = template.format(provider=provider_name)
            logger.info(
                "OAuth redirect URI resolved provider=%s source=%s template=%s resolved=%s",
                provider_name,
                template_source,
                template,
                resolved,
            )
            return resolved
        except Exception:
            raise HTTPException(status_code=500, detail="Invalid APP_OAUTH_REDIRECT_URI_TEMPLATE format")

    # If template is a generic callback path, insert provider segment
    if template.endswith("/auth/callback"):
        resolved = template.replace("/auth/callback", f"/auth/{provider_name}/callback")
        logger.info(
            "OAuth redirect URI resolved provider=%s source=%s template=%s resolved=%s",
            provider_name,
            template_source,
            template,
            resolved,
        )
        return resolved

    # If template ends with slash, append provider callback
    if template.endswith("/"):
        resolved = template.rstrip("/") + f"/auth/{provider_name}/callback"
        logger.info(
            "OAuth redirect URI resolved provider=%s source=%s template=%s resolved=%s",
            provider_name,
            template_source,
            template,
            resolved,
        )
        return resolved

    # Otherwise, return as-is (assume provider-specific registration handled externally)
    logger.info(
        "OAuth redirect URI resolved provider=%s source=%s template=%s resolved=%s",
        provider_name,
        template_source,
        template,
        template,
    )
    return template


def build_login_url(provider_name: str, redirect: str) -> str:
    """
    Build OAuth authorization URL for any provider.
    
    Args:
        provider_name: OAuth provider (google, github, slack, etc.)
        redirect: The frontend URL to redirect back to after OAuth
        
    Returns:
        OAuth authorization URL
    """
    provider = get_provider(provider_name)
    client_id, _ = provider.get_credentials()
    
    # Resolve redirect URI from env/settings (no hardcoded defaults)
    redirect_uri = _get_redirect_uri(provider_name)

    # The route accepts a `redirect` query param (frontend where to land after auth)
    # but the provider needs a server-side redirect URI that matches the one
    # registered in the OAuth app. Warn if the caller passed a frontend redirect
    # and it doesn't match our resolved server redirect URI (common source of 400s).
    if redirect and redirect != redirect_uri:
        logger.debug("OAuth login: caller provided redirect '%s' which differs from server redirect_uri '%s'", redirect, redirect_uri)
    
    # Encode redirect into `state` so the callback can postMessage back to the
    # correct frontend origin (e.g. Firebase Hosting preview channels).
    state_payload: Dict[str, Any] = {
        "csrf": secrets.token_urlsafe(32),
        "redirect": redirect,
    }
    state = base64.urlsafe_b64encode(json.dumps(state_payload).encode("utf-8")).decode("utf-8").rstrip("=")
    
    # Build authorization URL
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(provider.scopes),
        "state": state,
    }
    
    # Provider-specific parameters
    if provider_name == "google":
        params.update({
            "access_type": "offline",
            "prompt": "consent",
        })
    auth_url = f"{provider.authorization_url}?{urlencode(params)}"
    logger.info(
        "OAuth login params provider=%s authorize_host=%s client_id=%s redirect_uri=%s redirect_param=%s scope=%s",
        provider_name,
        provider.authorization_url,
        client_id,
        redirect_uri,
        redirect,
        " ".join(provider.scopes),
    )
    return auth_url


async def exchange_code(provider_name: str, code: str, state: str) -> Session:
    """
    Exchange authorization code for access token and create session.
    
    Args:
        provider_name: OAuth provider (google, github, slack, etc.)
        code: Authorization code from provider
        state: State parameter for CSRF protection
        
    Returns:
        Session with JWT token
    """
    provider = get_provider(provider_name)
    client_id, client_secret = provider.get_credentials()
    
    redirect_uri = _get_redirect_uri(provider_name)
    
    # TODO: Validate state parameter against stored value (requires session/cache)
    
    # Exchange code for tokens
    token_data = {
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }
    
    # DEBUG: Log token exchange details (without logging secrets)
    logger.info(
        "🔍 DEBUG Token Exchange (auth_service): client_id=%s redirect_uri=%s code_length=%s secret_length=%s",
        client_id,
        redirect_uri,
        len(code) if code else 0,
        len(client_secret) if client_secret else 0
    )
    
    async with httpx.AsyncClient() as client:
        # Get access token
        headers = {"Accept": "application/json"}
        
        # GitHub requires specific accept header
        if provider_name == "github":
            headers["Accept"] = "application/json"
        
        token_response = await client.post(
            provider.token_url,
            data=token_data,
            headers=headers
        )
        # Log response details for debugging (redirect_uri mismatch or invalid client credentials
        # commonly produce 4xx responses here). Keep logs concise but include provider body.
        if token_response.status_code != 200:
            logger.error("Token exchange failed for provider %s: status=%s body=%s", provider_name, token_response.status_code, token_response.text)
            raise HTTPException(
                status_code=400,
                detail=f"Failed to exchange code for token: {token_response.text}"
            )
        
        tokens = token_response.json()
        access_token = tokens.get("access_token")
        
        if not access_token:
            raise HTTPException(status_code=400, detail="No access token received")
        
        # Get user info from provider
        try:
            user_info = await _get_user_info(client, provider, access_token)
        except HTTPException as e:
            logger.error("Failed to fetch user info for provider %s: %s", provider_name, getattr(e, 'detail', e))
            raise
    
    # Normalize user info across providers
    normalized_user = _normalize_user_info(provider_name, user_info)

    # Persist user profile in Firestore so downstream services can access it
    token_roles: List[str] = ["user"]
    token_plan = "free"
    token_status: Optional[str] = None

    if normalized_user.get("email"):
        try:
            profile = UserProfileCreate(
                id=normalized_user["id"],
                email=normalized_user["email"],
                name=normalized_user.get("name"),
                picture=normalized_user.get("picture"),
            )
            # Check if user exists before upsert to detect new registrations
            existing_user = await user_service.get_user_by_id(normalized_user["id"])
            is_new_user = existing_user is None

            persisted_profile = await user_service.upsert_user(profile, mark_login=True)
            if persisted_profile:
                token_roles = persisted_profile.roles or token_roles
                token_plan = persisted_profile.plan or token_plan
                token_status = persisted_profile.status
            logger.info(
                "Firestore profile upserted (auth_service) user_id=%s email=%s roles=%s plan=%s status=%s is_new=%s",
                normalized_user["id"],
                normalized_user.get("email"),
                token_roles,
                token_plan,
                token_status,
                is_new_user,
            )

            # Send Telegram notification for new non-admin users
            if persisted_profile and is_new_user and "admin" not in (persisted_profile.roles or []):
                try:
                    notification_svc = get_admin_notification_service()
                    await notification_svc.notify_new_pending_user(persisted_profile)
                    logger.info("Sent Telegram notification for new user %s", normalized_user["id"])
                except Exception as notif_exc:
                    logger.error("Failed to send Telegram notification: %s", notif_exc)
        except Exception:  # noqa: BLE001
            logger.exception(
                "Failed to upsert user profile in Firestore for user_id=%s",
                normalized_user.get("id"),
            )
    else:
        logger.warning(
            "Skipping Firestore profile upsert because email missing for user_id=%s",
            normalized_user.get("id"),
        )
    
    token = create_session_token(
        user_id=normalized_user["id"],
        email=normalized_user.get("email"),
        name=normalized_user.get("name"),
        picture=normalized_user.get("picture"),
        provider=provider_name,
        roles=token_roles,
        plan=token_plan,
        extra_claims={"status": token_status} if token_status else None,
    )
    
    return Session(token=token)


async def _get_user_info(client: httpx.AsyncClient, provider: OAuthProvider, access_token: str) -> Dict[str, Any]:
    """Get user info from OAuth provider"""
    headers = {"Authorization": f"Bearer {access_token}"}
    
    # GitHub requires User-Agent header
    if provider.name == "GitHub":
        headers["User-Agent"] = "Webapp-Factory"
    
    user_response = await client.get(provider.user_info_url, headers=headers)
    if user_response.status_code != 200:
        logger.error("User info request failed for provider %s: status=%s body=%s", provider.name, user_response.status_code, user_response.text)
        raise HTTPException(
            status_code=400,
            detail=f"Failed to get user info: {user_response.text}"
        )
    
    return user_response.json()


def _normalize_user_info(provider_name: str, user_info: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize user info across different OAuth providers"""
    
    if provider_name == "google":
        return {
            "id": user_info.get("id", user_info.get("sub")),
            "email": user_info.get("email"),
            "name": user_info.get("name"),
            "picture": user_info.get("picture"),
        }
    
    elif provider_name == "github":
        return {
            "id": str(user_info.get("id")),
            "email": user_info.get("email"),
            "name": user_info.get("name") or user_info.get("login"),
            "picture": user_info.get("avatar_url"),
        }
    
    elif provider_name == "slack":
        user_data = user_info.get("user", {})
        return {
            "id": user_data.get("id"),
            "email": user_data.get("email"),
            "name": user_data.get("name"),
            "picture": user_data.get("image_192"),
        }
    
    # Default fallback
    return {
        "id": user_info.get("id", user_info.get("sub")),
        "email": user_info.get("email"),
        "name": user_info.get("name"),
        "picture": user_info.get("picture"),
    }


async def get_current_user(request) -> Optional[dict]:
    """
    Get current user from session cookie or Authorization header.
    
    Checks for session token in:
    1. Authorization: Bearer <token> header (useful for cross-origin dev)
    2. session cookie (standard flow)
    
    Args:
        request: FastAPI request object
        
    Returns:
        User dict or None
    """
    auth_config = getattr(settings, "auth_config", None)
    auth_mode = getattr(auth_config, "auth_mode", AuthMode.GOOGLE)
    if auth_mode == AuthMode.NONE:
        default_plan = getattr(auth_config, "invitation_default_plan", "free") if auth_config else "free"
        return _build_anonymous_user(default_plan)

    # Try Authorization header first (Bearer token)
    auth_header = request.headers.get("authorization", "")
    session_token = None
    
    if auth_header.lower().startswith("bearer "):
        session_token = auth_header[7:].strip()
        logger.debug(f"[get_current_user] Token from Authorization header: {session_token[:20]}...")
    
    # Fallback to cookie
    if not session_token:
        session_token = request.cookies.get("session")
        if session_token:
            logger.debug(f"[get_current_user] Token from cookie: {session_token[:20]}...")
        else:
            logger.debug("[get_current_user] No token found in header or cookie")
    
    if not session_token:
        return None
    
    try:
        # Get JWT config - check both possible env var names
        jwt_secret = (
            os.getenv("APP_JWT_SECRET")
            or os.getenv("APP_JWT_SECRET_KEY")
            or "dev-secret-key"
        )
        jwt_algorithm = "HS256"
        
        logger.debug(f"[get_current_user] Using JWT secret (first 10 chars): {jwt_secret[:10]}...")
        logger.debug(f"[get_current_user] Using JWT algorithm: {jwt_algorithm}")
        
        auth_config = settings.auth_config
        if auth_config and auth_config.jwt:
            jwt_secret = auth_config.jwt.secret_key
            jwt_algorithm = auth_config.jwt.algorithm
            logger.debug(f"[get_current_user] Overridden from auth_config: secret={jwt_secret[:10]}... algo={jwt_algorithm}")
        
        # Get audience and issuer for validation
        jwt_audience = os.getenv("APP_JWT_AUDIENCE")
        jwt_issuer = os.getenv("APP_JWT_ISSUER")
        if auth_config and auth_config.jwt:
            jwt_audience = getattr(auth_config.jwt, "audience", jwt_audience)
            jwt_issuer = getattr(auth_config.jwt, "issuer", jwt_issuer)
        
        logger.debug(f"[get_current_user] Expected audience: {jwt_audience}, issuer: {jwt_issuer}")
            
        # Decode and verify JWT
        decode_options = {
            "verify_exp": True,
            "verify_aud": bool(jwt_audience),  # Only verify if we have an expected audience
            "verify_iss": bool(jwt_issuer),     # Only verify if we have an expected issuer
        }
        
        decode_kwargs = {
            "algorithms": [jwt_algorithm],
            "options": decode_options,
        }
        
        # Add audience/issuer to decode args if they exist
        if jwt_audience:
            decode_kwargs["audience"] = jwt_audience
        if jwt_issuer:
            decode_kwargs["issuer"] = jwt_issuer
        
        payload = jwt.decode(session_token, jwt_secret, **decode_kwargs)
        
        logger.debug(f"[get_current_user] JWT decoded successfully. sub={payload.get('sub')}, email={payload.get('email')}")
        
        return {
            "id": payload.get("sub"),
            "email": payload.get("email"),
            "name": payload.get("name"),
            "picture": payload.get("picture"),
            "roles": payload.get("roles", []),
            "plan": _normalize_plan(payload.get("plan"), "free"),
            "status": payload.get("status"),
        }
    except jwt.ExpiredSignatureError:
        logger.warning("[get_current_user] Token expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.warning(f"[get_current_user] Invalid token: {e}")
        return None


def logout_user(response):
    """Delete session cookie."""
    response.delete_cookie("session")
