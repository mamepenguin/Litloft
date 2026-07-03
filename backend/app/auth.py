import asyncio
import hashlib
import hmac
import json
import logging
import os
import secrets
import time
from datetime import datetime, timezone
from pathlib import Path

import jwt
from fastapi import Cookie, HTTPException, Request

import app.config as config

logger = logging.getLogger(__name__)

PASSWORDS_CONFIG = Path(os.getenv("PASSWORDS_CONFIG", "./passwords.json"))
COOKIE_NAME = "access_token"
JWT_ALGORITHM = "HS256"
REMEMBER_MAX_AGE = 365 * 24 * 3600  # 1 year
SESSION_EXP_SECONDS = 24 * 3600  # 24 hours

_passwords_cache: list[dict] | None = None
_jwt_secret: str | None = None

RATE_LIMIT_WINDOW = 60  # seconds
RATE_LIMIT_MAX_ATTEMPTS = 5
_failed_attempts: dict[str, list[float]] = {}


def load_passwords() -> list[dict]:
    global _passwords_cache
    if _passwords_cache is not None:
        return list(_passwords_cache)

    if not PASSWORDS_CONFIG.is_file():
        logger.info("passwords.json not found, all drives are public")
        _passwords_cache = []
        return []

    with open(PASSWORDS_CONFIG) as f:
        raw = json.load(f)

    if not isinstance(raw, list):
        raise ValueError("passwords.json must be a JSON array")

    for i, entry in enumerate(raw):
        if not isinstance(entry, dict):
            raise ValueError(f"passwords.json entry {i} must be an object")
        if "password" not in entry or "groups" not in entry:
            raise ValueError(f"passwords.json entry {i} must have 'password' and 'groups'")
        if not isinstance(entry["password"], str) or not entry["password"]:
            raise ValueError(f"passwords.json entry {i}: 'password' must be a non-empty string")
        if not isinstance(entry["groups"], list) or not entry["groups"]:
            raise ValueError(f"passwords.json entry {i}: 'groups' must be a non-empty list")
        for g in entry["groups"]:
            if not isinstance(g, str) or not g:
                raise ValueError(f"passwords.json entry {i}: each group must be a non-empty string")

    _passwords_cache = raw
    logger.info("Loaded %d password entries", len(raw))
    return list(_passwords_cache)


def init_jwt_secret() -> None:
    global _jwt_secret
    if _jwt_secret is not None:
        return

    env_secret = os.getenv("JWT_SECRET")
    if env_secret:
        _jwt_secret = env_secret
        return

    secret_path = config.DATA_DIR / ".jwt_secret"
    if secret_path.exists():
        _jwt_secret = secret_path.read_text().strip()
        return

    _jwt_secret = secrets.token_hex(32)
    secret_path.parent.mkdir(parents=True, exist_ok=True)
    secret_path.write_text(_jwt_secret)
    os.chmod(secret_path, 0o600)
    logger.info("Generated new JWT secret")


def _get_secret() -> str:
    if _jwt_secret is None:
        init_jwt_secret()
    return _jwt_secret  # type: ignore[return-value]


def check_rate_limit(client_ip: str) -> None:
    now = time.monotonic()
    attempts = _failed_attempts.get(client_ip, [])
    attempts = [t for t in attempts if now - t < RATE_LIMIT_WINDOW]
    _failed_attempts[client_ip] = attempts
    if len(attempts) >= RATE_LIMIT_MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many attempts, try again later")


def record_failed_attempt(client_ip: str) -> None:
    now = time.monotonic()
    attempts = _failed_attempts.get(client_ip, [])
    attempts = [t for t in attempts if now - t < RATE_LIMIT_WINDOW]
    attempts.append(now)
    _failed_attempts[client_ip] = attempts


def verify_password(password: str) -> list[str] | None:
    entries = load_passwords()
    for entry in entries:
        if hmac.compare_digest(password.encode(), entry["password"].encode()):
            return list(entry["groups"])
    return None


def create_jwt(groups: list[str], remember: bool) -> tuple[str, int | None]:
    now = datetime.now(timezone.utc)
    exp_seconds = REMEMBER_MAX_AGE if remember else SESSION_EXP_SECONDS
    payload = {
        "groups": groups,
        "iat": now,
        "exp": datetime.fromtimestamp(now.timestamp() + exp_seconds, tz=timezone.utc),
    }
    token = jwt.encode(payload, _get_secret(), algorithm=JWT_ALGORITHM)
    max_age = REMEMBER_MAX_AGE if remember else None
    return token, max_age


def decode_jwt(token: str) -> list[str]:
    try:
        payload = jwt.decode(token, _get_secret(), algorithms=[JWT_ALGORITHM])
        groups = payload.get("groups", [])
        if isinstance(groups, list):
            return groups
    except (jwt.InvalidTokenError, jwt.ExpiredSignatureError):
        pass
    return []


