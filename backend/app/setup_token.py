"""The token that unlocks config writes during first-run setup.

Until ``data/setup_completed`` exists, the config write endpoints cannot ask
for admin: the wizard's drives write is what establishes the drives' access
groups, and no password exists yet to unlock them. The token is what holds
that window for whoever started the install.

It is deliberately not written to disk. ``data/`` is mounted into addon
containers read-only and only ``.jwt_secret`` is masked there, so a file here
would have to be masked in every existing ``docker-compose.override.yml``.
"""

import logging
import os
import secrets

logger = logging.getLogger(__name__)

ENV_VAR = "LITLOFT_SETUP_TOKEN"
HEADER = "X-Litloft-Setup-Token"

_token: str | None = None


def setup_token() -> str:
    """The current token, minting one on first need."""
    global _token
    if _token is not None:
        return _token

    from_env = os.getenv(ENV_VAR)
    if from_env:
        _token = from_env
        return _token

    _token = secrets.token_urlsafe(24)
    logger.warning(
        "Setup is not complete. Open /setup?token=%s, or enter this at /setup:"
        "\n\n    setup token: %s\n",
        _token, _token,
    )
    return _token


def matches(candidate: str | None) -> bool:
    if not candidate:
        return False
    return secrets.compare_digest(candidate, setup_token())
