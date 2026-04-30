import shutil
from pathlib import Path

import pytest

from tests.conftest import TEST_DRIVE

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _seed(db, drive_dir, filename="test.mp4", folder="旅行", file_type="video"):
    d = drive_dir / folder
    d.mkdir(exist_ok=True)
    shutil.copy(FIXTURES_DIR / "short_video.mp4", d / filename)

    from app.models import File

    file = File(
        filename=filename,
        title="Test",
        drive=TEST_DRIVE,
        folder_path=folder,
        file_path=f"{folder}/{filename}",
        file_size=d.joinpath(filename).stat().st_size,
        file_type=file_type,
        mime_type="video/mp4",
    )
    db.add(file)
    db.commit()
    db.refresh(file)
    return file


def _seed_multiple(db, drive_dir, names, folder="旅行"):
    return [_seed(db, drive_dir, name, folder) for name in names]


class TestTemplateMode:
    def test_basic_sequential_rename(self, client):
        c, db, drive_dir, data_dir = client
        files = _seed_multiple(db, drive_dir, ["a.mp4", "b.mp4", "c.mp4"])
        ids = [f.id for f in files]

        res = c.put("/api/files/batch/rename", json={
            "ids": ids,
            "mode": "template",
            "template": "video_{n}",
        })
        assert res.status_code == 200
        data = res.json()
        assert data["renamed"] == 3
        assert data["results"][0]["new_name"] == "video_1.mp4"
        assert data["results"][1]["new_name"] == "video_2.mp4"
        assert data["results"][2]["new_name"] == "video_3.mp4"
        assert (drive_dir / "旅行" / "video_1.mp4").exists()
        assert (drive_dir / "旅行" / "video_2.mp4").exists()
        assert (drive_dir / "旅行" / "video_3.mp4").exists()

    def test_zero_pad_and_start_number(self, client):
        c, db, drive_dir, data_dir = client
        files = _seed_multiple(db, drive_dir, ["a.mp4", "b.mp4"])
        ids = [f.id for f in files]

        res = c.put("/api/files/batch/rename", json={
            "ids": ids,
            "mode": "template",
            "template": "clip_{n}",
            "start_number": 10,
            "zero_pad": 4,
        })
        assert res.status_code == 200
        data = res.json()
        assert data["results"][0]["new_name"] == "clip_0010.mp4"
        assert data["results"][1]["new_name"] == "clip_0011.mp4"

    def test_original_placeholder(self, client):
        c, db, drive_dir, data_dir = client
        files = _seed_multiple(db, drive_dir, ["sunset.mp4", "beach.mp4"])
        ids = [f.id for f in files]

        res = c.put("/api/files/batch/rename", json={
            "ids": ids,
            "mode": "template",
            "template": "{original}_{n}",
        })
        assert res.status_code == 200
        data = res.json()
        assert data["results"][0]["new_name"] == "sunset_1.mp4"
        assert data["results"][1]["new_name"] == "beach_2.mp4"


class TestRegexMode:
    def test_basic_replacement(self, client):
        c, db, drive_dir, data_dir = client
        files = _seed_multiple(db, drive_dir, ["video_001.mp4", "video_002.mp4"])
        ids = [f.id for f in files]

        res = c.put("/api/files/batch/rename", json={
            "ids": ids,
            "mode": "regex",
            "pattern": "video",
            "replacement": "clip",
        })
        assert res.status_code == 200
        data = res.json()
        assert data["results"][0]["new_name"] == "clip_001.mp4"
        assert data["results"][1]["new_name"] == "clip_002.mp4"

    def test_capture_group(self, client):
        c, db, drive_dir, data_dir = client
        files = _seed_multiple(db, drive_dir, ["2024-01-trip.mp4", "2024-02-trip.mp4"])
        ids = [f.id for f in files]

        res = c.put("/api/files/batch/rename", json={
            "ids": ids,
            "mode": "regex",
            "pattern": r"(\d{4})-(\d{2})-(.+)",
            "replacement": r"\3_\1_\2",
        })
        assert res.status_code == 200
        data = res.json()
        assert data["results"][0]["new_name"] == "trip_2024_01.mp4"
        assert data["results"][1]["new_name"] == "trip_2024_02.mp4"

    def test_invalid_regex(self, client):
        c, db, drive_dir, data_dir = client
        files = _seed_multiple(db, drive_dir, ["test.mp4"])
        ids = [f.id for f in files]

        res = c.put("/api/files/batch/rename", json={
            "ids": ids,
            "mode": "regex",
            "pattern": "[invalid(",
            "replacement": "x",
        })
        assert res.status_code == 400
        assert "regex" in res.json()["detail"].lower()


