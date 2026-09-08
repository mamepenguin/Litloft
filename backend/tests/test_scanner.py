import asyncio
import json
import shutil
import subprocess
from pathlib import Path

import pytest

import app.config as config
from app.models import File
from app.services import scanner as scanner_module
from app.services.scanner import (
    _filename_to_title,
    _get_folder_path,
    register_single_file,
)


class TestFilenameToTitle:
    """The rule itself is measured in `test_filename_title_parity.py`.

    Its cases used to live here as three inline tables, and the frontend
    grew a fourth. They are one table now, in
    `fixtures/filename_title.json`, which both suites read — the cases that
    matter most to the frontend (interior capitals, apostrophes, digits)
    were the ones only this file had.
    """

    def test_is_measured_against_the_shared_table(self):
        from tests.test_filename_title_parity import CASES

        # Not a redirect note in a comment: this fails if the parity file is
        # deleted. The four names are the `str.title()` regressions --
        # interior capitals, an apostrophe, a leading digit, a non-Latin
        # script. They read as duplicates of the simpler cases, so a tidy-up
        # is most likely to drop exactly these, and a count would not say
        # which cases survived.
        must_survive = {
            "02 charon's burden.mp3",
            "6484215695_3df06f6b39_o.jpg",
            "MacBook-Neo-review.mp4",
            "ヤンニョムチキン-韓国風-甘辛.mp4",
        }
        assert must_survive <= {case["filename"] for case in CASES}


class TestGetFolderPath:
    def test_subfolder(self, tmp_path):
        base = tmp_path / "drive"
        base.mkdir()
        file_path = base / "旅行" / "video.mp4"
        assert _get_folder_path(file_path, base) == "旅行"

    def test_nested_subfolder(self, tmp_path):
        base = tmp_path / "drive"
        base.mkdir()
        file_path = base / "旅行" / "2024" / "summer.mp4"
        assert _get_folder_path(file_path, base) == "旅行/2024"

    def test_deeply_nested(self, tmp_path):
        base = tmp_path / "drive"
        base.mkdir()
        file_path = base / "a" / "b" / "c" / "video.mp4"
        assert _get_folder_path(file_path, base) == "a/b/c"

    def test_root_file(self, tmp_path):
        base = tmp_path / "drive"
        base.mkdir()
        file_path = base / "video.mp4"
        assert _get_folder_path(file_path, base) == ""


class TestScanAllDrivesIsolation:
    """One drive's unexpected scan_drive failure must not strand every
    drive scheduled after it in the same startup sweep.

    Regression for the case where an ffmpeg subprocess call raised an
    uncaught UnicodeDecodeError partway through one drive's scan: the
    for-loop in scan_all_drives had no per-drive try/except, so the
    exception propagated out of the whole background task (visible only
    as an easy-to-miss "Task exception was never retrieved" asyncio
    warning) and every later drive in drives.json silently never got
    scanned — on every restart, since the failure was deterministic.
    """

    def test_continues_past_a_failing_drive(self, monkeypatch):
        monkeypatch.setattr(config, "get_drive_names", lambda: ["a", "b", "c"])

        calls: list[str] = []

        async def fake_scan_drive(drive_name: str) -> dict[str, int]:
            calls.append(drive_name)
            if drive_name == "b":
                raise RuntimeError("boom")
            return {"added": 0, "missing": 0, "recovered": 0, "moved": 0, "total": 0}

        monkeypatch.setattr(scanner_module, "scan_drive", fake_scan_drive)

        # Not asyncio.run(): this repo's event-loop hygiene test forbids it
        # in test files (it resets the thread's current-loop slot on exit,
        # which can break unrelated tests run in the same session — see
        # test_event_loop_hygiene.py). A private loop touches no shared
        # state.
        loop = asyncio.new_event_loop()
        try:
            results = loop.run_until_complete(scanner_module.scan_all_drives())
        finally:
            loop.close()

        # All three drives were attempted — "c" was not stranded by "b".
        assert calls == ["a", "b", "c"]
        # Only the drives that actually succeeded appear in the result.
        assert set(results.keys()) == {"a", "c"}


