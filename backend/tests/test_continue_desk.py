"""Acceptance tests for the Continue desk and set-aside.

SPEC-CORE-069 (``filter=continue``) and SPEC-CORE-070 (``POST
/api/files/{id}/progress/dismiss``). Invariant ids are those of
docs/specs/home-continue-desk.md.
"""

from __future__ import annotations

import json
import time
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text

from app.models import File, WatchHistory
from app.routers.progress import nickname_to_viewer_id
from tests.conftest import TEST_DRIVE

ALICE = {"lit_viewer": "alice"}
BOB = {"lit_viewer": "bob"}
OTHER_DRIVE = "elsewhere"


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _add(db, drive_dir, name, *, file_type="video", mime="video/mp4", drive=TEST_DRIVE,
         **extra) -> File:
    (drive_dir / name).write_bytes(b"x")
    f = File(
        filename=name,
        title=name,
        drive=drive,
        folder_path="",
        file_path=name,
        file_size=1,
        file_type=file_type,
        mime_type=mime,
        duration=extra.pop("duration", 100.0),
        **extra,
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


def _row(db, nickname, file, pos, dur, *, ago=timedelta(hours=1)) -> None:
    db.add(
        WatchHistory(
            viewer_id=nickname_to_viewer_id(nickname),
            file_id=file.id,
            playback_position=pos,
            duration=dur,
            last_played_at=_now() - ago,
        )
    )
    db.commit()


def _set_aside_at_last_played(db, nickname, file) -> None:
    db.execute(
        text(
            "UPDATE watch_history SET dismissed_at = last_played_at "
            "WHERE viewer_id = :v AND file_id = :f"
        ),
        {"v": nickname_to_viewer_id(nickname), "f": file.id},
    )
    db.commit()


def _snapshot(db, nickname, file_id):
    db.expire_all()
    return db.execute(
        text(
            "SELECT playback_position, duration, last_played_at, dismissed_at "
            "FROM watch_history WHERE viewer_id = :v AND file_id = :f"
        ),
        {"v": nickname_to_viewer_id(nickname), "f": file_id},
    ).one_or_none()


def _desk(c, cookies=ALICE, **params) -> list[str]:
    query = "&".join(f"{k}={v}" for k, v in {"filter": "continue", **params}.items())
    res = c.get(f"/api/drives/{TEST_DRIVE}/watch-history?{query}", cookies=cookies)
    assert res.status_code == 200, res.text
    return [item["id"] for item in res.json()["data"]]


def _history(c, flt, cookies=ALICE) -> list[str]:
    res = c.get(f"/api/drives/{TEST_DRIVE}/watch-history?filter={flt}&limit=50", cookies=cookies)
    assert res.status_code == 200, res.text
    return [item["id"] for item in res.json()["data"]]


def _shelf(c, key, headers=None, extra="") -> dict:
    res = c.get(
        f"/api/drives/{TEST_DRIVE}/shelves?by=watch&key={key}&per_shelf=60{extra}",
        headers=headers or {"X-Lit-Viewer": "alice"},
    )
    assert res.status_code == 200, res.text
    return res.json()["shelves"][0]


def _dismiss(c, file_id, cookies=ALICE):
    return c.post(f"/api/files/{file_id}/progress/dismiss", cookies=cookies)


def _keys(obj) -> set[str]:
    if isinstance(obj, dict):
        return set(obj) | {k for v in obj.values() for k in _keys(v)}
    if isinstance(obj, list):
        return {k for v in obj for k in _keys(v)}
    return set()


class TestDeskPredicate:
    """SPEC-CORE-069 I1: the desk predicate's boundaries."""

    @pytest.mark.parametrize(
        ("pos", "dur", "ago", "on_desk"),
        [
            (3.0, 100.0, timedelta(hours=1), True),
            (2.9, 100.0, timedelta(hours=1), False),
            (107.9, 120.0, timedelta(hours=1), True),
            (108.0, 120.0, timedelta(hours=1), False),
            (120.0, 120.0, timedelta(hours=1), False),
            (0.0, 0.0, timedelta(hours=1), False),
            (0.0, 120.0, timedelta(hours=1), False),
            (50.0, 100.0, timedelta(days=13, hours=23), True),
            (50.0, 100.0, timedelta(days=14, hours=1), False),
        ],
        ids=[
            "3pct-in", "2.9pct-out", "just-under-90-in", "90pct-out", "finished-out",
            "view-only-out", "position-zero-out", "13d23h-in", "14d1h-out",
        ],
    )
    def test_spec_core_069_a_row_is_on_the_desk_exactly_when_the_predicate_holds(
        self, client, pos, dur, ago, on_desk
    ):
        c, db, drive_dir, _ = client
        f = _add(db, drive_dir, "v.mp4")
        _row(db, "alice", f, pos, dur, ago=ago)

        assert (f.id in _desk(c)) is on_desk

    def test_spec_core_069_a_row_set_aside_at_its_last_play_is_off_the_desk(self, client):
        c, db, drive_dir, _ = client
        kept = _add(db, drive_dir, "kept.mp4")
        aside = _add(db, drive_dir, "aside.mp4")
        _row(db, "alice", kept, 50, 100)
        _row(db, "alice", aside, 50, 100)
        _set_aside_at_last_played(db, "alice", aside)

        assert _desk(c) == [kept.id]

    def test_spec_core_069_no_desk_row_is_finished_under_by_watch(self, client):
        c, db, drive_dir, _ = client
        cases = [(3, 100), (50, 100), (89.9, 100), (90, 100), (100, 100), (1, 100)]
        files = []
        for i, (pos, dur) in enumerate(cases):
            f = _add(db, drive_dir, f"v{i}.mp4")
            _row(db, "alice", f, pos, dur, ago=timedelta(minutes=i + 1))
            files.append(f)

        desk = set(_desk(c, limit=50))
        finished = {i["id"] for i in _shelf(c, "finished")["items"]}

        assert desk == {files[0].id, files[1].id, files[2].id}
        assert desk.isdisjoint(finished)


class TestDeskListing:
    """SPEC-CORE-069 I1, I2: order, limit, type and scope."""

    def test_spec_core_069_newest_last_played_first_and_at_most_limit(self, client):
        c, db, drive_dir, _ = client
        old = _add(db, drive_dir, "old.mp4")
        mid = _add(db, drive_dir, "mid.mp4")
        new = _add(db, drive_dir, "new.mp4")
        _row(db, "alice", old, 50, 100, ago=timedelta(days=3))
        _row(db, "alice", mid, 50, 100, ago=timedelta(days=2))
        _row(db, "alice", new, 50, 100, ago=timedelta(days=1))

        assert _desk(c) == [new.id, mid.id, old.id]
        assert _desk(c, limit=2) == [new.id, mid.id]
        assert _desk(c, limit=1) == [new.id]

    def test_spec_core_069_type_narrows_before_limit(self, client):
        c, db, drive_dir, _ = client
        for i in range(3):
            v = _add(db, drive_dir, f"v{i}.mp4")
            _row(db, "alice", v, 50, 100, ago=timedelta(hours=i + 1))
        pdf = _add(db, drive_dir, "book.pdf", file_type="document", mime="application/pdf")
        _row(db, "alice", pdf, 10, 100, ago=timedelta(days=5))

        assert _desk(c, type="pdf", limit=1) == [pdf.id]
        assert pdf.id not in _desk(c, type="video", limit=50)

    def test_spec_core_069_every_kind_is_on_the_desk_without_a_type(self, client):
        from app.services.filetype import classify

        c, db, drive_dir, _ = client
        names = ["movie.mp4", "song.mp3", "doc.pdf", "book.epub", "bundle.zip", "note.md",
                 "remote.loft"]
        expected = set()
        for i, name in enumerate(names):
            file_type, mime = classify(name)
            f = _add(db, drive_dir, name, file_type=file_type, mime=mime)
            _row(db, "alice", f, 0.5, 1.0, ago=timedelta(minutes=i + 1))
            expected.add(f.id)

        assert set(_desk(c, limit=50)) == expected

    def test_spec_core_069_only_this_viewers_active_rows_in_this_drive(self, client):
        c, db, drive_dir, _ = client
        mine = _add(db, drive_dir, "mine.mp4")
        bobs = _add(db, drive_dir, "bobs.mp4")
        gone = _add(db, drive_dir, "gone.mp4", missing_since=_now())
        binned = _add(db, drive_dir, "binned.mp4", deleted_at=_now())
        foreign = _add(db, drive_dir, "foreign.mp4", drive=OTHER_DRIVE)
        _row(db, "alice", mine, 50, 100)
        _row(db, "bob", bobs, 50, 100)
        for f in (gone, binned, foreign):
            _row(db, "alice", f, 50, 100)

        assert _desk(c, limit=50) == [mine.id]
        assert _desk(c, cookies=BOB, limit=50) == [bobs.id]

    def test_spec_core_069_without_a_viewer_it_is_an_empty_list(self, client):
        c, db, drive_dir, _ = client
        f = _add(db, drive_dir, "v.mp4")
        _row(db, "alice", f, 50, 100)

        res = c.get(f"/api/drives/{TEST_DRIVE}/watch-history?filter=continue")

        assert res.status_code == 200
        assert res.json() == {"data": []}

    def test_spec_core_069_unknown_drive_is_404(self, client):
        c, *_ = client

        res = c.get("/api/drives/nowhere/watch-history?filter=continue", cookies=ALICE)

        assert res.status_code == 404


class TestOtherFiltersUnchanged:
    """SPEC-CORE-069 I3: unfinished and all ignore the desk and dismissed_at."""

    def test_spec_core_069_barely_started_and_set_aside_rows_stay_in_unfinished_and_all(
        self, client
    ):
        c, db, drive_dir, _ = client
        barely = _add(db, drive_dir, "barely.mp4")
        aside = _add(db, drive_dir, "aside.mp4")
        stale = _add(db, drive_dir, "stale.mp4")
        _row(db, "alice", barely, 1, 100, ago=timedelta(hours=1))
        _row(db, "alice", aside, 50, 100, ago=timedelta(hours=2))
        _row(db, "alice", stale, 50, 100, ago=timedelta(days=30))
        assert _dismiss(c, aside.id).status_code == 204

        assert _desk(c, limit=50) == []
        assert _history(c, "unfinished") == [barely.id, aside.id, stale.id]
        assert _history(c, "all") == [barely.id, aside.id, stale.id]


class TestDismiss:
    """SPEC-CORE-070 I5: a dismiss writes only dismissed_at."""

    def test_spec_core_070_dismiss_takes_the_file_off_the_desk_and_keeps_the_row(self, client):
        c, db, drive_dir, _ = client
        f = _add(db, drive_dir, "v.mp4")
        other = _add(db, drive_dir, "other.mp4")
        assert c.post(f"/api/files/{f.id}/progress", json={"position": 40.0, "duration": 100.0},
                      cookies=ALICE).status_code == 200
        _row(db, "bob", f, 30, 100)
        _row(db, "alice", other, 50, 100, ago=timedelta(hours=2))
        before = _snapshot(db, "alice", f.id)
        bob_before = _snapshot(db, "bob", f.id)
        other_before = _snapshot(db, "alice", other.id)
        rows_before = db.query(WatchHistory).count()

        res = _dismiss(c, f.id)

        assert res.status_code == 204
        after = _snapshot(db, "alice", f.id)
        assert after.dismissed_at is not None
        assert (after.playback_position, after.duration, after.last_played_at) == (
            before.playback_position, before.duration, before.last_played_at,
        )
        assert _snapshot(db, "bob", f.id) == bob_before
        assert _snapshot(db, "alice", other.id) == other_before
        assert db.query(WatchHistory).count() == rows_before
        assert _desk(c) == [other.id]
        assert f.id in _desk(c, cookies=BOB)
        assert c.get(f"/api/files/{f.id}/progress", cookies=ALICE).json() == {
            "position": 40.0, "duration": 100.0,
        }
        assert f.id in {i["id"] for i in _shelf(c, "in_progress")["items"]}

    @pytest.mark.parametrize(
        ("pos", "dur", "ago"),
        [(100.0, 100.0, timedelta(hours=1)), (0.0, 0.0, timedelta(hours=1)),
         (50.0, 100.0, timedelta(days=60))],
        ids=["finished", "view-only", "stale"],
    )
    def test_spec_core_070_any_existing_row_can_be_set_aside(self, client, pos, dur, ago):
        c, db, drive_dir, _ = client
        f = _add(db, drive_dir, "v.mp4")
        _row(db, "alice", f, pos, dur, ago=ago)

        assert _dismiss(c, f.id).status_code == 204
        assert _snapshot(db, "alice", f.id).dismissed_at is not None

    def test_spec_core_070_a_repeat_dismiss_writes_now_again(self, client):
        c, db, drive_dir, _ = client
        f = _add(db, drive_dir, "v.mp4")
        _row(db, "alice", f, 50, 100)

        assert _dismiss(c, f.id).status_code == 204
        first = _snapshot(db, "alice", f.id).dismissed_at
        time.sleep(0.05)
        assert _dismiss(c, f.id).status_code == 204
        second = _snapshot(db, "alice", f.id).dismissed_at

        assert first is not None and second is not None
        assert str(second) > str(first)

    def test_spec_core_070_no_response_carries_dismissed_at(self, client):
        c, db, drive_dir, _ = client
        f = _add(db, drive_dir, "v.mp4")
        _row(db, "alice", f, 50, 100)
        assert _dismiss(c, f.id).status_code == 204

        bodies = [
            c.get(f"/api/drives/{TEST_DRIVE}/watch-history?filter=all", cookies=ALICE).json(),
            c.get(f"/api/drives/{TEST_DRIVE}/watch-history", cookies=ALICE).json(),
            c.get(f"/api/files/{f.id}/progress", cookies=ALICE).json(),
            c.get(f"/api/files/{f.id}", cookies=ALICE).json(),
            c.get(f"/api/drives/{TEST_DRIVE}/shelves?by=watch&per_shelf=60",
                  headers={"X-Lit-Viewer": "alice"}).json(),
        ]

        assert f.id in json.dumps(bodies[0])
        for body in bodies:
            assert "dismissed_at" not in _keys(body)


class TestBackOnTheDesk:
    """SPEC-CORE-070 I6: only a later POST /progress clears a dismiss."""

    @pytest.mark.parametrize(
        "body", [{}, {"position": 60.0, "duration": 100.0}], ids=["view-only", "position"]
    )
    def test_spec_core_070_a_later_progress_post_puts_it_back(self, client, body):
        c, db, drive_dir, _ = client
        f = _add(db, drive_dir, "v.mp4")
        assert c.post(f"/api/files/{f.id}/progress", json={"position": 50.0, "duration": 100.0},
                      cookies=ALICE).status_code == 200
        assert _dismiss(c, f.id).status_code == 204
        assert _desk(c) == []
        assert _shelf(c, "continue")["items"] == []

        time.sleep(0.05)
        assert c.post(f"/api/files/{f.id}/progress", json=body, cookies=ALICE).status_code == 200

        assert _desk(c) == [f.id]
        assert [i["id"] for i in _shelf(c, "continue")["items"]] == [f.id]

    def test_spec_core_070_reads_played_ranges_and_comments_do_not_clear_it(self, client):
        from tests.test_comments import _clear_rate_limits

        c, db, drive_dir, _ = client
        f = _add(db, drive_dir, "v.mp4")
        assert c.post(f"/api/files/{f.id}/progress", json={"position": 50.0, "duration": 100.0},
                      cookies=ALICE).status_code == 200
        assert _dismiss(c, f.id).status_code == 204
        dismissed = _snapshot(db, "alice", f.id).dismissed_at
        _clear_rate_limits()

        time.sleep(0.05)
        assert c.get(f"/api/files/{f.id}/progress", cookies=ALICE).status_code == 200
        assert c.get(f"/api/files/{f.id}", cookies=ALICE).status_code == 200
        assert c.post(f"/api/files/{f.id}/played-ranges",
                      json={"ranges": [{"start": 0, "end": 5}]},
                      cookies=ALICE).status_code == 204
        assert c.post(f"/api/files/{f.id}/comments", json={"body": "hi"},
                      cookies=ALICE).status_code == 201
        for q in ("filter=all", "filter=unfinished", "filter=continue"):
            c.get(f"/api/drives/{TEST_DRIVE}/watch-history?{q}", cookies=ALICE)
        _shelf(c, "continue")

        assert _snapshot(db, "alice", f.id).dismissed_at == dismissed
        assert _desk(c) == []
        assert _shelf(c, "continue")["items"] == []

    def test_spec_core_070_delete_then_post_starts_a_row_that_is_not_set_aside(self, client):
        c, db, drive_dir, _ = client
        f = _add(db, drive_dir, "v.mp4")
        assert c.post(f"/api/files/{f.id}/progress", json={"position": 50.0, "duration": 100.0},
                      cookies=ALICE).status_code == 200
        assert _dismiss(c, f.id).status_code == 204

        assert c.delete(f"/api/files/{f.id}/progress", cookies=ALICE).status_code == 204
        assert c.post(f"/api/files/{f.id}/progress", json={"position": 50.0, "duration": 100.0},
                      cookies=ALICE).status_code == 200

        assert _snapshot(db, "alice", f.id).dismissed_at is None
        assert _desk(c) == [f.id]


def _protect(tmp_path, drive_dir):
    import app.auth as auth
    import app.config as config

    drives_json = tmp_path / "drives_protected.json"
    drives_json.write_text(json.dumps([
        {"name": TEST_DRIVE, "path": str(drive_dir), "access_group": "private"}
    ]))
    config._drives_cache = None
    config.DRIVES_CONFIG = drives_json

    pw_file = tmp_path / "passwords.json"
    pw_file.write_text(json.dumps([{"password": "secret123", "groups": ["private"]}]))
    auth._passwords_cache = None
    orig = auth.PASSWORDS_CONFIG
    auth.PASSWORDS_CONFIG = pw_file
    auth.load_passwords()
    return orig


def _unprotect(orig):
    import app.auth as auth

    auth.PASSWORDS_CONFIG = orig
    auth._passwords_cache = None


class TestDismissRefused:
    """SPEC-CORE-070 I7: who may dismiss, and what is written when refused."""

    def test_spec_core_070_without_a_viewer_it_is_204_and_writes_nothing(self, client):
        c, db, drive_dir, _ = client
        f = _add(db, drive_dir, "v.mp4")
        gone = _add(db, drive_dir, "gone.mp4", missing_since=_now())
        binned = _add(db, drive_dir, "binned.mp4", deleted_at=_now())
        for row in (f, gone, binned):
            _row(db, "alice", row, 50, 100)

        for file_id in (f.id, gone.id, binned.id, "zzNOTFOUNDzz"):
            assert _dismiss(c, file_id, cookies={}).status_code == 204

        for row in (f, gone, binned):
            assert _snapshot(db, "alice", row.id).dismissed_at is None
        assert f.id in _desk(c)

    def test_spec_core_070_without_a_viewer_a_locked_file_is_204(self, client, tmp_path):
        c, db, drive_dir, _ = client
        f = _add(db, drive_dir, "v.mp4")
        _row(db, "alice", f, 50, 100)
        orig = _protect(tmp_path, drive_dir)
        try:
            res = _dismiss(c, f.id, cookies={})
        finally:
            _unprotect(orig)

        assert res.status_code == 204
        assert _snapshot(db, "alice", f.id).dismissed_at is None

    def test_spec_core_070_no_row_missing_or_trashed_is_404_and_writes_nothing(self, client):
        c, db, drive_dir, _ = client
        eligible = _add(db, drive_dir, "ok.mp4")
        no_row = _add(db, drive_dir, "never.mp4")
        gone = _add(db, drive_dir, "gone.mp4", missing_since=_now())
        binned = _add(db, drive_dir, "binned.mp4", deleted_at=_now())
        for row in (eligible, gone, binned):
            _row(db, "alice", row, 50, 100)
        _row(db, "bob", no_row, 50, 100)
        rows_before = db.query(WatchHistory).count()

        assert _dismiss(c, eligible.id).status_code == 204
        assert _dismiss(c, no_row.id).status_code == 404
        assert _dismiss(c, gone.id).status_code == 404
        assert _dismiss(c, binned.id).status_code == 404
        assert _dismiss(c, "zzNOTFOUNDzz").status_code == 404

        db.expire_all()
        assert db.query(WatchHistory).count() == rows_before
        assert _snapshot(db, "alice", no_row.id) is None
        assert _snapshot(db, "bob", no_row.id).dismissed_at is None
        assert _snapshot(db, "alice", gone.id).dismissed_at is None
        assert _snapshot(db, "alice", binned.id).dismissed_at is None

    def test_spec_core_070_a_locked_drive_is_404_and_writes_nothing(self, client, tmp_path):
        c, db, drive_dir, _ = client
        f = _add(db, drive_dir, "v.mp4")
        _row(db, "alice", f, 50, 100)
        orig = _protect(tmp_path, drive_dir)
        try:
            locked = _dismiss(c, f.id)
            after_locked = _snapshot(db, "alice", f.id).dismissed_at
            unlock = c.post("/api/auth/unlock", json={"password": "secret123"})
            unlocked = _dismiss(c, f.id)
        finally:
            _unprotect(orig)

        assert locked.status_code == 404
        assert after_locked is None
        assert unlock.status_code == 200
        assert unlocked.status_code == 204
