"""Unit tests for ``app.services.frontmatter.ensure_id`` (Phase A).

The ``ensure_id`` helper is a pure function that decides whether the
frontmatter for a ``.md`` file needs an ``id:`` key written in. It is
called by both ``PUT /api/files/{id}/content`` (core write path) and
the scanner's first-detect hook.

Spec: docs/superpowers/specs/2026-05-12-markdown-link-three-forms.md §3.1 / §4 Phase A.

Contract:
- ``ensure_id(metadata, existing_id=None, now=None) -> (new_metadata, id_value)``
- Idempotent: if ``metadata['id']`` is a string/int matching ``^\\d{12,17}$``
  it is preserved as-is (and normalised to string).
- Otherwise, if ``existing_id`` is provided and valid, it is used.
- Otherwise, a fresh 14-digit ``YYYYMMDDhhmmss`` timestamp is generated
  from ``now`` (or ``datetime.now(UTC)``).
- ``id`` is the first key of the returned dict (top-down readability).
- Input metadata is never mutated; a new dict is returned.

Collision handling (3-digit ms suffix → 17 chars) is the caller's
responsibility — the helper itself is pure (the caller queries the DB
for collisions and re-calls with a different ``now``).
"""
from __future__ import annotations

import re
from datetime import datetime, timezone

import pytest

from app.services.frontmatter import compose, ensure_id, parse


_ID_RE = re.compile(r"^\d{12,17}$")


class TestEnsureIdGenerates:
    def test_injects_timestamp_when_id_missing(self) -> None:
        now = datetime(2026, 5, 12, 14, 30, 28, tzinfo=timezone.utc)
        metadata = {"tags": ["a"]}
        new_meta, new_id = ensure_id(metadata, existing_id=None, now=now)
        assert new_id == "20260512143028"
        assert new_meta["id"] == "20260512143028"

    def test_generated_id_is_14_digits(self) -> None:
        now = datetime(2026, 1, 2, 3, 4, 5, tzinfo=timezone.utc)
        _, new_id = ensure_id({}, existing_id=None, now=now)
        assert len(new_id) == 14
        assert _ID_RE.match(new_id)

    def test_uses_datetime_now_utc_when_now_is_none(self) -> None:
        # We don't assert exact value (clock-bound); just check the
        # shape so callers can rely on the default branch.
        _, new_id = ensure_id({}, existing_id=None, now=None)
        assert _ID_RE.match(new_id)
        assert len(new_id) == 14


class TestEnsureIdPreserves:
    def test_valid_string_id_unchanged(self) -> None:
        metadata = {"id": "20260512143028", "tags": ["x"]}
        new_meta, new_id = ensure_id(metadata, existing_id=None, now=None)
        assert new_id == "20260512143028"
        assert new_meta["id"] == "20260512143028"

    def test_valid_int_id_normalised_to_string(self) -> None:
        # YAML may parse a bare digit sequence as int. We treat it
        # as the canonical id but always store it as a string.
        metadata = {"id": 20260512143028}
        new_meta, new_id = ensure_id(metadata, existing_id=None, now=None)
        assert new_id == "20260512143028"
        assert new_meta["id"] == "20260512143028"
        assert isinstance(new_meta["id"], str)

    def test_17_digit_id_preserved(self) -> None:
        # Collision-suffixed (14 + 3 ms digits) ids are still valid.
        metadata = {"id": "20260512143028123"}
        _, new_id = ensure_id(metadata, existing_id=None, now=None)
        assert new_id == "20260512143028123"

    def test_12_digit_id_preserved(self) -> None:
        # Lower-bound of the digit range.
        metadata = {"id": "202605121430"}
        _, new_id = ensure_id(metadata, existing_id=None, now=None)
        assert new_id == "202605121430"


