import shutil
from pathlib import Path

import pytest

from tests.conftest import TEST_DRIVE

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _seed_file(db, drive_dir):
    folder = drive_dir / "旅行"
    folder.mkdir(exist_ok=True)
    shutil.copy(FIXTURES_DIR / "long_video.mp4", folder / "test.mp4")

    from app.models import File

    file = File(
        filename="test.mp4",
        title="Test Video",
        drive=TEST_DRIVE,
        folder_path="旅行",
        file_path="旅行/test.mp4",
        file_size=folder.joinpath("test.mp4").stat().st_size,
        file_type="video",
        mime_type="video/mp4",
        duration=10.0,
    )
    db.add(file)
    db.commit()
    db.refresh(file)
    return file


class TestGetFile:
    def test_existing(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        res = c.get(f"/api/files/{file.id}")
        assert res.status_code == 200
        assert res.json()["title"] == "Test Video"
        assert res.json()["drive"] == TEST_DRIVE
        assert res.json()["folder_path"] == "旅行"
        assert res.json()["file_type"] == "video"
        assert res.json()["mime_type"] == "video/mp4"

    def test_not_found(self, client):
        c, db, drive_dir, data_dir = client
        res = c.get("/api/files/zzNOTFOUNDzz")
        assert res.status_code == 404


class TestUpdateFile:
    def test_update_title(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        res = c.put(
            f"/api/files/{file.id}",
            json={"title": "New Title"},
        )
        assert res.status_code == 200
        assert res.json()["title"] == "New Title"

    def test_update_description(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        res = c.put(
            f"/api/files/{file.id}",
            json={"description": "New desc"},
        )
        assert res.status_code == 200
        assert res.json()["description"] == "New desc"

    def test_not_found(self, client):
        c, db, drive_dir, data_dir = client
        res = c.put("/api/files/zzNOTFOUNDzz", json={"title": "x"})
        assert res.status_code == 404




class TestThumbnailRevalidation:
    """`Cache-Control: no-cache` only pays if the revalidation is cheap.

    The bytes behind `/thumbnail` change while the URL does not — a
    thumbnail regenerated into the picture box, a replaced file — so the
    endpoint has to be revalidated rather than cached blind. `no-cache`
    says that, and on its own it costs a full body on every view:
    `FileResponse` sets an ETag but does not read `If-None-Match`, and
    the 304 is answered by the handler.
    """

    def _seed_thumbnail(self, db, drive_dir, data_dir):
        from PIL import Image

        file = _seed_file(db, drive_dir)
        thumb = data_dir / "thumbnails" / TEST_DRIVE / "t.jpg"
        thumb.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (240, 320), (20, 60, 120)).save(thumb, quality=90)
        file.thumbnail_path = f"{TEST_DRIVE}/t.jpg"
        db.commit()
        return file

    def test_a_plain_get_asks_to_be_revalidated(self, client):
        c, db, drive_dir, data_dir = client
        file = self._seed_thumbnail(db, drive_dir, data_dir)

        res = c.get(f"/api/files/{file.id}/thumbnail")
        assert res.status_code == 200
        assert res.headers["cache-control"] == "no-cache"
        assert res.headers["etag"]
        assert len(res.content) > 0

    def test_a_matching_validator_gets_a_body_free_304(self, client):
        c, db, drive_dir, data_dir = client
        file = self._seed_thumbnail(db, drive_dir, data_dir)
        etag = c.get(f"/api/files/{file.id}/thumbnail").headers["etag"]

        res = c.get(
            f"/api/files/{file.id}/thumbnail", headers={"If-None-Match": etag}
        )
        assert res.status_code == 304
        assert res.content == b""
        assert res.headers["etag"] == etag

    def test_a_weakened_validator_still_matches(self, client):
        # Everything reaches this endpoint through the Next.js custom
        # server, and a proxy that recompresses may weaken the validator;
        # the browser then echoes `W/"…"`. Without the weak comparison
        # the whole `no-cache` arrangement pays a full body on every view
        # behind such a proxy, silently.
        c, db, drive_dir, data_dir = client
        file = self._seed_thumbnail(db, drive_dir, data_dir)
        etag = c.get(f"/api/files/{file.id}/thumbnail").headers["etag"]

        res = c.get(
            f"/api/files/{file.id}/thumbnail", headers={"If-None-Match": f"W/{etag}"}
        )
        assert res.status_code == 304
        assert res.content == b""

    @pytest.mark.parametrize("spacing", ['"other", {tag}', '"other",{tag}'])
    def test_a_validator_inside_a_list_still_matches(self, spacing, client):
        # `If-None-Match` is a list, and a cache that holds more than one
        # representation sends more than one tag.
        c, db, drive_dir, data_dir = client
        file = self._seed_thumbnail(db, drive_dir, data_dir)
        etag = c.get(f"/api/files/{file.id}/thumbnail").headers["etag"]

        res = c.get(
            f"/api/files/{file.id}/thumbnail",
            headers={"If-None-Match": spacing.format(tag=etag)},
        )
        assert res.status_code == 304
        assert res.content == b""

    def test_a_304_carries_what_the_200_would_have_said_about_freshness(self, client):
        # RFC 9110 §15.4.5: the fields a 200 would have sent that are
        # useful for updating the stored entry.
        c, db, drive_dir, data_dir = client
        file = self._seed_thumbnail(db, drive_dir, data_dir)
        full = c.get(f"/api/files/{file.id}/thumbnail")

        res = c.get(
            f"/api/files/{file.id}/thumbnail",
            headers={"If-None-Match": full.headers["etag"]},
        )
        assert res.status_code == 304
        assert res.headers["last-modified"] == full.headers["last-modified"]
        assert res.headers["cache-control"] == "no-cache"

    def test_the_placeholder_revalidates_the_same_way(self, client):
        # The other branch of the same handler. Every video or image
        # whose thumbnail generation failed renders an `<img>` at this
        # URL, so the branch is on screen, not a corner — and it sent
        # `no-cache` with an ETag and no conditional handling, which is
        # the defect the branch above it was fixed for.
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        assert file.thumbnail_path is None

        full = c.get(f"/api/files/{file.id}/thumbnail")
        assert full.status_code == 200
        assert full.headers["cache-control"] == "no-cache"

        res = c.get(
            f"/api/files/{file.id}/thumbnail",
            headers={"If-None-Match": full.headers["etag"]},
        )
        assert res.status_code == 304
        assert res.content == b""

    def test_a_wildcard_validator_also_gets_a_304(self, client):
        c, db, drive_dir, data_dir = client
        file = self._seed_thumbnail(db, drive_dir, data_dir)

        res = c.get(f"/api/files/{file.id}/thumbnail", headers={"If-None-Match": "*"})
        assert res.status_code == 304

    def test_a_stale_validator_gets_the_new_bytes(self, client):
        c, db, drive_dir, data_dir = client
        file = self._seed_thumbnail(db, drive_dir, data_dir)

        res = c.get(
            f"/api/files/{file.id}/thumbnail", headers={"If-None-Match": '"stale"'}
        )
        assert res.status_code == 200
        assert len(res.content) > 0

    def test_the_validator_changes_when_the_thumbnail_does(self, client):
        # The point of the whole arrangement: a regenerated thumbnail has
        # to be a cache miss under a URL that did not change.
        from PIL import Image

        c, db, drive_dir, data_dir = client
        file = self._seed_thumbnail(db, drive_dir, data_dir)
        first = c.get(f"/api/files/{file.id}/thumbnail").headers["etag"]

        thumb = data_dir / "thumbnails" / TEST_DRIVE / "t.jpg"
        Image.new("RGB", (320, 240), (200, 60, 20)).save(thumb, quality=90)

        second = c.get(f"/api/files/{file.id}/thumbnail").headers["etag"]
        assert second != first
        assert (
            c.get(
                f"/api/files/{file.id}/thumbnail", headers={"If-None-Match": first}
            ).status_code
            == 200
        )
