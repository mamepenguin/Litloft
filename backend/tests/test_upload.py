import io
from pathlib import Path

import pytest
from fastapi import HTTPException

from app.services import upload as upload_service

from tests.conftest import TEST_DRIVE

FIXTURES_DIR = Path(__file__).parent / "fixtures"


class TestUploadFlow:
    def test_full_upload(self, client):
        c, db, drive_dir, data_dir = client
        test_data = b"x" * 1000

        # Init
        res = c.post(f"/api/drives/{TEST_DRIVE}/upload/init", json={
            "filename": "uploaded.bin",
            "file_size": len(test_data),
            "folder_path": "",
            "chunk_size": len(test_data),
        })
        assert res.status_code == 200
        body = res.json()
        upload_id = body["upload_id"]
        assert body["total_chunks"] == 1

        # Chunk
        res = c.post(
            f"/api/drives/{TEST_DRIVE}/upload/{upload_id}/chunk",
            data={"chunk_index": "0"},
            files={"chunk": ("chunk", io.BytesIO(test_data), "application/octet-stream")},
        )
        assert res.status_code == 200
        assert res.json()["received_chunks"] == 1

        # Complete
        res = c.post(f"/api/drives/{TEST_DRIVE}/upload/{upload_id}/complete")
        assert res.status_code == 200
        assert res.json()["filename"] == "uploaded.bin"
        assert (drive_dir / "uploaded.bin").exists()

    def test_multi_chunk_upload(self, client):
        c, db, drive_dir, data_dir = client
        chunk_size = 500
        test_data = b"a" * 1200  # 3 chunks: 500 + 500 + 200

        res = c.post(f"/api/drives/{TEST_DRIVE}/upload/init", json={
            "filename": "multi.bin",
            "file_size": len(test_data),
            "chunk_size": chunk_size,
        })
        upload_id = res.json()["upload_id"]
        total = res.json()["total_chunks"]
        assert total == 3

        for i in range(total):
            start = i * chunk_size
            end = min(start + chunk_size, len(test_data))
            chunk = test_data[start:end]
            c.post(
                f"/api/drives/{TEST_DRIVE}/upload/{upload_id}/chunk",
                data={"chunk_index": str(i)},
                files={"chunk": ("chunk", io.BytesIO(chunk), "application/octet-stream")},
            )

        res = c.post(f"/api/drives/{TEST_DRIVE}/upload/{upload_id}/complete")
        assert res.status_code == 200
        assert (drive_dir / "multi.bin").read_bytes() == test_data

    def test_upload_to_folder(self, client):
        c, db, drive_dir, data_dir = client
        (drive_dir / "サブ").mkdir()
        test_data = b"hello"

        res = c.post(f"/api/drives/{TEST_DRIVE}/upload/init", json={
            "filename": "file.txt",
            "file_size": len(test_data),
            "folder_path": "サブ",
            "chunk_size": len(test_data),
        })
        upload_id = res.json()["upload_id"]

        c.post(
            f"/api/drives/{TEST_DRIVE}/upload/{upload_id}/chunk",
            data={"chunk_index": "0"},
            files={"chunk": ("chunk", io.BytesIO(test_data), "application/octet-stream")},
        )
        res = c.post(f"/api/drives/{TEST_DRIVE}/upload/{upload_id}/complete")
        assert res.status_code == 200
        assert (drive_dir / "サブ" / "file.txt").exists()

    def test_duplicate_filename(self, client):
        c, db, drive_dir, data_dir = client
        (drive_dir / "existing.txt").write_bytes(b"old")

        res = c.post(f"/api/drives/{TEST_DRIVE}/upload/init", json={
            "filename": "existing.txt",
            "file_size": 10,
            "chunk_size": 10,
        })
        assert res.status_code == 409

    def test_cancel_upload(self, client):
        c, db, drive_dir, data_dir = client

        res = c.post(f"/api/drives/{TEST_DRIVE}/upload/init", json={
            "filename": "cancel.bin",
            "file_size": 1000,
            "chunk_size": 1000,
        })
        upload_id = res.json()["upload_id"]

        res = c.delete(f"/api/drives/{TEST_DRIVE}/upload/{upload_id}")
        assert res.status_code == 200

        # Session gone
        res = c.post(f"/api/drives/{TEST_DRIVE}/upload/{upload_id}/complete")
        assert res.status_code == 404

    def test_invalid_session(self, client):
        c, db, drive_dir, data_dir = client
        res = c.post(f"/api/drives/{TEST_DRIVE}/upload/nonexistent/complete")
        assert res.status_code == 404

    def test_upload_with_relative_path(self, client):
        c, db, drive_dir, data_dir = client
        test_data = b"folder upload"

        res = c.post(f"/api/drives/{TEST_DRIVE}/upload/init", json={
            "filename": "file.txt",
            "file_size": len(test_data),
            "folder_path": "",
            "relative_path": "subdir/file.txt",
            "chunk_size": len(test_data),
        })
        assert res.status_code == 200
        upload_id = res.json()["upload_id"]

        c.post(
            f"/api/drives/{TEST_DRIVE}/upload/{upload_id}/chunk",
            data={"chunk_index": "0"},
            files={"chunk": ("chunk", io.BytesIO(test_data), "application/octet-stream")},
        )
        res = c.post(f"/api/drives/{TEST_DRIVE}/upload/{upload_id}/complete")
        assert res.status_code == 200
        assert (drive_dir / "subdir" / "file.txt").exists()
        assert (drive_dir / "subdir" / "file.txt").read_bytes() == test_data

    def test_upload_with_nested_relative_path(self, client):
        c, db, drive_dir, data_dir = client
        test_data = b"nested"

        res = c.post(f"/api/drives/{TEST_DRIVE}/upload/init", json={
            "filename": "deep.txt",
            "file_size": len(test_data),
            "folder_path": "",
            "relative_path": "a/b/c/deep.txt",
            "chunk_size": len(test_data),
        })
        assert res.status_code == 200
        upload_id = res.json()["upload_id"]

        c.post(
            f"/api/drives/{TEST_DRIVE}/upload/{upload_id}/chunk",
            data={"chunk_index": "0"},
            files={"chunk": ("chunk", io.BytesIO(test_data), "application/octet-stream")},
        )
        res = c.post(f"/api/drives/{TEST_DRIVE}/upload/{upload_id}/complete")
        assert res.status_code == 200
        assert (drive_dir / "a" / "b" / "c" / "deep.txt").exists()

    def test_upload_with_relative_path_and_folder_path(self, client):
        c, db, drive_dir, data_dir = client
        (drive_dir / "existing").mkdir()
        test_data = b"combined"

        res = c.post(f"/api/drives/{TEST_DRIVE}/upload/init", json={
            "filename": "file.txt",
            "file_size": len(test_data),
            "folder_path": "existing",
            "relative_path": "sub/file.txt",
            "chunk_size": len(test_data),
        })
        assert res.status_code == 200
        upload_id = res.json()["upload_id"]

        c.post(
            f"/api/drives/{TEST_DRIVE}/upload/{upload_id}/chunk",
            data={"chunk_index": "0"},
            files={"chunk": ("chunk", io.BytesIO(test_data), "application/octet-stream")},
        )
        res = c.post(f"/api/drives/{TEST_DRIVE}/upload/{upload_id}/complete")
        assert res.status_code == 200
        assert (drive_dir / "existing" / "sub" / "file.txt").exists()

    def test_oversize_rejected_with_dynamic_limit(self, client, monkeypatch):
        """File size beyond MAX_UPLOAD_SIZE → 400 with limit in message."""
        import app.config as config

        c, db, drive_dir, data_dir = client
        monkeypatch.setattr(config, "MAX_UPLOAD_SIZE", 1024)  # 1KB cap

        res = c.post(f"/api/drives/{TEST_DRIVE}/upload/init", json={
            "filename": "huge.bin",
            "file_size": 2048,
            "chunk_size": 1024,
        })
        assert res.status_code == 400
        # Limit should be reflected in the message, not the hardcoded "2GB"
        assert "GB" in res.json()["detail"]
        assert "max" in res.json()["detail"].lower()

    def test_insufficient_disk_space_returns_507(self, client, monkeypatch):
        """Disk space pre-check fails → 507 Insufficient Storage."""
        import app.services.upload as upload_module
        from collections import namedtuple

        c, db, drive_dir, data_dir = client
        DiskUsage = namedtuple("DiskUsage", ["total", "used", "free"])
        monkeypatch.setattr(
            upload_module.shutil,
            "disk_usage",
            lambda _p: DiskUsage(total=1000, used=900, free=100),
        )

        res = c.post(f"/api/drives/{TEST_DRIVE}/upload/init", json={
            "filename": "needs-space.bin",
            "file_size": 10_000,
            "chunk_size": 1024,
        })
        assert res.status_code == 507
        assert "disk" in res.json()["detail"].lower()

    def test_upload_relative_path_traversal_rejected(self, client):
        c, db, drive_dir, data_dir = client

        res = c.post(f"/api/drives/{TEST_DRIVE}/upload/init", json={
            "filename": "evil.txt",
            "file_size": 10,
            "relative_path": "../etc/evil.txt",
            "chunk_size": 10,
        })
        assert res.status_code == 400