class TestAudioOnlyMp4Registration:
    """A ``.mp4`` file that contains only an audio stream must register
    as ``audio/mp4`` with ``file_type=audio`` so the UI shows the right
    icon and the cloud STT pipeline doesn't try to send it as video
    (hako 4t5FWrH4IpLUlGDXxh7cO)."""

    def test_audio_only_mp4_registers_as_audio(self, tmp_path, db_session, monkeypatch):
        drive_dir = tmp_path / "drive"
        drive_dir.mkdir()
        drives_json = tmp_path / "drives.json"
        drives_json.write_text(json.dumps([
            {"name": "test-drive", "path": str(drive_dir)}
        ]))
        monkeypatch.setattr(config, "DRIVES_CONFIG", drives_json)
        monkeypatch.setattr(config, "_drives_cache", None)
        data_dir = tmp_path / "data"
        data_dir.mkdir()
        monkeypatch.setattr(config, "DATA_DIR", data_dir)
        monkeypatch.setattr(config, "THUMBNAILS_DIR", data_dir / "thumbnails")

        audio_only = drive_dir / "podcast.mp4"
        result = subprocess.run(
            [
                "ffmpeg", "-y", "-v", "quiet",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
                "-c:a", "aac", str(audio_only),
            ],
            check=False,
        )
        assert result.returncode == 0, "ffmpeg fixture generation failed"

        file_id = register_single_file(db_session, "test-drive", audio_only)
        db_session.commit()

        record = db_session.query(File).filter(File.id == file_id).first()
        assert record is not None
        assert record.file_type == "audio"
        assert record.mime_type == "audio/mp4"


class TestBackfillMangledTitles:
    """`str.title()` damage is invisible to a rescan.

    ``scanner`` only re-derives a title when the filename changes, so rows
    imported before the formatter was fixed keep their mangled titles forever.
    """

    def _table(self, tmp_path):
        from sqlalchemy import create_engine, text

        engine = create_engine(f"sqlite:///{tmp_path / 'backfill.db'}")
        with engine.begin() as conn:
            conn.execute(text(
                "CREATE TABLE files (id INTEGER PRIMARY KEY, filename TEXT, title TEXT)"
            ))
        return engine

    def _insert(self, engine, rows, first_id=1):
        from sqlalchemy import text

        with engine.begin() as conn:
            for i, (filename, title) in enumerate(rows, first_id):
                conn.execute(
                    text("INSERT INTO files (id, filename, title) VALUES (:i, :f, :t)"),
                    {"i": i, "f": filename, "t": title},
                )

    def _titles(self, engine):
        from sqlalchemy import text

        with engine.begin() as conn:
            return [r[0] for r in conn.execute(text("SELECT title FROM files ORDER BY id"))]

    def test_repairs_titles_the_old_formatter_produced(self, tmp_path, monkeypatch):
        from app import database

        monkeypatch.setattr(config, "DATA_DIR", tmp_path / "data")
        engine = self._table(tmp_path)
        self._insert(engine, [
            ("02 charon's burden.mp3", "02 Charon'S Burden"),
            ("MacBook-Neo-review.mp4", "Macbook Neo Review"),
            ("6484215695_3df06f6b39_o.jpg", "6484215695 3Df06F6B39 O"),
        ])

        database._backfill_mangled_titles(engine)

        assert self._titles(engine) == [
            "02 charon's burden",
            "MacBook-Neo-review",
            "6484215695 3df06f6b39 o",
        ]

    def test_leaves_a_title_the_user_wrote(self, tmp_path, monkeypatch):
        """A hand-written title cannot equal the old derivation, so it survives."""
        from app import database

        monkeypatch.setattr(config, "DATA_DIR", tmp_path / "data")
        engine = self._table(tmp_path)
        self._insert(engine, [
            ("MacBook-Neo-review.mp4", "The one where the hinge breaks"),
            ("02 charon's burden.mp3", "Charon's Burden (live)"),
        ])

        database._backfill_mangled_titles(engine)

        assert self._titles(engine) == [
            "The one where the hinge breaks",
            "Charon's Burden (live)",
        ]

    def test_runs_once(self, tmp_path, monkeypatch):
        """The marker stops a later hand-typed old-shape title being rewritten."""
        from app import database

        monkeypatch.setattr(config, "DATA_DIR", tmp_path / "data")
        engine = self._table(tmp_path)
        self._insert(engine, [("MacBook-Neo-review.mp4", "Macbook Neo Review")])

        database._backfill_mangled_titles(engine)
        assert self._titles(engine) == ["MacBook-Neo-review"]

        self._insert(engine, [("MacBook-Neo-review.mp4", "Macbook Neo Review")], first_id=2)
        database._backfill_mangled_titles(engine)
        assert self._titles(engine)[1] == "Macbook Neo Review"

    def test_survives_a_row_with_no_filename(self, tmp_path, monkeypatch):
        from app import database

        monkeypatch.setattr(config, "DATA_DIR", tmp_path / "data")
        engine = self._table(tmp_path)
        self._insert(engine, [(None, "Some Title")])

        database._backfill_mangled_titles(engine)

        assert self._titles(engine) == ["Some Title"]