class TestEnsureIdRejectsInvalid:
    def test_non_digit_id_overwritten_with_existing(self) -> None:
        # Caller passes existing_id (from DB) so we re-inject it.
        now = datetime(2026, 5, 12, 14, 30, 28, tzinfo=timezone.utc)
        metadata = {"id": "abc"}
        new_meta, new_id = ensure_id(
            metadata, existing_id="20260101000000", now=now
        )
        assert new_id == "20260101000000"
        assert new_meta["id"] == "20260101000000"

    def test_empty_string_id_overwritten(self) -> None:
        now = datetime(2026, 5, 12, 14, 30, 28, tzinfo=timezone.utc)
        metadata = {"id": ""}
        new_meta, new_id = ensure_id(metadata, existing_id=None, now=now)
        assert new_id == "20260512143028"
        assert new_meta["id"] == "20260512143028"

    def test_too_short_id_overwritten(self) -> None:
        # 11 digits → below the 12-digit lower bound.
        now = datetime(2026, 5, 12, 14, 30, 28, tzinfo=timezone.utc)
        metadata = {"id": "12345678901"}
        _, new_id = ensure_id(metadata, existing_id=None, now=now)
        assert new_id == "20260512143028"

    def test_too_long_id_overwritten(self) -> None:
        # 18 digits → above the 17-digit upper bound.
        now = datetime(2026, 5, 12, 14, 30, 28, tzinfo=timezone.utc)
        metadata = {"id": "123456789012345678"}
        _, new_id = ensure_id(metadata, existing_id=None, now=now)
        assert new_id == "20260512143028"

    def test_id_with_alpha_chars_overwritten(self) -> None:
        now = datetime(2026, 5, 12, 14, 30, 28, tzinfo=timezone.utc)
        metadata = {"id": "2026051214302a"}
        _, new_id = ensure_id(metadata, existing_id=None, now=now)
        assert new_id == "20260512143028"

    def test_invalid_id_with_existing_prefers_existing(self) -> None:
        # When fm has a bogus id but DB has a known good one, the
        # known good one wins — we don't generate a brand-new id.
        metadata = {"id": "not-a-timestamp"}
        _, new_id = ensure_id(
            metadata, existing_id="20251231235959", now=None
        )
        assert new_id == "20251231235959"


class TestEnsureIdReinjectsFromExisting:
    def test_missing_id_with_existing_uses_existing(self) -> None:
        # Stale frontmatter (no id) but DB has md_id — re-inject from DB
        # so writers don't lose the stable id.
        metadata = {"tags": ["a"]}
        new_meta, new_id = ensure_id(
            metadata, existing_id="20260101000000", now=None
        )
        assert new_id == "20260101000000"
        assert new_meta["id"] == "20260101000000"


class TestEnsureIdOrdering:
    def test_id_appears_first_in_returned_dict(self) -> None:
        # Frontmatter readability convention: id top, then other keys.
        now = datetime(2026, 5, 12, 14, 30, 28, tzinfo=timezone.utc)
        metadata = {"tags": ["a"], "created": "2026-05-12T14:30:28Z"}
        new_meta, _ = ensure_id(metadata, existing_id=None, now=now)
        keys = list(new_meta.keys())
        assert keys[0] == "id"
        # The remaining keys preserve original order.
        assert keys[1:] == ["tags", "created"]

    def test_id_appears_first_even_when_preserved(self) -> None:
        metadata = {"tags": ["a"], "id": "20260101000000"}
        new_meta, _ = ensure_id(metadata, existing_id=None, now=None)
        keys = list(new_meta.keys())
        assert keys[0] == "id"


class TestEnsureIdImmutability:
    def test_input_metadata_not_mutated(self) -> None:
        metadata = {"tags": ["a"]}
        original = dict(metadata)
        now = datetime(2026, 5, 12, 14, 30, 28, tzinfo=timezone.utc)
        ensure_id(metadata, existing_id=None, now=now)
        assert metadata == original
        assert "id" not in metadata

    def test_returns_new_dict_instance(self) -> None:
        metadata = {"id": "20260512143028"}
        new_meta, _ = ensure_id(metadata, existing_id=None, now=None)
        assert new_meta is not metadata


class TestComposeHelper:
    """``compose(metadata, body)`` mirrors the addons/knowledge helper."""

    def test_compose_roundtrip_with_id(self) -> None:
        metadata = {"id": "20260512143028", "tags": ["a"]}
        body = "# Hello\n\nbody\n"
        composed = compose(metadata, body)
        parsed = parse(composed)
        assert parsed.metadata == metadata
        assert parsed.body == body

    def test_compose_empty_metadata_returns_body_only(self) -> None:
        assert compose({}, "body") == "body"

    def test_compose_emits_id_first(self) -> None:
        metadata = {"id": "20260512143028", "tags": ["a"]}
        composed = compose(metadata, "")
        id_idx = composed.find("id:")
        tags_idx = composed.find("tags:")
        assert 0 <= id_idx < tags_idx
