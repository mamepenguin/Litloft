"""Renaming or moving a video carries its sidecar subtitles with it."""
import shutil

import app.services.subtitle as subtitle
from app.models import File
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
