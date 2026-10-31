"""Renaming or moving a video carries its sidecar subtitles with it."""
import shutil
import unicodedata
from datetime import UTC, datetime

import pytest

import app.config as config
import app.services.event_hooks as event_hooks
import app.services.subtitle as subtitle
from app.services.scanner import _scan_and_register
from app.models import Comment, File, Tag, WatchHistory
from app.services.subtitle import detect_subtitles
from tests.test_target_drive_access import (  # noqa: F401  (fixture)
    FIXTURES_DIR,
    LOCKED_DRIVE,
    LOCKED_PASSWORD,
    OPEN_DRIVE,
    two_drives,
)


def _seed(db, drive_dir, filename="movie.mp4", folder="a", file_type="video",
          mime="video/mp4", drive=OPEN_DRIVE):
    d = drive_dir / folder if folder else drive_dir
    d.mkdir(parents=True, exist_ok=True)
    shutil.copy(FIXTURES_DIR / "short_video.mp4", d / filename)
    row = File(
        filename=filename,
        title=filename,
        drive=drive,
        folder_path=folder,
        file_path=f"{folder}/{filename}" if folder else filename,
        file_size=(d / filename).stat().st_size,
        file_type=file_type,
        mime_type=mime,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _sidecars(drive_dir, folder, *names):
    d = drive_dir / folder if folder else drive_dir
    d.mkdir(parents=True, exist_ok=True)
    for n in names:
        (d / n).write_text(f"content of {n}", encoding="utf-8")


def _tracks(drive_dir, file_path):
    return sorted((s["path"], s["language"]) for s in detect_subtitles(file_path, drive_dir))


def _rename(c, row, name):
    res = c.put(f"/api/files/{row.id}/rename", json={"new_filename": name})
    assert res.status_code == 200, res.text


def _names(d):
    return sorted(p.name for p in d.iterdir())


class TestRename:
    def test_bare_and_language_sidecars_follow(self, two_drives):
        c, db, open_dir, _ = two_drives
        row = _seed(db, open_dir)
        _sidecars(open_dir, "a", "movie.srt", "movie.ja.srt", "movie.en.vtt")
        before = [s["language"] for s in detect_subtitles("a/movie.mp4", open_dir)]

        _rename(c, row, "film.mp4")

        assert _names(open_dir / "a") == ["film.en.vtt", "film.ja.srt", "film.mp4", "film.srt"]
        assert [s["language"] for s in detect_subtitles("a/film.mp4", open_dir)] == before
        assert (open_dir / "a" / "film.ja.srt").read_text(encoding="utf-8") == "content of movie.ja.srt"

    def test_lookalikes_stay(self, two_drives):
        c, db, open_dir, _ = two_drives
        row = _seed(db, open_dir)
        _sidecars(open_dir, "a", "movie.srt", "movie.notes.srt", "movie2.srt")

        _rename(c, row, "film.mp4")

        assert _names(open_dir / "a") == ["film.mp4", "film.srt", "movie.notes.srt", "movie2.srt"]

    def test_extension_only_rename_moves_nothing(self, two_drives):
        c, db, open_dir, _ = two_drives
        row = _seed(db, open_dir)
        _sidecars(open_dir, "a", "movie.ja.srt")

        _rename(c, row, "movie.mkv")

        assert _names(open_dir / "a") == ["movie.ja.srt", "movie.mkv"]

    def test_existing_destination_is_not_overwritten(self, two_drives):
        c, db, open_dir, _ = two_drives
        row = _seed(db, open_dir)
        _sidecars(open_dir, "a", "movie.ja.srt", "movie.en.srt", "film.ja.srt")

        _rename(c, row, "film.mp4")

        a = open_dir / "a"
        assert (a / "film.ja.srt").read_text(encoding="utf-8") == "content of film.ja.srt"
        assert (a / "movie.ja.srt").read_text(encoding="utf-8") == "content of movie.ja.srt"
        assert (a / "film.en.srt").exists()

    def test_non_video_keeps_same_stem_srt(self, two_drives):
        c, db, open_dir, _ = two_drives
        row = _seed(db, open_dir, "movie.txt", file_type="document", mime="text/plain")
        _sidecars(open_dir, "a", "movie.srt")

        _rename(c, row, "film.txt")

        assert _names(open_dir / "a") == ["film.txt", "movie.srt"]

    def test_loft_file_sidecars_follow(self, two_drives):
        c, db, open_dir, _ = two_drives
        row = _seed(db, open_dir, "movie.loft", file_type="document",
                    mime="application/vnd.litloft.loft+json")
        _sidecars(open_dir, "a", "movie.ja.srt")

        _rename(c, row, "film.loft")

        assert (open_dir / "a" / "film.ja.srt").exists()

    def test_failing_sidecar_does_not_fail_the_rename(self, two_drives, monkeypatch):
        c, db, open_dir, _ = two_drives
        row = _seed(db, open_dir)
        _sidecars(open_dir, "a", "movie.ja.srt", "movie.en.srt")
        real_move = shutil.move

        def flaky(src, dst):
            if "movie.ja.srt" in str(src):
                raise OSError("disk says no")
            return real_move(src, dst)

        monkeypatch.setattr(subtitle.shutil, "move", flaky)

        _rename(c, row, "film.mp4")

        assert _names(open_dir / "a") == ["film.en.srt", "film.mp4", "movie.ja.srt"]
        db.expire_all()
        assert db.get(File, row.id).filename == "film.mp4"


class TestMove:
    def test_same_drive_move_carries_sidecars(self, two_drives):
        c, db, open_dir, _ = two_drives
        row = _seed(db, open_dir)
        _sidecars(open_dir, "a", "movie.srt", "movie.ja.vtt", "movie2.srt")
        (open_dir / "b").mkdir()

        res = c.put(f"/api/files/{row.id}/move", json={"target_folder_path": "b"})
        assert res.status_code == 200, res.text

        assert _names(open_dir / "b") == ["movie.ja.vtt", "movie.mp4", "movie.srt"]
        assert _names(open_dir / "a") == ["movie2.srt"]
        assert _tracks(open_dir, "b/movie.mp4") == [
            ("b/movie.ja.vtt", "ja"), ("b/movie.srt", ""),
        ]

    def test_cross_drive_move_carries_sidecars(self, two_drives):
        c, db, open_dir, locked_dir = two_drives
        assert c.post("/api/auth/unlock", json={"password": LOCKED_PASSWORD}).status_code == 200
        row = _seed(db, open_dir)
        _sidecars(open_dir, "a", "movie.srt", "movie.ja.srt")

        res = c.put(
            f"/api/files/{row.id}/move",
            json={"target_drive": LOCKED_DRIVE, "target_folder_path": "z"},
        )
        assert res.status_code == 200, res.text

        assert _names(locked_dir / "z") == ["movie.ja.srt", "movie.mp4", "movie.srt"]
        assert _names(open_dir / "a") == []
        assert _tracks(locked_dir, "z/movie.mp4") == [
            ("z/movie.ja.srt", "ja"), ("z/movie.srt", ""),
        ]

    def test_existing_destination_is_not_overwritten(self, two_drives):
        c, db, open_dir, _ = two_drives
        row = _seed(db, open_dir)
        _sidecars(open_dir, "a", "movie.srt")
        _sidecars(open_dir, "b", "movie.srt")
        (open_dir / "b" / "movie.srt").write_text("theirs", encoding="utf-8")

        res = c.put(f"/api/files/{row.id}/move", json={"target_folder_path": "b"})
        assert res.status_code == 200, res.text

        assert (open_dir / "b" / "movie.srt").read_text(encoding="utf-8") == "theirs"
        assert (open_dir / "a" / "movie.srt").exists()


class TestOrderAndNormalisation:
    def test_a_decomposed_sidecar_name_lands_under_the_composed_target(self, two_drives):
        c, db, open_dir, _ = two_drives
        stem = "動画が濁点"
        row = _seed(db, open_dir, f"{stem}.mp4")
        nfd = unicodedata.normalize("NFD", f"{stem}.ja.srt")
        assert nfd != f"{stem}.ja.srt"
        _sidecars(open_dir, "a", nfd)

        _rename(c, row, "新しい.mp4")

        assert "新しい.ja.srt" in _names(open_dir / "a")
        assert _tracks(open_dir, "a/新しい.mp4") == [("a/新しい.ja.srt", "ja")]


def _batch(c, ids, template):
    res = c.put(
        "/api/files/batch/rename",
        json={"ids": ids, "mode": "template", "template": template},
    )
    assert res.status_code == 200, res.text


class TestBatchRename:
    def test_sidecars_follow_every_renamed_video(self, two_drives):
        c, db, open_dir, _ = two_drives
        rows = [_seed(db, open_dir, n) for n in ("one.mp4", "two.mp4")]
        _sidecars(open_dir, "a", "one.srt", "two.ja.vtt", "twofold.srt")

        _batch(c, [r.id for r in rows], "clip_{n}")

        assert _names(open_dir / "a") == [
            "clip_1.mp4", "clip_1.srt", "clip_2.ja.vtt", "clip_2.mp4", "twofold.srt",
        ]
        assert _tracks(open_dir, "a/clip_2.mp4") == [("a/clip_2.ja.vtt", "ja")]

    def test_a_name_freed_earlier_in_the_batch_takes_its_sidecar(self, two_drives):
        c, db, open_dir, _ = two_drives
        first = _seed(db, open_dir, "clip_2.mp4")
        second = _seed(db, open_dir, "old.mp4")
        _sidecars(open_dir, "a", "clip_2.ja.srt", "old.ja.srt")

        _batch(c, [first.id, second.id], "clip_{n}")

        a = open_dir / "a"
        assert _names(a) == ["clip_1.ja.srt", "clip_1.mp4", "clip_2.ja.srt", "clip_2.mp4"]
        assert (a / "clip_1.ja.srt").read_text(encoding="utf-8") == "content of clip_2.ja.srt"
        assert (a / "clip_2.ja.srt").read_text(encoding="utf-8") == "content of old.ja.srt"


def _upload(c, drive, folder, filename, body=b"1\n00:00:00,000 --> 00:00:01,000\nhi\n"):
    base = f"/api/drives/{drive}/upload"
    init = c.post(
        f"{base}/init",
        json={"filename": filename, "file_size": len(body), "folder_path": folder},
    )
    assert init.status_code == 200, init.text
    upload_id = init.json()["upload_id"]
    chunk = c.post(
        f"{base}/{upload_id}/chunk",
        data={"chunk_index": 0},
        files={"chunk": ("chunk", body)},
    )
    assert chunk.status_code == 200, chunk.text
    done = c.post(f"{base}/{upload_id}/complete")
    assert done.status_code == 200, done.text
    return done.json()


def _subtitle_row(db, name="movie.srt", tagged=False, **state):
    row = File(
        filename=name, title=name, drive=OPEN_DRIVE, folder_path="a",
        file_path=f"a/{name}", file_size=1, file_type="document", mime_type="text/plain",
        **state,
    )
    if tagged:
        row.tags = [Tag(name="soup", drive=OPEN_DRIVE)]
    db.add(row)
    db.commit()
    return row.id


def _srt_rows(db):
    db.expire_all()
    return db.query(File).filter(File.filename.like("%.srt")).all()


def _listing(c, folder):
    res = c.get(f"/api/drives/{OPEN_DRIVE}/files", params={"path": folder})
    assert res.status_code == 200, res.text
    return sorted(f["filename"] for f in res.json()["data"])


@pytest.fixture()
def uploads(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "UPLOAD_DIR", tmp_path / "uploads")


@pytest.mark.usefixtures("uploads")
class TestUploadedSubtitle:
    def test_upload_beside_a_video_creates_no_row_and_the_video_offers_it(self, two_drives):
        c, db, open_dir, _ = two_drives
        row = _seed(db, open_dir)

        answer = _upload(c, OPEN_DRIVE, "a", "movie.srt")

        assert answer == {"status": "sidecar", "drive": OPEN_DRIVE, "file_path": "a/movie.srt"}
        assert (open_dir / "a" / "movie.srt").exists()
        assert _srt_rows(db) == []
        assert _listing(c, "a") == ["movie.mp4"]
        detail = c.get(f"/api/files/{row.id}")
        assert [t["format"] for t in detail.json()["subtitles"]] == ["srt"]

    @pytest.mark.parametrize("act", ["rename", "move"])
    def test_the_track_follows_the_video_and_a_rescan_flags_nothing(self, two_drives, act):
        c, db, open_dir, _ = two_drives
        row = _seed(db, open_dir)
        (open_dir / "b").mkdir()
        _upload(c, OPEN_DRIVE, "a", "movie.srt")

        if act == "rename":
            _rename(c, row, "film.mp4")
            moved = "a/film.mp4"
        else:
            res = c.put(f"/api/files/{row.id}/move", json={"target_folder_path": "b"})
            assert res.status_code == 200, res.text
            moved = "b/movie.mp4"
        db.expire_all()
        _scan_and_register(db, OPEN_DRIVE)

        assert [p for p, _ in _tracks(open_dir, moved)] == [moved[:-3] + "srt"]
        assert _srt_rows(db) == []
        assert db.query(File).filter(File.missing_since.isnot(None)).count() == 0

    @pytest.mark.parametrize(
        "state",
        [{}, {"missing_since": datetime.now(UTC)}, {"deleted_at": datetime.now(UTC)}],
        ids=["active", "missing", "trashed"],
    )
    def test_upload_over_a_path_holding_a_row_removes_the_row(self, two_drives, state):
        c, db, open_dir, _ = two_drives
        (open_dir / "a").mkdir()
        _subtitle_row(db, tagged=True, **state)

        _upload(c, OPEN_DRIVE, "a", "movie.srt")

        assert _srt_rows(db) == []
        assert db.query(Tag).count() == 0
        assert (open_dir / "a" / "movie.srt").exists()

    def test_upload_announces_a_scan_with_nothing_added(self, two_drives, monkeypatch):
        c, _, open_dir, _ = two_drives
        (open_dir / "a").mkdir()
        sent = []

        async def record(event, data):
            sent.append((event, data))

        monkeypatch.setattr(event_hooks, "emit", record)

        _upload(c, OPEN_DRIVE, "a", "movie.srt")

        assert ("scan.complete", {"drive": OPEN_DRIVE, "added": 0, "removed": 0}) in sent

    def test_a_second_upload_of_the_same_subtitle_is_refused_and_the_first_stays(
        self, two_drives
    ):
        c, _, open_dir, _ = two_drives
        (open_dir / "a").mkdir()
        _upload(c, OPEN_DRIVE, "a", "movie.srt", body=b"first")

        res = c.post(
            f"/api/drives/{OPEN_DRIVE}/upload/init",
            json={"filename": "movie.srt", "file_size": 6, "folder_path": "a"},
        )

        assert res.status_code == 409
        assert (open_dir / "a" / "movie.srt").read_bytes() == b"first"

    def test_an_existing_file_of_another_type_still_refuses_the_upload(self, two_drives):
        c, _, open_dir, _ = two_drives
        (open_dir / "a").mkdir()
        (open_dir / "a" / "note.md").write_text("mine", encoding="utf-8")

        res = c.post(
            f"/api/drives/{OPEN_DRIVE}/upload/init",
            json={"filename": "note.md", "file_size": 3, "folder_path": "a"},
        )

        assert res.status_code == 409

    @pytest.mark.parametrize(
        ("name", "kind"), [("clip.mp4", "video"), ("note.md", "document")]
    )
    def test_other_uploads_still_answer_with_the_file(self, two_drives, name, kind):
        c, db, open_dir, _ = two_drives
        (open_dir / "a").mkdir()

        answer = _upload(c, OPEN_DRIVE, "a", name, body=b"# hi\n")

        assert answer["filename"] == name
        assert answer["file_type"] == kind
        assert answer["id"]
        assert db.query(File).filter(File.filename == name).count() == 1

    def test_a_folder_holding_only_an_uploaded_subtitle_is_listed_as_empty(self, two_drives):
        c, db, open_dir, _ = two_drives
        (open_dir / "n").mkdir()
        _upload(c, OPEN_DRIVE, "n", "movie.srt")

        _scan_and_register(db, OPEN_DRIVE)

        folders = c.get(f"/api/drives/{OPEN_DRIVE}/folders").json()
        assert [(f["path"], f["file_count"]) for f in folders if f["path"] == "n"] == [("n", 0)]
        assert (open_dir / "n" / "movie.srt").exists()


class TestScanRemovesSubtitleRows:
    def test_active_and_missing_rows_go_and_the_files_stay(self, two_drives, monkeypatch):
        _, db, open_dir, _ = two_drives
        _sidecars(open_dir, "a", "one.srt", "two.vtt")
        now = datetime.now(UTC)
        ids = [
            _subtitle_row(db, "one.srt"),
            _subtitle_row(db, "two.vtt", missing_since=now),
            _subtitle_row(db, "gone.srt"),
        ]
        sent = []
        monkeypatch.setattr(event_hooks, "emit_sync", lambda event, data: sent.append((event, data)))

        result = _scan_and_register(db, OPEN_DRIVE)

        db.expire_all()
        assert db.query(File).count() == 0
        assert result["missing"] == 0
        assert not [e for e, data in sent if e == "files.missing"
                    and set(data["file_ids"]) & set(ids)]
        assert _names(open_dir / "a") == ["one.srt", "two.vtt"]

    def test_the_tags_of_a_dropped_row_go_with_it(self, two_drives):
        _, db, open_dir, _ = two_drives
        _sidecars(open_dir, "a", "one.srt")
        _subtitle_row(db, "one.srt", tagged=True)

        _scan_and_register(db, OPEN_DRIVE)

        db.expire_all()
        assert db.query(Tag).count() == 0

    def test_a_trashed_row_is_left_alone(self, two_drives):
        _, db, open_dir, _ = two_drives
        _sidecars(open_dir, "a", "one.srt")
        row_id = _subtitle_row(db, "one.srt", deleted_at=datetime.now(UTC))

        _scan_and_register(db, OPEN_DRIVE)

        db.expire_all()
        row = db.get(File, row_id)
        assert row is not None
        assert row.missing_since is None

    def test_comments_and_watch_history_go_with_the_row(self, two_drives):
        _, db, open_dir, _ = two_drives
        _sidecars(open_dir, "a", "one.srt")
        row_id = _subtitle_row(db, "one.srt")
        db.add(Comment(file_id=row_id, viewer_id="v", nickname="n", body="hi"))
        db.add(WatchHistory(file_id=row_id, viewer_id="v", last_played_at=datetime.now(UTC)))
        db.commit()

        _scan_and_register(db, OPEN_DRIVE)

        db.expire_all()
        assert db.query(Comment).filter(Comment.file_id == row_id).count() == 0
        assert db.query(WatchHistory).filter(WatchHistory.file_id == row_id).count() == 0