def get_unlocked_groups(request: Request) -> list[str]:
    # A Bearer credential is an explicit choice by non-browser clients
    # (mobile apps, the MCP server) and takes priority over the cookie. It
    # does not fall back to the cookie on failure — a broken/expired API
    # token must surface as "locked", not silently degrade to whatever
    # browser session cookie happens to be attached.
    auth_header = request.headers.get("Authorization")
    if auth_header:
        scheme, _, param = auth_header.partition(" ")
        if scheme.lower() == "bearer" and param:
            return decode_jwt(param)

    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return []
    return decode_jwt(token)


def has_protected_drives() -> bool:
    for drive in config.load_drives():
        if drive.get("access_group"):
            return True
    return False


def filter_drives(
    drives: list[dict], unlocked_groups: list[str]
) -> list[dict]:
    return [
        d for d in drives
        if not d.get("access_group") or d["access_group"] in unlocked_groups
    ]


def check_drive_access(drive_name: str, unlocked_groups: list[str]) -> None:
    # An unknown drive must surface as 404 (existence-hiding), not a 500
    # ValueError leak. Callers that pass a drive name straight from the
    # request path (e.g. uploads.init_upload) rely on this helper for the
    # existence check too; without the guard ``get_drive_access_group``
    # raises ValueError → FastAPI 500, which both differs from the
    # locked-drive 404 (an oracle for "this drive name is unknown vs.
    # locked") and is an unhandled-exception leak.
    try:
        access_group = config.get_drive_access_group(drive_name)
    except ValueError:
        raise HTTPException(
            status_code=404, detail=f"Drive not found: {drive_name}"
        )
    if access_group and access_group not in unlocked_groups:
        raise HTTPException(status_code=404, detail=f"Drive not found: {drive_name}")


# Passwords carrying this group grant admin access directly, without
# requiring every drive group to be unlocked. Set automatically during
# first-run setup so the admin password is a stable, user-visible concept.
ADMIN_SENTINEL_GROUP = "__admin__"


def is_admin(unlocked_groups: list[str]) -> bool:
    """A caller is "admin" iff they can see every protected drive,
    or they hold the __admin__ sentinel group.

    Rationale: an admin surface (queue control, system-wide index
    counters, disk usage, etc.) leaks aggregate information across
    drives. Restricting it to callers who already hold every
    access_group keeps the drive-isolation principle from being
    side-stepped by a meta channel.

    When no drive is protected and no __admin__ password is configured
    (passwords.json absent/empty, or a legacy config) everyone is admin —
    same graceful-degradation posture as the rest of the auth layer. But
    once an __admin__ password exists, admin is earned by unlocking it
    even if every drive stays publicly browsable.
    """
    if ADMIN_SENTINEL_GROUP in unlocked_groups:
        return True
    try:
        drives = config.load_drives()
    except FileNotFoundError:
        # No drives.json yet (fresh install / first-run wizard window).
        # Nobody has set up authentication, so everybody is admin —
        # consistent with the rest of the auth layer's graceful-degradation
        # posture.
        return True
    required = {
        d["access_group"]
        for d in drives
        if d.get("access_group")
    }
    if not required:
        # No group-protected drive exists. Two sub-cases:
        # - An __admin__ password is configured ("protected mode + all
        #   drives public"): admin is earned by unlocking it. Reaching here
        #   means the caller lacks __admin__ (the sentinel check above
        #   already returned), so they are NOT admin even though every
        #   drive is publicly browsable.
        # - Otherwise (passwords.json absent/empty, or a legacy config
        #   whose groups match no current drive): graceful degradation —
        #   everyone is admin. Gating here would lock such installs out of
        #   /admin entirely.
        admin_configured = any(
            ADMIN_SENTINEL_GROUP in entry.get("groups", [])
            for entry in load_passwords()
        )
        return not admin_configured
    return required.issubset(set(unlocked_groups))


def require_admin(request: Request) -> None:
    """Dependency that 403s the caller when they aren't admin.

    Intended for routers/routes that expose system-wide aggregates
    (admin dashboard, intelligence queue/status, etc.) where leaking
    cross-drive metadata would violate the project's drive-isolation
    principle.
    """
    if not is_admin(get_unlocked_groups(request)):
        raise HTTPException(status_code=403, detail="Admin access required")


def nickname_to_viewer_id(nickname: str) -> str:
    return hashlib.sha256(nickname.strip().encode("utf-8")).hexdigest()[:16]


def get_viewer_id(lit_viewer: str | None = Cookie(default=None)) -> str | None:
    if not lit_viewer or not lit_viewer.strip():
        return None
    trimmed = lit_viewer.strip()
    if len(trimmed) > 50:
        return None
    return nickname_to_viewer_id(trimmed)


def get_nickname(lit_viewer: str | None = Cookie(default=None)) -> str | None:
    if not lit_viewer or not lit_viewer.strip():
        return None
    trimmed = lit_viewer.strip()
    if len(trimmed) > 50:
        return None
    return trimmed
