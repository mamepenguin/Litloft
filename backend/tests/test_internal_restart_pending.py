"""Tests for /api/internal/restart-pending."""

from __future__ import annotations

import os


def test_restart_pending_touches_sentinel(client) -> None:
    """Happy path: a valid POST creates ``data/restart_pending``."""
    c, _, _, data_dir = client
    flag = data_dir / "restart_pending"
    assert not flag.exists()

    resp = c.post(
        "/api/internal/restart-pending",
        json={"source": "intelligence", "reason": "transcription updated"},
    )
    assert resp.status_code == 204
    assert flag.is_file()


def test_restart_pending_is_idempotent(client) -> None:
    c, _, _, data_dir = client
    flag = data_dir / "restart_pending"

    for _ in range(3):
        resp = c.post(
            "/api/internal/restart-pending",
            json={"source": "intelligence"},
        )
        assert resp.status_code == 204
    assert flag.is_file()


def test_restart_pending_rejects_invalid_source(client) -> None:
    """Pydantic ``StringConstraints`` enforces lower-case slug."""
    c, _, _, _ = client
    resp = c.post(
        "/api/internal/restart-pending",
        json={"source": "INVALID UPPERCASE"},
    )
    assert resp.status_code == 422


def test_restart_pending_rejects_empty_source(client) -> None:
    c, _, _, _ = client
    resp = c.post(
        "/api/internal/restart-pending",
        json={"source": ""},
    )
    assert resp.status_code == 422


def test_restart_pending_blocks_when_secret_mismatch(
    client, monkeypatch
) -> None:
    """When ``CORE_INTERNAL_SECRET`` is set, requests must include
    the matching ``X-Internal-Secret`` header."""
    monkeypatch.setenv("CORE_INTERNAL_SECRET", "topsecret")
    c, _, _, _ = client
    # Wrong secret
    resp = c.post(
        "/api/internal/restart-pending",
        json={"source": "intelligence"},
        headers={"X-Internal-Secret": "wrong"},
    )
    assert resp.status_code == 403
    # Correct secret
    resp_ok = c.post(
        "/api/internal/restart-pending",
        json={"source": "intelligence"},
        headers={"X-Internal-Secret": "topsecret"},
    )
    assert resp_ok.status_code == 204


def test_restart_pending_open_when_no_secret_configured(
    client, monkeypatch
) -> None:
    """Without ``CORE_INTERNAL_SECRET`` the gate is a no-op (dev parity)."""
    monkeypatch.delenv("CORE_INTERNAL_SECRET", raising=False)
    c, _, _, _ = client
    resp = c.post(
        "/api/internal/restart-pending",
        json={"source": "intelligence"},
    )
    assert resp.status_code == 204


def test_restart_pending_reason_is_optional(client) -> None:
    c, _, _, _ = client
    resp = c.post(
        "/api/internal/restart-pending",
        json={"source": "intelligence"},
    )
    assert resp.status_code == 204
