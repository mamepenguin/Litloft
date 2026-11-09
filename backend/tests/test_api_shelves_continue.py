"""Acceptance tests for the ``by=watch&key=continue`` shelf.

SPEC-CORE-071, with the desk predicate of SPEC-CORE-069. Invariant ids are
those of docs/specs/home-continue-desk.md.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.models import File, WatchHistory
from app.routers.progress import nickname_to_viewer_id
from tests.conftest import TEST_DRIVE

ALICE = {"X-Lit-Viewer": "alice"}
BOB = {"X-Lit-Viewer": "bob"}


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _file(name, *, kind="video", mime="video/mp4", folder="", **extra) -> File:
    return File(
        filename=name,
        title=name,
        drive=extra.pop("drive", TEST_DRIVE),
        folder_path=folder,
        file_path=f"{folder}/{name}" if folder else name,
        file_size=1,
        file_type=kind,
        mime_type=mime,
        duration=100.0,
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
        **extra,
    )


def _seed(db) -> dict[str, File]:
    rows = {
        "desk-new.mp4": _file("desk-new.mp4", folder="Shows"),
        "desk-old.mp4": _file("desk-old.mp4", folder="Movies"),
        "desk.pdf": _file("desk.pdf", kind="document", mime="application/pdf"),
        "barely.mp4": _file("barely.mp4"),
        "stale.mp4": _file("stale.mp4"),
        "finished.mp4": _file("finished.mp4"),
        "aside.mp4": _file("aside.mp4"),
        "unwatched.mp4": _file("unwatched.mp4"),
        "gone.mp4": _file("gone.mp4", missing_since=_now()),
        "foreign.mp4": _file("foreign.mp4", drive="elsewhere"),
        "bobs.mp4": _file("bobs.mp4"),
    }
    db.add_all(rows.values())
    db.commit()

    alice = nickname_to_viewer_id("alice")
    bob = nickname_to_viewer_id("bob")
    history = [
        (alice, "desk-new.mp4", 50, 100, timedelta(hours=1)),
        (alice, "desk.pdf", 10, 100, timedelta(hours=2)),
        (alice, "desk-old.mp4", 50, 100, timedelta(days=13)),
        (alice, "barely.mp4", 1, 100, timedelta(hours=1)),
        (alice, "stale.mp4", 50, 100, timedelta(days=20)),
        (alice, "finished.mp4", 95, 100, timedelta(hours=1)),
        (alice, "aside.mp4", 50, 100, timedelta(hours=3)),
        (alice, "gone.mp4", 50, 100, timedelta(hours=1)),
        (alice, "foreign.mp4", 50, 100, timedelta(hours=1)),
        (bob, "bobs.mp4", 50, 100, timedelta(hours=1)),
    ]
    for viewer, name, pos, dur, ago in history:
        db.add(
            WatchHistory(
                viewer_id=viewer,
                file_id=rows[name].id,
                playback_position=pos,
                duration=dur,
                last_played_at=_now() - ago,
            )
        )
    db.commit()
    return rows


def _get(c, query, headers=None):
    return c.get(f"/api/drives/{TEST_DRIVE}/shelves?{query}", headers=headers or {})


def _shelf(c, query, headers=ALICE) -> dict:
    res = _get(c, query, headers)
    assert res.status_code == 200, res.text
    return res.json()["shelves"][0]


def _names(shelf) -> list[str]:
    return [i["title"] for i in shelf["items"]]


def _dismiss(c, file_id):
    res = c.post(f"/api/files/{file_id}/progress/dismiss", cookies={"lit_viewer": "alice"})
    assert res.status_code == 204, res.text


def _desk_ids(c, extra="") -> list[str]:
    res = c.get(
        f"/api/drives/{TEST_DRIVE}/watch-history?filter=continue&limit=50{extra}",
        cookies={"lit_viewer": "alice"},
    )
    assert res.status_code == 200, res.text
    return [i["id"] for i in res.json()["data"]]


CONTINUE = "by=watch&key=continue&sort=last_played&order=desc&per_shelf=60"


class TestContinueShelf:
    """SPEC-CORE-071, SPEC-CORE-069 I4: the shelf is the desk."""

    def test_spec_core_071_lists_the_desk_newest_played_first(self, client):
        c, db, *_ = client
        rows = _seed(db)
        _dismiss(c, rows["aside.mp4"].id)

        shelf = _shelf(c, CONTINUE)

        assert _names(shelf) == ["desk-new.mp4", "desk.pdf", "desk-old.mp4"]
        assert shelf["count"] == 3
        assert shelf["key"] == "continue"

    def test_spec_core_071_is_the_same_set_as_filter_continue(self, client):
        c, db, *_ = client
        rows = _seed(db)
        _dismiss(c, rows["aside.mp4"].id)

        shelf = _shelf(c, CONTINUE)

        assert [i["id"] for i in shelf["items"]] == _desk_ids(c)

    def test_spec_core_071_the_requests_filters_narrow_it(self, client):
        c, db, *_ = client
        _seed(db)

        videos = _shelf(c, f"{CONTINUE}&type=video")
        pdfs = _shelf(c, f"{CONTINUE}&type=pdf")
        shows = _shelf(c, f"{CONTINUE}&folder=Shows")

        assert _names(videos) == ["desk-new.mp4", "aside.mp4", "desk-old.mp4"]
        assert (_names(pdfs), pdfs["count"]) == (["desk.pdf"], 1)
        assert _names(shows) == ["desk-new.mp4"]
        assert [i["id"] for i in videos["items"]] == _desk_ids(c, "&type=video")

    def test_spec_core_071_each_viewer_has_their_own_desk(self, client):
        c, db, *_ = client
        _seed(db)

        assert _names(_shelf(c, CONTINUE, BOB)) == ["bobs.mp4"]
        assert "bobs.mp4" not in _names(_shelf(c, CONTINUE, ALICE))

    def test_spec_core_071_without_a_viewer_it_is_400_viewer_required(self, client):
        c, db, *_ = client
        _seed(db)
        assert _shelf(c, CONTINUE)["count"] == 4

        res = _get(c, CONTINUE)

        assert res.status_code == 400
        assert "viewer_required" in str(res.json()["detail"])
        assert "desk-new.mp4" not in res.text


class TestWatchStatesUnchanged:
    """SPEC-CORE-071, SPEC-CORE-069 I3 and I4: the three states keep their meaning."""

    def test_spec_core_071_grouping_never_returns_a_continue_shelf(self, client):
        c, db, *_ = client
        _seed(db)
        assert _shelf(c, CONTINUE)["count"] == 4

        res = _get(c, "by=watch&per_shelf=60", ALICE)

        assert res.status_code == 200
        keys = [s["key"] for s in res.json()["shelves"]]
        assert "continue" not in keys
        assert set(keys) <= {"in_progress", "unwatched", "finished"}

    def test_spec_core_071_watch_continue_as_a_filter_is_422(self, client):
        c, db, *_ = client
        _seed(db)
        assert _shelf(c, CONTINUE)["count"] == 4

        assert _get(c, "by=folder&watch=continue", ALICE).status_code == 422
        assert _get(c, "by=all&watch=continue", ALICE).status_code == 422

    def test_spec_core_071_a_dismiss_moves_nothing_between_the_three_states(self, client):
        c, db, *_ = client
        rows = _seed(db)

        def grouping():
            res = _get(c, "by=watch&per_shelf=60&sort=title&order=asc", ALICE)
            assert res.status_code == 200, res.text
            return {s["key"]: (s["count"], _names(s)) for s in res.json()["shelves"]}

        before = grouping()
        _dismiss(c, rows["aside.mp4"].id)
        _dismiss(c, rows["desk-new.mp4"].id)

        assert grouping() == before
        in_progress = _shelf(c, "by=watch&key=in_progress&per_shelf=60")
        assert {"aside.mp4", "desk-new.mp4", "barely.mp4", "stale.mp4"} <= set(_names(in_progress))
        assert _names(_shelf(c, CONTINUE)) == ["desk.pdf", "desk-old.mp4"]
