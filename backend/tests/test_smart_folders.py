"""Smart Folder API tests (Phase 1).

Endpoints under /api/drives/{drive}/smart-folders:
- GET    list (drive-scoped, no viewer_id filter)
- POST   create (returns 201, persists viewer_id from cookie if present)
- PATCH  update (partial)
- DELETE delete

Drive boundary rules:
- A locked drive returns 404 (existence is hidden, never 403).
- A SF created in drive A is invisible / not editable via drive B's URL.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

import app.config as config  # noqa: F401  (enforces module-reference style)
from tests.conftest import TEST_DRIVE


SECOND_DRIVE = "second-drive"


@pytest.fixture()
def two_drive_client(client, tmp_path):
    """Extend the base client fixture with a second drive in drives.json."""
    c, db, drive_dir, data_dir = client

    second_dir = tmp_path / "drives" / "second"
    second_dir.mkdir(parents=True, exist_ok=True)

    drives_json = Path(config.DRIVES_CONFIG)
    drives_json.write_text(
        json.dumps(
            [
                {"name": TEST_DRIVE, "path": str(drive_dir)},
                {"name": SECOND_DRIVE, "path": str(second_dir)},
            ]
        )
    )
    config._drives_cache = None

    yield c, db, drive_dir, second_dir, data_dir


@pytest.fixture()
def protected_client(client, tmp_path):
    """Lock TEST_DRIVE behind an access_group with no viewer cookie."""
    c, db, drive_dir, data_dir = client

    drives_json = Path(config.DRIVES_CONFIG)
    drives_json.write_text(
        json.dumps(
            [
                {
                    "name": TEST_DRIVE,
                    "path": str(drive_dir),
                    "access_group": "private",
                }
            ]
        )
    )
    config._drives_cache = None

    import app.auth as auth

    pw_file = tmp_path / "passwords_locked.json"
    pw_file.write_text(
        json.dumps([{"password": "secret123", "groups": ["private"]}])
    )
    orig_pw_config = auth.PASSWORDS_CONFIG
    auth._passwords_cache = None
    auth.PASSWORDS_CONFIG = pw_file
    auth.load_passwords()

    try:
        yield c, db, drive_dir, data_dir
    finally:
        auth.PASSWORDS_CONFIG = orig_pw_config
        auth._passwords_cache = None


class TestCreateSmartFolder:
    def test_create_smart_folder_returns_201(self, client):
        c, _db, _, _ = client
        res = c.post(
            f"/api/drives/{TEST_DRIVE}/smart-folders",
            json={"name": "My SF", "query": "foo"},
        )
        assert res.status_code == 201, res.text
        body = res.json()
        assert body["id"]
        assert body["drive"] == TEST_DRIVE
        assert body["name"] == "My SF"
        assert body["query"] == "foo"
        assert body["file_type"] is None
        assert body["sort_by"] is None
        assert body["sort_order"] is None
        assert "created_at" in body

    def test_create_persists_viewer_id_when_present(self, client):
        c, db, _, _ = client
        res = c.post(
            f"/api/drives/{TEST_DRIVE}/smart-folders",
            json={"name": "with-viewer", "query": "x"},
            cookies={"lit_viewer": "alice"},
        )
        assert res.status_code == 201

        # Inspect the row directly: viewer_id is not in the response
        # but must be stored. nickname_to_viewer_id("alice") is the
        # SHA-256 truncated to 16 chars; we don't reproduce that here,
        # we just assert non-NULL.
        from app.models import SmartFolder

        sf = db.query(SmartFolder).filter_by(id=res.json()["id"]).one()
        assert sf.viewer_id is not None
        assert len(sf.viewer_id) == 16

    def test_create_persists_null_viewer_id_when_absent(self, client):
        c, db, _, _ = client
        res = c.post(
            f"/api/drives/{TEST_DRIVE}/smart-folders",
            json={"name": "no-viewer", "query": "x"},
        )
        assert res.status_code == 201

        from app.models import SmartFolder

        sf = db.query(SmartFolder).filter_by(id=res.json()["id"]).one()
        assert sf.viewer_id is None

    def test_create_with_optional_fields(self, client):
        c, _db, _, _ = client
        res = c.post(
            f"/api/drives/{TEST_DRIVE}/smart-folders",
            json={
                "name": "rich",
                "query": "foo",
                "file_type": "video",
                "sort_by": "created_at",
                "sort_order": "desc",
            },
        )
        assert res.status_code == 201, res.text
        body = res.json()
        assert body["file_type"] == "video"
        assert body["sort_by"] == "created_at"
        assert body["sort_order"] == "desc"

    def test_invalid_file_type_rejected(self, client):
        c, _db, _, _ = client
        res = c.post(
            f"/api/drives/{TEST_DRIVE}/smart-folders",
            json={"name": "bad", "query": "x", "file_type": "xyz"},
        )
        assert res.status_code == 422

    def test_invalid_sort_order_rejected(self, client):
        c, _db, _, _ = client
        res = c.post(
            f"/api/drives/{TEST_DRIVE}/smart-folders",
            json={"name": "bad", "query": "x", "sort_order": "sideways"},
        )
        assert res.status_code == 422

    def test_create_invalid_drive(self, client):
        c, _db, _, _ = client
        res = c.post(
            "/api/drives/no-such-drive/smart-folders",
            json={"name": "x", "query": "y"},
        )
        assert res.status_code == 404


class TestListSmartFolders:
    def test_list_empty(self, client):
        c, _db, _, _ = client
        res = c.get(f"/api/drives/{TEST_DRIVE}/smart-folders")
        assert res.status_code == 200
        assert res.json() == []

    def test_list_smart_folders_filters_by_drive(self, two_drive_client):
        c, _db, _, _, _ = two_drive_client

        c.post(
            f"/api/drives/{TEST_DRIVE}/smart-folders",
            json={"name": "in-A", "query": "a"},
        )
        c.post(
            f"/api/drives/{SECOND_DRIVE}/smart-folders",
            json={"name": "in-B", "query": "b"},
        )

        res_a = c.get(f"/api/drives/{TEST_DRIVE}/smart-folders")
        res_b = c.get(f"/api/drives/{SECOND_DRIVE}/smart-folders")

        names_a = [sf["name"] for sf in res_a.json()]
        names_b = [sf["name"] for sf in res_b.json()]

        assert names_a == ["in-A"]
        assert names_b == ["in-B"]

    def test_list_does_not_filter_by_viewer_id(self, client):
        """Current behaviour: any viewer sees all SF in the drive."""
        c, _db, _, _ = client

        c.post(
            f"/api/drives/{TEST_DRIVE}/smart-folders",
            json={"name": "alice-sf", "query": "x"},
            cookies={"lit_viewer": "alice"},
        )
        c.post(
            f"/api/drives/{TEST_DRIVE}/smart-folders",
            json={"name": "anon-sf", "query": "y"},
        )

        # Bob (different viewer) sees both
        res = c.get(
            f"/api/drives/{TEST_DRIVE}/smart-folders",
            cookies={"lit_viewer": "bob"},
        )
        assert res.status_code == 200
        names = sorted(sf["name"] for sf in res.json())
        assert names == ["alice-sf", "anon-sf"]


class TestUpdateSmartFolder:
    def test_update_smart_folder(self, client):
        c, _db, _, _ = client
        created = c.post(
            f"/api/drives/{TEST_DRIVE}/smart-folders",
            json={"name": "old", "query": "old-q"},
        ).json()
        sf_id = created["id"]

        res = c.patch(
            f"/api/drives/{TEST_DRIVE}/smart-folders/{sf_id}",
            json={"name": "new", "query": "new-q", "file_type": "image"},
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["id"] == sf_id
        assert body["name"] == "new"
        assert body["query"] == "new-q"
        assert body["file_type"] == "image"
        assert body["updated_at"] is not None

    def test_update_partial(self, client):
        c, _db, _, _ = client
        created = c.post(
            f"/api/drives/{TEST_DRIVE}/smart-folders",
            json={
                "name": "n",
                "query": "q",
                "file_type": "video",
                "sort_by": "created_at",
            },
        ).json()
        sf_id = created["id"]

        res = c.patch(
            f"/api/drives/{TEST_DRIVE}/smart-folders/{sf_id}",
            json={"name": "renamed"},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["name"] == "renamed"
        # Other fields preserved
        assert body["query"] == "q"
        assert body["file_type"] == "video"
        assert body["sort_by"] == "created_at"

    def test_update_nonexistent(self, client):
        c, _db, _, _ = client
        res = c.patch(
            f"/api/drives/{TEST_DRIVE}/smart-folders/does-not-exi",
            json={"name": "x"},
        )
        assert res.status_code == 404


class TestDeleteSmartFolder:
    def test_delete_smart_folder(self, client):
        c, _db, _, _ = client
        created = c.post(
            f"/api/drives/{TEST_DRIVE}/smart-folders",
            json={"name": "doomed", "query": "x"},
        ).json()
        sf_id = created["id"]

        res = c.delete(f"/api/drives/{TEST_DRIVE}/smart-folders/{sf_id}")
        assert res.status_code == 204

        listing = c.get(f"/api/drives/{TEST_DRIVE}/smart-folders")
        assert listing.json() == []

    def test_delete_nonexistent(self, client):
        c, _db, _, _ = client
        res = c.delete(
            f"/api/drives/{TEST_DRIVE}/smart-folders/does-not-exi"
        )
        assert res.status_code == 404


class TestAccessControl:
    def test_locked_drive_returns_404(self, protected_client):
        """A locked drive must hide existence: 404, not 403."""
        c, _db, _, _ = protected_client

        # GET list
        res = c.get(f"/api/drives/{TEST_DRIVE}/smart-folders")
        assert res.status_code == 404

        # POST create
        res = c.post(
            f"/api/drives/{TEST_DRIVE}/smart-folders",
            json={"name": "x", "query": "y"},
        )
        assert res.status_code == 404

        # PATCH update
        res = c.patch(
            f"/api/drives/{TEST_DRIVE}/smart-folders/anyid",
            json={"name": "z"},
        )
        assert res.status_code == 404

        # DELETE
        res = c.delete(f"/api/drives/{TEST_DRIVE}/smart-folders/anyid")
        assert res.status_code == 404

    def test_cross_drive_access_blocked(self, two_drive_client):
        """SF created in drive A must not be reachable via drive B URL."""
        c, _db, _, _, _ = two_drive_client

        created = c.post(
            f"/api/drives/{TEST_DRIVE}/smart-folders",
            json={"name": "in-A", "query": "x"},
        ).json()
        sf_id = created["id"]

        # GET via wrong drive: SF won't appear in list
        res_b = c.get(f"/api/drives/{SECOND_DRIVE}/smart-folders")
        assert res_b.status_code == 200
        assert all(sf["id"] != sf_id for sf in res_b.json())

        # PATCH via wrong drive: 404
        res = c.patch(
            f"/api/drives/{SECOND_DRIVE}/smart-folders/{sf_id}",
            json={"name": "hijack"},
        )
        assert res.status_code == 404

        # DELETE via wrong drive: 404
        res = c.delete(
            f"/api/drives/{SECOND_DRIVE}/smart-folders/{sf_id}"
        )
        assert res.status_code == 404

        # And the SF still exists in its real drive
        res_a = c.get(f"/api/drives/{TEST_DRIVE}/smart-folders")
        assert any(sf["id"] == sf_id for sf in res_a.json())