class TestPrefixSuffixMode:
    def test_add_prefix(self, client):
        c, db, drive_dir, data_dir = client
        files = _seed_multiple(db, drive_dir, ["sunset.mp4", "beach.mp4"])
        ids = [f.id for f in files]

        res = c.put("/api/files/batch/rename", json={
            "ids": ids,
            "mode": "prefix_suffix",
            "action": "add_prefix",
            "value": "2024_",
        })
        assert res.status_code == 200
        data = res.json()
        assert data["results"][0]["new_name"] == "2024_sunset.mp4"
        assert data["results"][1]["new_name"] == "2024_beach.mp4"

    def test_add_suffix(self, client):
        c, db, drive_dir, data_dir = client
        files = _seed_multiple(db, drive_dir, ["sunset.mp4", "beach.mp4"])
        ids = [f.id for f in files]

        res = c.put("/api/files/batch/rename", json={
            "ids": ids,
            "mode": "prefix_suffix",
            "action": "add_suffix",
            "value": "_final",
        })
        assert res.status_code == 200
        data = res.json()
        assert data["results"][0]["new_name"] == "sunset_final.mp4"
        assert data["results"][1]["new_name"] == "beach_final.mp4"

    def test_remove_prefix(self, client):
        c, db, drive_dir, data_dir = client
        files = _seed_multiple(db, drive_dir, ["old_sunset.mp4", "old_beach.mp4"])
        ids = [f.id for f in files]

        res = c.put("/api/files/batch/rename", json={
            "ids": ids,
            "mode": "prefix_suffix",
            "action": "remove_prefix",
            "value": "old_",
        })
        assert res.status_code == 200
        data = res.json()
        assert data["results"][0]["new_name"] == "sunset.mp4"
        assert data["results"][1]["new_name"] == "beach.mp4"

    def test_remove_suffix(self, client):
        c, db, drive_dir, data_dir = client
        files = _seed_multiple(db, drive_dir, ["sunset_raw.mp4", "beach_raw.mp4"])
        ids = [f.id for f in files]

        res = c.put("/api/files/batch/rename", json={
            "ids": ids,
            "mode": "prefix_suffix",
            "action": "remove_suffix",
            "value": "_raw",
        })
        assert res.status_code == 200
        data = res.json()
        assert data["results"][0]["new_name"] == "sunset.mp4"
        assert data["results"][1]["new_name"] == "beach.mp4"

    def test_remove_prefix_no_match(self, client):
        c, db, drive_dir, data_dir = client
        files = _seed_multiple(db, drive_dir, ["sunset.mp4"])
        ids = [f.id for f in files]

        res = c.put("/api/files/batch/rename", json={
            "ids": ids,
            "mode": "prefix_suffix",
            "action": "remove_prefix",
            "value": "nonexistent_",
        })
        assert res.status_code == 200
        assert res.json()["results"][0]["new_name"] == "sunset.mp4"


class TestErrorCases:
    def test_duplicate_in_batch(self, client):
        c, db, drive_dir, data_dir = client
        files = _seed_multiple(db, drive_dir, ["a.mp4", "b.mp4"])
        ids = [f.id for f in files]

        res = c.put("/api/files/batch/rename", json={
            "ids": ids,
            "mode": "template",
            "template": "same_name",
        })
        assert res.status_code == 409
        assert "duplicate" in res.json()["detail"].lower()

    def test_conflict_with_existing_file(self, client):
        c, db, drive_dir, data_dir = client
        # Create a file that will NOT be renamed
        _seed(db, drive_dir, "existing.mp4")
        # Create a file that will be renamed to "existing"
        file = _seed(db, drive_dir, "rename_me.mp4")

        res = c.put("/api/files/batch/rename", json={
            "ids": [file.id],
            "mode": "template",
            "template": "existing",
        })
        assert res.status_code == 409

    def test_invalid_mode(self, client):
        c, db, drive_dir, data_dir = client
        files = _seed_multiple(db, drive_dir, ["a.mp4"])
        ids = [f.id for f in files]

        res = c.put("/api/files/batch/rename", json={
            "ids": ids,
            "mode": "unknown",
            "template": "x",
        })
        assert res.status_code == 422

    def test_missing_template(self, client):
        c, db, drive_dir, data_dir = client
        files = _seed_multiple(db, drive_dir, ["a.mp4"])
        ids = [f.id for f in files]

        res = c.put("/api/files/batch/rename", json={
            "ids": ids,
            "mode": "template",
        })
        assert res.status_code == 422

    def test_missing_regex_fields(self, client):
        c, db, drive_dir, data_dir = client
        files = _seed_multiple(db, drive_dir, ["a.mp4"])
        ids = [f.id for f in files]

        res = c.put("/api/files/batch/rename", json={
            "ids": ids,
            "mode": "regex",
            "pattern": "test",
        })
        assert res.status_code == 422

    def test_file_not_found(self, client):
        c, db, drive_dir, data_dir = client

        res = c.put("/api/files/batch/rename", json={
            "ids": ["zzNOTFOUNDzz"],
            "mode": "template",
            "template": "new_{n}",
        })
        assert res.status_code == 404


class TestTransactionRollback:
    def test_rollback_on_failure(self, client):
        c, db, drive_dir, data_dir = client
        files = _seed_multiple(db, drive_dir, ["first.mp4", "second.mp4"])
        ids = [f.id for f in files]

        # Delete the second file from disk to cause a failure mid-batch
        (drive_dir / "旅行" / "second.mp4").unlink()

        res = c.put("/api/files/batch/rename", json={
            "ids": ids,
            "mode": "template",
            "template": "renamed_{n}",
        })
        assert res.status_code == 404

        # Verify first file was rolled back on filesystem
        assert (drive_dir / "旅行" / "first.mp4").exists()
        assert not (drive_dir / "旅行" / "renamed_1.mp4").exists()

        # Verify DB was not modified
        from app.models import File
        f = db.query(File).filter(File.id == files[0].id).first()
        db.refresh(f)
        assert f.filename == "first.mp4"


class TestExtensionPreservation:
    def test_extension_preserved_across_modes(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed(db, drive_dir, "my_video.mp4")

        res = c.put("/api/files/batch/rename", json={
            "ids": [file.id],
            "mode": "template",
            "template": "new_name",
        })
        assert res.status_code == 200
        assert res.json()["results"][0]["new_name"] == "new_name.mp4"

    def test_regex_only_affects_stem(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed(db, drive_dir, "test.mp4")

        res = c.put("/api/files/batch/rename", json={
            "ids": [file.id],
            "mode": "regex",
            "pattern": "test",
            "replacement": "replaced",
        })
        assert res.status_code == 200
        assert res.json()["results"][0]["new_name"] == "replaced.mp4"