class TestLetterboxedThumbnailDetection:
    """Which stored picture thumbnails the scan replaces as it walks a drive.

    The replacement is gradual on purpose — a library does not stop to
    regenerate everything — so the question is asked per file and has to
    be both cheap and exact. Cheap: the stored dimensions answer it
    without opening anything for the pictures that need no work. Exact: a
    thumbnail that is already right must never be rewritten, or the scan
    regenerates the same files forever.
    """

    def _record(self, tmp_path, monkeypatch, size, thumb_size):
        from PIL import Image

        monkeypatch.setattr(config, "THUMBNAILS_DIR", tmp_path)
        if thumb_size is not None:
            Image.new("RGB", thumb_size, (10, 10, 10)).save(tmp_path / "t.jpg")
        return File(
            filename="p.jpg",
            title="p",
            drive="d",
            folder_path="",
            file_path="p.jpg",
            file_size=1,
            file_type="image",
            mime_type="image/jpeg",
            thumbnail_path="t.jpg" if thumb_size else None,
            image_width=size[0],
            image_height=size[1],
        )

    def test_a_portrait_still_stored_as_a_landscape_frame_is_replaced(
        self, tmp_path, monkeypatch
    ):
        record = self._record(tmp_path, monkeypatch, (768, 1024), (320, 180))
        assert scanner_module._is_letterboxed_image_thumbnail(record) is True

    def test_a_portrait_already_at_its_own_shape_is_left_alone(
        self, tmp_path, monkeypatch
    ):
        record = self._record(tmp_path, monkeypatch, (768, 1024), (240, 320))
        assert scanner_module._is_letterboxed_image_thumbnail(record) is False

    def test_a_sixteen_by_nine_picture_is_never_replaced(self, tmp_path, monkeypatch):
        # Its old thumbnail and its new one are the same bytes: the frame
        # it was padded onto was its own shape. Replacing it would be work
        # that repeats on every scan and changes nothing.
        record = self._record(tmp_path, monkeypatch, (1920, 1080), (320, 180))
        assert scanner_module._is_letterboxed_image_thumbnail(record) is False

    def test_a_picture_with_no_stored_dimensions_is_left_alone(
        self, tmp_path, monkeypatch
    ):
        record = self._record(tmp_path, monkeypatch, (768, 1024), (320, 180))
        record.image_width = None
        record.image_height = None
        assert scanner_module._is_letterboxed_image_thumbnail(record) is False

    def test_a_record_with_no_thumbnail_path_is_not_a_letterbox(
        self, tmp_path, monkeypatch
    ):
        # The relocation branch above it already regenerates this case,
        # and answering True here would make both branches fire.
        record = self._record(tmp_path, monkeypatch, (768, 1024), None)
        assert scanner_module._is_letterboxed_image_thumbnail(record) is False

    def test_a_thumbnail_path_pointing_at_nothing_is_not_a_letterbox(
        self, tmp_path, monkeypatch
    ):
        # The row says there is a thumbnail and the disk disagrees. This
        # is the branch the name above was reaching for and never
        # entered: it returned early on the empty path instead.
        record = self._record(tmp_path, monkeypatch, (768, 1024), (320, 180))
        (tmp_path / "t.jpg").unlink()
        assert scanner_module._is_letterboxed_image_thumbnail(record) is False

    def test_a_thumbnail_that_will_not_open_is_not_a_letterbox(
        self, tmp_path, monkeypatch
    ):
        # Truncated or not a JPEG at all. Guessing either way would
        # either skip a file forever or rewrite it on every scan.
        record = self._record(tmp_path, monkeypatch, (768, 1024), (320, 180))
        (tmp_path / "t.jpg").write_bytes(b"not a jpeg")
        assert scanner_module._is_letterboxed_image_thumbnail(record) is False

    def test_a_shape_whose_fitted_edge_lands_on_a_half_is_replaced(
        self, tmp_path, monkeypatch
    ):
        # 640x361 fits to 320x180.5. Rounded to even that is 180, which
        # reads as "already 320x180, leave it" — so this ratio kept its
        # letterbox through every scan there would ever be. The
        # generators round a half up, and so does the prediction.
        record = self._record(tmp_path, monkeypatch, (640, 361), (320, 180))
        assert scanner_module._is_letterboxed_image_thumbnail(record) is True


