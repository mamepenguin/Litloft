"""HTTP tests for Internal API: GET /api/internal/viewer-history.

Returns file_ids the caller has touched in a given drive within an
optional time window. Used by the intelligence Ask pipeline (Stage B
of the personal-history-query spec) to narrow retrieval scope by
"what this viewer actually opened".

Coverage targets:

* viewer_id format validation (16-char SHA-256 prefix).
* drive existence check (404 when unknown).
* kind toggling between viewed and not_viewed, including the boundary
  where the time window is empty.
* drive isolation — a row whose ``File.drive`` is a different drive
  must never appear in the response, even though watch_history itself
  is drive-agnostic.
* lifecycle filter — soft-deleted (``deleted_at``) and missing
  (``missing_since``) files must be excluded.
* time-window edges (after-only, before-only, both, half-open).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.models import File, WatchHistory
from tests.conftest import TEST_DRIVE


# Deterministic 16-char SHA-256 prefix used across the test cases.
# Constant so the assertions stay readable even when the fixture set
# grows; the auth module produces these via ``nickname_to_viewer_id``
# but for tests a stable string suffices.
VIEWER_A = "0123456789abcdef"
VIEWER_B = "fedcba9876543210"


def _seed_file(
    db,
    filename: str,
    *,
    drive: str = TEST_DRIVE,
    deleted_at: datetime | None = None,
    missing_since: datetime | None = None,
) -> File:
    f = File(
        filename=filename,
        title=filename,
        drive=drive,
        folder_path="",
        file_path=f"{drive}/{filename}",
        file_size=10,
        file_type="video",
        mime_type="video/mp4",
        deleted_at=deleted_at,
        missing_since=missing_since,
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


def _seed_view(
    db, viewer_id: str, file_id: str, *, when: datetime
) -> WatchHistory:
    row = WatchHistory(
        viewer_id=viewer_id,
        file_id=file_id,
        playback_position=0.0,
        duration=0.0,
        last_played_at=when,
    )
    db.add(row)
    db.commit()
    return row


class TestViewerHistoryValidation:
    """Input validation: shape errors before any DB access."""

    def test_invalid_viewer_id_400(self, client):
        c, _db, _, _ = client
        res = c.get(
            "/api/internal/viewer-history",
            params={"viewer_id": "not-a-hash", "drive": TEST_DRIVE},
        )
        assert res.status_code == 400

    def test_short_viewer_id_400(self, client):
        c, _db, _, _ = client
        # 12-char hex is the wrong length even though every char is hex.
        res = c.get(
            "/api/internal/viewer-history",
            params={"viewer_id": "abcdef012345", "drive": TEST_DRIVE},
        )
        assert res.status_code == 400

    def test_unknown_drive_404(self, client):
        c, _db, _, _ = client
        res = c.get(
            "/api/internal/viewer-history",
            params={"viewer_id": VIEWER_A, "drive": "no-such-drive"},
        )
        assert res.status_code == 404

    def test_invalid_kind_400(self, client):
        c, _db, _, _ = client
        res = c.get(
            "/api/internal/viewer-history",
            params={
                "viewer_id": VIEWER_A,
                "drive": TEST_DRIVE,
                "kind": "watching",
            },
        )
        assert res.status_code == 400

    def test_invalid_after_400(self, client):
        c, _db, _, _ = client
        res = c.get(
            "/api/internal/viewer-history",
            params={
                "viewer_id": VIEWER_A,
                "drive": TEST_DRIVE,
                "after": "yesterday",
            },
        )
        assert res.status_code == 400

    def test_after_after_before_400(self, client):
        c, _db, _, _ = client
        res = c.get(
            "/api/internal/viewer-history",
            params={
                "viewer_id": VIEWER_A,
                "drive": TEST_DRIVE,
                "after": "2026-04-26T00:00:00",
                "before": "2026-04-19T00:00:00",
            },
        )
        assert res.status_code == 400


class TestViewerHistoryViewed:
    """Default ``kind=viewed`` happy paths."""

    def test_empty_when_no_history(self, client):
        c, _db, _, _ = client
        res = c.get(
            "/api/internal/viewer-history",
            params={"viewer_id": VIEWER_A, "drive": TEST_DRIVE},
        )
        assert res.status_code == 200
        assert res.json() == {"file_ids": []}

    def test_returns_viewed_files(self, client):
        c, db, _, _ = client
        f1 = _seed_file(db, "a.mp4")
        f2 = _seed_file(db, "b.mp4")
        _seed_view(db, VIEWER_A, f1.id, when=datetime.now(UTC))
        _seed_view(db, VIEWER_A, f2.id, when=datetime.now(UTC))

        res = c.get(
            "/api/internal/viewer-history",
            params={"viewer_id": VIEWER_A, "drive": TEST_DRIVE},
        )
        assert res.status_code == 200
        assert set(res.json()["file_ids"]) == {f1.id, f2.id}

    def test_isolates_other_viewers(self, client):
        c, db, _, _ = client
        f1 = _seed_file(db, "a.mp4")
        f2 = _seed_file(db, "b.mp4")
        _seed_view(db, VIEWER_A, f1.id, when=datetime.now(UTC))
        _seed_view(db, VIEWER_B, f2.id, when=datetime.now(UTC))

        res = c.get(
            "/api/internal/viewer-history",
            params={"viewer_id": VIEWER_A, "drive": TEST_DRIVE},
        )
        assert res.status_code == 200
        assert res.json()["file_ids"] == [f1.id]

    def test_excludes_soft_deleted(self, client):
        c, db, _, _ = client
        live = _seed_file(db, "live.mp4")
        gone = _seed_file(db, "gone.mp4", deleted_at=datetime.now(UTC))
        _seed_view(db, VIEWER_A, live.id, when=datetime.now(UTC))
        _seed_view(db, VIEWER_A, gone.id, when=datetime.now(UTC))

        res = c.get(
            "/api/internal/viewer-history",
            params={"viewer_id": VIEWER_A, "drive": TEST_DRIVE},
        )
        assert res.status_code == 200
        assert res.json()["file_ids"] == [live.id]

    def test_excludes_missing(self, client):
        c, db, _, _ = client
        live = _seed_file(db, "live.mp4")
        away = _seed_file(db, "away.mp4", missing_since=datetime.now(UTC))
        _seed_view(db, VIEWER_A, live.id, when=datetime.now(UTC))
        _seed_view(db, VIEWER_A, away.id, when=datetime.now(UTC))

        res = c.get(
            "/api/internal/viewer-history",
            params={"viewer_id": VIEWER_A, "drive": TEST_DRIVE},
        )
        assert res.status_code == 200
        assert res.json()["file_ids"] == [live.id]


class TestViewerHistoryTimeWindow:
    """Half-open ``[after, before)`` filtering on ``last_played_at``."""

    def test_after_filter_inclusive(self, client):
        c, db, _, _ = client
        f = _seed_file(db, "a.mp4")
        boundary = datetime(2026, 4, 19, 0, 0, 0)
        _seed_view(db, VIEWER_A, f.id, when=boundary)

        # ``after`` is inclusive: a row exactly at the boundary is kept.
        res = c.get(
            "/api/internal/viewer-history",
            params={
                "viewer_id": VIEWER_A,
                "drive": TEST_DRIVE,
                "after": boundary.isoformat(),
            },
        )
        assert res.json()["file_ids"] == [f.id]

    def test_before_filter_exclusive(self, client):
        c, db, _, _ = client
        f = _seed_file(db, "a.mp4")
        boundary = datetime(2026, 4, 26, 0, 0, 0)
        _seed_view(db, VIEWER_A, f.id, when=boundary)

        # ``before`` is exclusive: a row exactly at the boundary is dropped.
        res = c.get(
            "/api/internal/viewer-history",
            params={
                "viewer_id": VIEWER_A,
                "drive": TEST_DRIVE,
                "before": boundary.isoformat(),
            },
        )
        assert res.json()["file_ids"] == []

    def test_aware_iso_normalises_to_naive_utc(self, client):
        """Aware ISO inputs (``...+00:00`` / ``...Z``) compare against
        the naive ``last_played_at`` column as if both were UTC.

        Without the normalisation an aware-ISO ``after`` would compare
        against SQLite's text-stored naive datetime as a *string*, where
        the trailing ``+00:00`` lexicographically pushes the boundary
        past every legitimate row.
        """
        c, db, _, _ = client
        f = _seed_file(db, "a.mp4")
        # Same wall-clock instant as the boundary, expressed three ways.
        _seed_view(db, VIEWER_A, f.id, when=datetime(2026, 4, 19, 0, 0, 0))

        # +00:00 form must keep the row.
        res = c.get(
            "/api/internal/viewer-history",
            params={
                "viewer_id": VIEWER_A,
                "drive": TEST_DRIVE,
                "after": "2026-04-19T00:00:00+00:00",
            },
        )
        assert res.json()["file_ids"] == [f.id]

        # Z form must keep the row.
        res = c.get(
            "/api/internal/viewer-history",
            params={
                "viewer_id": VIEWER_A,
                "drive": TEST_DRIVE,
                "after": "2026-04-19T00:00:00Z",
            },
        )
        assert res.json()["file_ids"] == [f.id]

    def test_combined_window(self, client):
        c, db, _, _ = client
        in_range = _seed_file(db, "in.mp4")
        too_early = _seed_file(db, "early.mp4")
        too_late = _seed_file(db, "late.mp4")

        _seed_view(
            db, VIEWER_A, too_early.id, when=datetime(2026, 4, 1, 12, 0, 0)
        )
        _seed_view(
            db, VIEWER_A, in_range.id, when=datetime(2026, 4, 20, 12, 0, 0)
        )
        _seed_view(
            db, VIEWER_A, too_late.id, when=datetime(2026, 5, 1, 12, 0, 0)
        )

        res = c.get(
            "/api/internal/viewer-history",
            params={
                "viewer_id": VIEWER_A,
                "drive": TEST_DRIVE,
                "after": "2026-04-19T00:00:00",
                "before": "2026-04-26T00:00:00",
            },
        )
        assert res.json()["file_ids"] == [in_range.id]


class TestViewerHistoryNotViewed:
    """``kind=not_viewed`` returns the complement within the drive."""

    def test_empty_drive_returns_empty(self, client):
        c, _db, _, _ = client
        res = c.get(
            "/api/internal/viewer-history",
            params={
                "viewer_id": VIEWER_A,
                "drive": TEST_DRIVE,
                "kind": "not_viewed",
            },
        )
        assert res.status_code == 200
        assert res.json() == {"file_ids": []}

    def test_returns_files_not_viewed(self, client):
        c, db, _, _ = client
        seen = _seed_file(db, "seen.mp4")
        unseen = _seed_file(db, "unseen.mp4")
        _seed_view(db, VIEWER_A, seen.id, when=datetime.now(UTC))

        res = c.get(
            "/api/internal/viewer-history",
            params={
                "viewer_id": VIEWER_A,
                "drive": TEST_DRIVE,
                "kind": "not_viewed",
            },
        )
        assert res.status_code == 200
        assert res.json()["file_ids"] == [unseen.id]

    def test_not_viewed_excludes_lifecycle_states(self, client):
        c, db, _, _ = client
        # An active, never-viewed file should appear.
        unseen = _seed_file(db, "unseen.mp4")
        # Soft-deleted and missing files are not "viewable" today, so
        # they must be excluded from not_viewed too — otherwise the UI
        # would surface trash as a recommendation.
        _seed_file(db, "trash.mp4", deleted_at=datetime.now(UTC))
        _seed_file(db, "gone.mp4", missing_since=datetime.now(UTC))

        res = c.get(
            "/api/internal/viewer-history",
            params={
                "viewer_id": VIEWER_A,
                "drive": TEST_DRIVE,
                "kind": "not_viewed",
            },
        )
        assert res.json()["file_ids"] == [unseen.id]

    def test_not_viewed_within_window_uses_window(self, client):
        """A file viewed *outside* the window counts as not_viewed inside it.

        Concretely: if I opened ``unseen-this-week.mp4`` last month,
        ``kind=not_viewed`` over "this week" must still surface it,
        because the user hasn't seen it *this week*. The history
        exclusion sub-query is window-scoped, not all-time.
        """
        c, db, _, _ = client
        long_ago = _seed_file(db, "long-ago.mp4")
        _seed_view(
            db,
            VIEWER_A,
            long_ago.id,
            when=datetime(2026, 1, 1, 12, 0, 0),
        )

        res = c.get(
            "/api/internal/viewer-history",
            params={
                "viewer_id": VIEWER_A,
                "drive": TEST_DRIVE,
                "kind": "not_viewed",
                "after": "2026-04-19T00:00:00",
                "before": "2026-04-26T00:00:00",
            },
        )
        assert res.json()["file_ids"] == [long_ago.id]