class TestUploadThumbnailIsNotWrittenInPlace:
    """The destination can be a thumbnail the endpoint is serving.

    A file that goes missing keeps its thumbnail on disk and the endpoint
    keeps serving it; an upload to the same path revives that record
    (`design-decisions.md`). So finalising an upload can land on a live
    thumbnail, and writing the generator's output straight there hands a
    reader a truncated JPEG.
    """

    def _upload(self, c, name, payload):
        res = c.post(
            f"/api/drives/{TEST_DRIVE}/upload/init",
            json={
                "filename": name,
                "file_size": len(payload),
                "folder_path": "",
                "chunk_size": len(payload),
            },
        )
        assert res.status_code == 200
        upload_id = res.json()["upload_id"]
        c.post(
            f"/api/drives/{TEST_DRIVE}/upload/{upload_id}/chunk",
            data={"chunk_index": "0"},
            files={"chunk": ("chunk", io.BytesIO(payload), "image/jpeg")},
        )
        return c.post(f"/api/drives/{TEST_DRIVE}/upload/{upload_id}/complete")

    def test_the_generator_is_handed_a_temporary_path(self, client, monkeypatch):
        from PIL import Image

        from app.services import upload as upload_service

        c, db, drive_dir, data_dir = client
        buffer = io.BytesIO()
        Image.new("RGB", (768, 1024), (30, 90, 160)).save(buffer, format="JPEG")
        payload = buffer.getvalue()

        handed = []

        def record(source, destination):
            handed.append(destination)
            Image.new("RGB", (240, 320), (1, 2, 3)).save(destination)
            return True

        monkeypatch.setattr(
            upload_service, "get_thumbnail_generator", lambda *_: record
        )
        res = self._upload(c, "photo.jpg", payload)
        assert res.status_code == 200

        assert len(handed) == 1
        expected = data_dir / "thumbnails" / TEST_DRIVE / "photo.jpg"
        assert handed[0] != str(expected)
        assert Path(handed[0]).parent == expected.parent
        assert expected.exists()