class TestLetterboxedThumbnailReplacement:
    """The scan actually replacing them, not just recognising them.

    `TestLetterboxedThumbnailDetection` calls the predicate directly, so
    it says nothing about the branch that acts on it: that the branch is
    reachable at all, that it is handed the picture generator, that it
    writes to the path the endpoint reads, or that the relocation branch
    above it does not swallow the case first. Deleting the body left
    every other test green.
    """

    def _drive(self, tmp_path, monkeypatch):
        drive_dir = tmp_path / "drive"
        drive_dir.mkdir()
        drives_json = tmp_path / "drives.json"
        drives_json.write_text(
            json.dumps([{"name": "test-drive", "path": str(drive_dir)}])
        )
        monkeypatch.setattr(config, "DRIVES_CONFIG", drives_json)
        monkeypatch.setattr(config, "_drives_cache", None)
        data_dir = tmp_path / "data"
        data_dir.mkdir()
        monkeypatch.setattr(config, "DATA_DIR", data_dir)
        monkeypatch.setattr(config, "THUMBNAILS_DIR", data_dir / "thumbnails")
        return drive_dir

    def _letterbox(self, path):
        """The shape every picture used to be stored as."""
        from PIL import Image

        path.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (320, 180), (0, 0, 0)).save(path, quality=95)

    def test_a_scan_replaces_a_letterboxed_thumbnail_with_the_picture_box(
        self, tmp_path, db_session, monkeypatch
    ):
        from PIL import Image

        from app.services.thumbnail import image_thumbnail_size

        drive_dir = self._drive(tmp_path, monkeypatch)
        photo = drive_dir / "portrait.jpg"
        Image.new("RGB", (768, 1024), (30, 90, 160)).save(photo)

        file_id = register_single_file(db_session, "test-drive", photo)
        db_session.commit()
        record = db_session.query(File).filter(File.id == file_id).first()
        stored = config.THUMBNAILS_DIR / record.thumbnail_path

        # Put the drive back into the state an upgrade finds it in.
        self._letterbox(stored)
        with Image.open(stored) as before:
            assert before.size == (320, 180)

        scanner_module._scan_and_register(db_session, "test-drive")
        db_session.commit()

        with Image.open(stored) as after:
            assert after.size == image_thumbnail_size(768, 1024) == (240, 320)

    def test_a_scan_leaves_a_picture_that_is_already_right_alone(
        self, tmp_path, db_session, monkeypatch
    ):
        # The other half of the branch. Rewriting a correct thumbnail on
        # every scan would be invisible except as churn — and as an mtime
        # that keeps invalidating every reader's cache.
        drive_dir = self._drive(tmp_path, monkeypatch)
        photo = drive_dir / "portrait.jpg"
        from PIL import Image

        Image.new("RGB", (768, 1024), (30, 90, 160)).save(photo)

        file_id = register_single_file(db_session, "test-drive", photo)
        db_session.commit()
        record = db_session.query(File).filter(File.id == file_id).first()
        stored = config.THUMBNAILS_DIR / record.thumbnail_path
        first = stored.stat().st_mtime_ns, stored.read_bytes()

        scanner_module._scan_and_register(db_session, "test-drive")
        db_session.commit()

        assert (stored.stat().st_mtime_ns, stored.read_bytes()) == first

    def test_a_sixteen_by_nine_picture_survives_a_scan_untouched(
        self, tmp_path, db_session, monkeypatch
    ):
        # Its stored thumbnail *is* 320x180 and always was. The predicate
        # has to tell it apart from a letterbox, or every scan rewrites
        # every 16:9 picture in the library forever.
        drive_dir = self._drive(tmp_path, monkeypatch)
        photo = drive_dir / "wide.jpg"
        from PIL import Image

        Image.new("RGB", (1920, 1080), (30, 90, 160)).save(photo)

        file_id = register_single_file(db_session, "test-drive", photo)
        db_session.commit()
        record = db_session.query(File).filter(File.id == file_id).first()
        stored = config.THUMBNAILS_DIR / record.thumbnail_path
        first = stored.stat().st_mtime_ns

        scanner_module._scan_and_register(db_session, "test-drive")
        db_session.commit()

        with Image.open(stored) as thumbnail:
            assert thumbnail.size == (320, 180)
        assert stored.stat().st_mtime_ns == first

    def test_the_replacement_is_never_visible_half_written(
        self, tmp_path, db_session, monkeypatch
    ):
        """The path being rewritten is the one the endpoint serves.

        Not timing-dependent: the generator is replaced with one that
        writes a partial file and then fails, which is the state a reader
        would be served if the write went straight to the destination.
        """
        from PIL import Image

        drive_dir = self._drive(tmp_path, monkeypatch)
        photo = drive_dir / "portrait.jpg"
        Image.new("RGB", (768, 1024), (30, 90, 160)).save(photo)

        file_id = register_single_file(db_session, "test-drive", photo)
        db_session.commit()
        record = db_session.query(File).filter(File.id == file_id).first()
        stored = config.THUMBNAILS_DIR / record.thumbnail_path
        self._letterbox(stored)
        served = stored.read_bytes()

        def half_writes_then_fails(source, destination):
            Path(destination).write_bytes(b"")
            return False

        monkeypatch.setattr(
            scanner_module,
            "get_thumbnail_generator",
            lambda *_: half_writes_then_fails,
        )
        scanner_module._scan_and_register(db_session, "test-drive")
        db_session.commit()

        assert stored.read_bytes() == served
        assert stored.stat().st_size > 0
