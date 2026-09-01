"""Tests for the Like toggle and the Liked listing filter.

Spec: docs/superpowers/specs/2026-09-01-favorite-like-separation.md

Like used to be a counter: ``POST /files/{id}/like`` incremented it and
``/dislike`` decremented it, neither idempotent and neither viewer-scoped.
It is now a toggle over ``files.liked_at``, mirroring the favorite toggle.
"""
import shutil
from datetime import datetime
from pathlib import Path

import pytest

from tests.conftest import TEST_DRIVE

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _seed_file(db, drive_dir, name="test.mp4", title="Test Video"):
    folder = drive_dir / "旅行"
    folder.mkdir(exist_ok=True)
    shutil.copy(FIXTURES_DIR / "long_video.mp4", folder / name)

    from app.models import File

    file = File(
        filename=name,
        title=title,
        drive=TEST_DRIVE,
        folder_path="旅行",
        file_path=f"旅行/{name}",
        file_size=folder.joinpath(name).stat().st_size,
        file_type="video",
        mime_type="video/mp4",
        duration=10.0,
    )
    db.add(file)
    db.commit()
    db.refresh(file)
    return file


@pytest.fixture()
def captured_emits(monkeypatch):
    """Capture ``event_hooks.emit_from_thread`` calls from the routers."""
    calls: list[tuple[str, dict]] = []

    def fake_emit_from_thread(event, data, drives=None):
        calls.append((event, data))

    from app.services import event_hooks
    monkeypatch.setattr(
        event_hooks, "emit_from_thread", fake_emit_from_thread
    )
    return calls


class TestLikeToggle:
    def test_toggle_on_sets_a_timestamp(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        res = c.post(f"/api/files/{file.id}/like")
        assert res.status_code == 200
        assert res.json()["liked_at"] is not None

    def test_toggle_off_clears_it(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        c.post(f"/api/files/{file.id}/like")
        res = c.post(f"/api/files/{file.id}/like")
        assert res.status_code == 200
        assert res.json()["liked_at"] is None

    def test_liking_again_records_a_fresh_timestamp(self, client):
        """Re-liking must re-sort to the top of the Liked view.

        The counter it replaces had no notion of "when", so this is the
        behaviour the timestamp exists to provide.
        """
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)

        first = c.post(f"/api/files/{file.id}/like").json()["liked_at"]
        c.post(f"/api/files/{file.id}/like")
        second = c.post(f"/api/files/{file.id}/like").json()["liked_at"]

        assert datetime.fromisoformat(second) > datetime.fromisoformat(first)

    def test_toggle_not_found(self, client):
        c, db, drive_dir, data_dir = client
        res = c.post("/api/files/zzNOTFOUNDzz/like")
        assert res.status_code == 404

    def test_emits_files_updated(self, client, captured_emits):
        """The favorite toggle broadcasts; the like counter never did,
        so a Liked list in another tab went stale."""
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        c.post(f"/api/files/{file.id}/like")

        assert ("files.updated", {"file_ids": [file.id]}) in captured_emits


class TestDislikeRemoved:
    def test_dislike_endpoint_is_gone(self, client):
        """It decremented the same column with no lower bound, so it was
        an undo button that could drive the count negative."""
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        res = c.post(f"/api/files/{file.id}/dislike")
        assert res.status_code == 404


class TestLikedFilter:
    def test_filter_liked(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        c.post(f"/api/files/{file.id}/like")

        res = c.get(f"/api/drives/{TEST_DRIVE}/files?liked=true")
        assert res.status_code == 200
        assert len(res.json()["data"]) == 1

        res = c.get(f"/api/drives/{TEST_DRIVE}/files?liked=false")
        assert res.status_code == 200
        assert len(res.json()["data"]) == 0

    def test_no_filter_returns_everything(self, client):
        c, db, drive_dir, data_dir = client
        _seed_file(db, drive_dir)
        res = c.get(f"/api/drives/{TEST_DRIVE}/files")
        assert len(res.json()["data"]) == 1

    def test_response_carries_liked_at_not_likes(self, client):
        c, db, drive_dir, data_dir = client
        _seed_file(db, drive_dir)
        item = c.get(f"/api/drives/{TEST_DRIVE}/files").json()["data"][0]
        assert "liked_at" in item
        assert item["liked_at"] is None
        assert "likes" not in item


class TestSortField:
    """The sort pattern doubles as the ``getattr(File, sort)`` allowlist,
    so a name left behind here is a 500, not a 422."""

    def test_drive_listing_rejects_likes(self, client):
        c, db, drive_dir, data_dir = client
        res = c.get(f"/api/drives/{TEST_DRIVE}/files?sort=likes")
        assert res.status_code == 422

    def test_drive_listing_accepts_liked_at(self, client):
        c, db, drive_dir, data_dir = client
        _seed_file(db, drive_dir)
        res = c.get(
            f"/api/drives/{TEST_DRIVE}/files?liked=true&sort=liked_at&order=desc"
        )
        assert res.status_code == 200

    def test_neighbors_rejects_likes(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        res = c.get(f"/api/files/{file.id}/neighbors?sort=likes")
        assert res.status_code == 422

    def test_neighbors_accepts_liked_at(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        c.post(f"/api/files/{file.id}/like")
        res = c.get(f"/api/files/{file.id}/neighbors?sort=liked_at")
        assert res.status_code == 200

    def test_neighbors_of_an_unliked_file_are_empty(self, client):
        """``liked_at`` is the only sortable column that can be NULL.

        The keyset comparisons need a total order, and a file that was
        never liked has no place in a like-ordered sequence. Comparing
        against NULL raised before this was made an explicit state.
        """
        c, db, drive_dir, data_dir = client
        liked = _seed_file(db, drive_dir, name="a.mp4", title="A")
        unliked = _seed_file(db, drive_dir, name="b.mp4", title="B")
        c.post(f"/api/files/{liked.id}/like")

        res = c.get(f"/api/files/{unliked.id}/neighbors?sort=liked_at")
        assert res.status_code == 200
        assert res.json() == {"prev_id": None, "next_id": None}

    def test_unliked_files_are_not_neighbours_of_a_liked_one(self, client):
        c, db, drive_dir, data_dir = client
        liked = _seed_file(db, drive_dir, name="a.mp4", title="A")
        _seed_file(db, drive_dir, name="b.mp4", title="B")
        c.post(f"/api/files/{liked.id}/like")

        res = c.get(f"/api/files/{liked.id}/neighbors?sort=liked_at")
        assert res.json() == {"prev_id": None, "next_id": None}

    def test_liked_view_orders_by_when_it_was_liked(self, client):
        """Ordering by ``created_at`` would rank by when the file entered
        the library, which is not what a record of "this was good" means."""
        c, db, drive_dir, data_dir = client
        older = _seed_file(db, drive_dir, name="a.mp4", title="A")
        newer = _seed_file(db, drive_dir, name="b.mp4", title="B")

        # Like the older file second, so like-order and add-order disagree.
        c.post(f"/api/files/{newer.id}/like")
        c.post(f"/api/files/{older.id}/like")

        res = c.get(
            f"/api/drives/{TEST_DRIVE}/files?liked=true&sort=liked_at&order=desc"
        )
        ids = [f["id"] for f in res.json()["data"]]
        assert ids == [older.id, newer.id]