class TestAssemblyIsAtomic:
    """`complete_upload` used to write into the destination path directly.

    What broke was specific: assembly that died — a disk filling, a chunk file
    gone, the container killed — left a truncated file in the user's drive, and
    the next scan registered it as a real file of that size. The size check ran
    afterwards and cleaned up with `unlink()` on that path, which deletes
    whatever is there rather than only what this upload wrote.
    """

    def test_a_failed_assembly_leaves_the_drive_untouched(
        self, client, monkeypatch
    ):
        http, db, drive_dir, _ = client
        session = upload_service.init_upload(
            TEST_DRIVE, "clip.bin", 8, "", 8,
        )
        upload_service.receive_chunk(session.upload_id, 0, b"abcdefgh")

        def explode(src, dst, length=0):
            raise OSError("no space left on device")

        monkeypatch.setattr(upload_service.shutil, "copyfileobj", explode)

        with pytest.raises(OSError):
            upload_service.complete_upload(session.upload_id, db)

        assert list(drive_dir.iterdir()) == []

    def test_a_size_mismatch_refuses_before_anything_is_published(
        self, client
    ):
        http, db, drive_dir, _ = client
        session = upload_service.init_upload(
            TEST_DRIVE, "short.bin", 16, "", 16,
        )
        upload_service.receive_chunk(session.upload_id, 0, b"only-8!!")

        with pytest.raises(HTTPException) as exc:
            upload_service.complete_upload(session.upload_id, db)

        assert exc.value.status_code == 400
        assert "size mismatch" in exc.value.detail
        assert list(drive_dir.iterdir()) == []

    def test_a_file_already_at_the_target_survives_a_failed_upload(
        self, client, monkeypatch
    ):
        """The window `init_upload`'s existence check leaves open is not closed
        here — see the PR body — but a *failed* upload must no longer be the
        thing that destroys what it finds.
        """
        http, db, drive_dir, _ = client
        session = upload_service.init_upload(
            TEST_DRIVE, "taken.bin", 8, "", 8,
        )
        upload_service.receive_chunk(session.upload_id, 0, b"abcdefgh")
        squatter = drive_dir / "taken.bin"
        squatter.write_bytes(b"someone else's file")

        def explode(src, dst, length=0):
            raise OSError("no space left on device")

        monkeypatch.setattr(upload_service.shutil, "copyfileobj", explode)
        with pytest.raises(OSError):
            upload_service.complete_upload(session.upload_id, db)

        assert squatter.read_bytes() == b"someone else's file"

    def test_a_successful_upload_still_lands_with_its_full_contents(
        self, client
    ):
        http, db, drive_dir, _ = client
        body = b"x" * 4096
        session = upload_service.init_upload(
            TEST_DRIVE, "whole.bin", len(body), "", 1024,
        )
        for index in range(4):
            upload_service.receive_chunk(
                session.upload_id, index, body[index * 1024:(index + 1) * 1024]
            )

        record, _recovered = upload_service.complete_upload(session.upload_id, db)

        assert (drive_dir / "whole.bin").read_bytes() == body
        assert record.file_size == len(body)
        assert list((drive_dir).glob(".*")) == []
