"""Acceptance tests for ``GET /api/drives/{drive}/watch-history?filter=not_continue``.

SPEC-CORE-075, invariant I6 of docs/specs/home-app-entries.md.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

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


def _set_aside(db, nickname, file) -> None:
    db.execute(
        text(
            "UPDATE watch_history SET dismissed_at = last_played_at "
            "WHERE viewer_id = :v AND file_id = :f"
        ),
        {"v": nickname_to_viewer_id(nickname), "f": file.id},
    )
    db.commit()


def _ids(c, flt, cookies=ALICE, **params) -> list[str]:
    query = "&".join(f"{k}={v}" for k, v in {"filter": flt, "limit": 50, **params}.items())
    res = c.get(f"/api/drives/{TEST_DRIVE}/watch-history?{query}", cookies=cookies)
    assert res.status_code == 200, res.text
    return [item["id"] for item in res.json()["data"]]


def _mixed_population(db, drive_dir) -> None:
    """Rows on both sides of every edge of the desk predicate, plus rows no filter lists."""
    cases = [
        ("desk-mid.mp4", 50, 100, timedelta(minutes=1)),
        ("desk-3pct.mp4", 3, 100, timedelta(minutes=2)),
        ("under-3pct.mp4", 2.9, 100, timedelta(minutes=3)),
        ("desk-just-under-90.mp4", 107.9, 120, timedelta(minutes=4)),
        ("at-90.mp4", 108, 120, timedelta(minutes=5)),
        ("finished.mp4", 120, 120, timedelta(minutes=6)),
        ("view-only.mp4", 0, 0, timedelta(minutes=7)),
        ("desk-13d.mp4", 50, 100, timedelta(days=13, hours=23)),
        ("stale-14d.mp4", 50, 100, timedelta(days=14, hours=1)),
        ("aside.mp4", 50, 100, timedelta(minutes=8)),
    ]
    for name, pos, dur, ago in cases:
        f = _add(db, drive_dir, name)
        _row(db, "alice", f, pos, dur, ago=ago)
        if name == "aside.mp4":
            _set_aside(db, "alice", f)

    bobs = _add(db, drive_dir, "bobs.mp4")
    _row(db, "bob", bobs, 0, 0)
    gone = _add(db, drive_dir, "gone.mp4", missing_since=_now())
    binned = _add(db, drive_dir, "binned.mp4", deleted_at=_now())
    foreign = _add(db, drive_dir, "foreign.mp4", drive=OTHER_DRIVE)
    for f in (gone, binned, foreign):
        _row(db, "alice", f, 0, 0)


class TestNotContinueIsAllMinusContinue:
    """SPEC-CORE-075 I6: the rows ``all`` returns that ``continue`` does not."""

    def test_spec_core_075_equals_all_minus_continue_in_alls_order(self, client):
        c, db, drive_dir, _ = client
        _mixed_population(db, drive_dir)

        everything = _ids(c, "all")
        desk = set(_ids(c, "continue"))
        rest = _ids(c, "not_continue")

        assert desk, "the population puts rows on the desk"
        assert rest == [i for i in everything if i not in desk]

    def test_spec_core_075_keeps_finished_view_only_stale_and_set_aside_rows(self, client):
        c, db, drive_dir, _ = client
        _mixed_population(db, drive_dir)
        by_name = {f.filename: f.id for f in db.query(File).all()}

        rest = set(_ids(c, "not_continue"))

        for name in ("under-3pct.mp4", "at-90.mp4", "finished.mp4", "view-only.mp4",
                     "stale-14d.mp4", "aside.mp4"):
            assert by_name[name] in rest, name
        for name in ("desk-mid.mp4", "desk-3pct.mp4", "desk-just-under-90.mp4",
                     "desk-13d.mp4"):
            assert by_name[name] not in rest, name
        for name in ("bobs.mp4", "gone.mp4", "binned.mp4", "foreign.mp4"):
            assert by_name[name] not in rest, name

    def test_spec_core_075_another_viewer_gets_their_own_rows(self, client):
        c, db, drive_dir, _ = client
        _mixed_population(db, drive_dir)
        bobs = db.query(File).filter(File.filename == "bobs.mp4").one()

        assert _ids(c, "not_continue", cookies=BOB) == [bobs.id]


class TestNotContinueOrderAndLimit:
    """SPEC-CORE-075 I6: newest first, desk rows removed before ``limit``, ``type`` before ``limit``."""

    def test_spec_core_075_newest_last_played_first(self, client):
        c, db, drive_dir, _ = client
        old = _add(db, drive_dir, "old.mp4")
        mid = _add(db, drive_dir, "mid.mp4")
        new = _add(db, drive_dir, "new.mp4")
        _row(db, "alice", old, 100, 100, ago=timedelta(days=3))
        _row(db, "alice", mid, 0, 0, ago=timedelta(days=2))
        _row(db, "alice", new, 100, 100, ago=timedelta(days=1))

        assert _ids(c, "not_continue") == [new.id, mid.id, old.id]

    def test_spec_core_075_desk_rows_do_not_count_against_limit(self, client):
        c, db, drive_dir, _ = client
        for i in range(3):
            f = _add(db, drive_dir, f"desk{i}.mp4")
            _row(db, "alice", f, 50, 100, ago=timedelta(minutes=i + 1))
        older_a = _add(db, drive_dir, "done-a.mp4")
        older_b = _add(db, drive_dir, "done-b.mp4")
        _row(db, "alice", older_a, 100, 100, ago=timedelta(hours=1))
        _row(db, "alice", older_b, 0, 0, ago=timedelta(hours=2))

        assert _ids(c, "not_continue", limit=2) == [older_a.id, older_b.id]
        assert _ids(c, "not_continue", limit=1) == [older_a.id]

    def test_spec_core_075_type_narrows_before_limit(self, client):
        c, db, drive_dir, _ = client
        for i in range(3):
            v = _add(db, drive_dir, f"v{i}.mp4")
            _row(db, "alice", v, 100, 100, ago=timedelta(hours=i + 1))
        pdf = _add(db, drive_dir, "book.pdf", file_type="document", mime="application/pdf")
        _row(db, "alice", pdf, 0, 0, ago=timedelta(days=5))

        assert _ids(c, "not_continue", type="pdf", limit=1) == [pdf.id]
        assert pdf.id not in _ids(c, "not_continue", type="video")

    def test_spec_core_075_empty_when_every_row_is_on_the_desk(self, client):
        c, db, drive_dir, _ = client
        f = _add(db, drive_dir, "v.mp4")
        _row(db, "alice", f, 50, 100)

        assert _ids(c, "not_continue") == []


class TestNotContinueAccess:
    """SPEC-CORE-075 I6 and §6: no viewer, unknown and locked drives."""

    def test_spec_core_075_without_a_viewer_it_is_an_empty_list(self, client):
        c, db, drive_dir, _ = client
        f = _add(db, drive_dir, "v.mp4")
        _row(db, "alice", f, 100, 100)

        res = c.get(f"/api/drives/{TEST_DRIVE}/watch-history?filter=not_continue")

        assert res.status_code == 200
        assert res.json() == {"data": []}

    def test_spec_core_075_unknown_drive_is_404(self, client):
        c, *_ = client

        res = c.get("/api/drives/nowhere/watch-history?filter=not_continue", cookies=ALICE)

        assert res.status_code == 404

    def test_spec_core_075_a_locked_drive_is_404(self, client, tmp_path):
        import app.auth as auth
        import app.config as config

        c, db, drive_dir, _ = client
        f = _add(db, drive_dir, "v.mp4")
        _row(db, "alice", f, 100, 100)
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
        try:
            locked = c.get(
                f"/api/drives/{TEST_DRIVE}/watch-history?filter=not_continue", cookies=ALICE
            )
            assert c.post("/api/auth/unlock", json={"password": "secret123"}).status_code == 200
            unlocked = c.get(
                f"/api/drives/{TEST_DRIVE}/watch-history?filter=not_continue", cookies=ALICE
            )
        finally:
            auth.PASSWORDS_CONFIG = orig
            auth._passwords_cache = None

        assert locked.status_code == 404
        assert unlocked.status_code == 200
        assert [i["id"] for i in unlocked.json()["data"]] == [f.id]
