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
        # deleted, and it names the four cases this class used to own -- the
        # `str.title()` regressions, which are the ones the shared table
        # gained from the move and so the ones a later tidy-up is most
        # likely to read as duplicates. A count would not say which cases
        # survived; these are the ones that have to.
        moved_here = {
            "02 charon's burden.mp3",
            "6484215695_3df06f6b39_o.jpg",
            "MacBook-Neo-review.mp4",
            "ヤンニョムチキン-韓国風-甘辛.mp4",
        }
        assert moved_here <= {case["filename"] for case in CASES}


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
