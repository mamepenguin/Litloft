from tests.conftest import TEST_DRIVE


class TestPinnedFolders:
    def test_list_empty(self, client):
        c, db, drive_dir, _ = client
        res = c.get(f"/api/drives/{TEST_DRIVE}/pins")
        assert res.status_code == 200
        assert res.json() == []

    def test_pin_folder(self, client):
        c, db, drive_dir, _ = client
        res = c.post(
            f"/api/drives/{TEST_DRIVE}/pins",
            json={"path": "Movies/Action"},
        )
        assert res.status_code == 201
        assert res.json() == {"path": "Movies/Action"}

    def test_list_after_pin(self, client):
        c, db, drive_dir, _ = client
        c.post(f"/api/drives/{TEST_DRIVE}/pins", json={"path": "A"})
        c.post(f"/api/drives/{TEST_DRIVE}/pins", json={"path": "B"})
        res = c.get(f"/api/drives/{TEST_DRIVE}/pins")
        assert res.status_code == 200
        paths = [p["path"] for p in res.json()]
        assert paths == ["A", "B"]

    def test_pin_duplicate(self, client):
        c, db, drive_dir, _ = client
        c.post(f"/api/drives/{TEST_DRIVE}/pins", json={"path": "X"})
        res = c.post(f"/api/drives/{TEST_DRIVE}/pins", json={"path": "X"})
        assert res.status_code == 409

    def test_unpin_folder(self, client):
        c, db, drive_dir, _ = client
        c.post(f"/api/drives/{TEST_DRIVE}/pins", json={"path": "Del"})
        res = c.delete(f"/api/drives/{TEST_DRIVE}/pins?path=Del")
        assert res.status_code == 204
        res = c.get(f"/api/drives/{TEST_DRIVE}/pins")
        assert res.json() == []

    def test_unpin_not_found(self, client):
        c, db, drive_dir, _ = client
        res = c.delete(f"/api/drives/{TEST_DRIVE}/pins?path=NoExist")
        assert res.status_code == 404

    def test_pin_invalid_drive(self, client):
        c, db, drive_dir, _ = client
        res = c.get("/api/drives/no-such-drive/pins")
        assert res.status_code == 404

    def test_pin_order_preserved(self, client):
        c, db, drive_dir, _ = client
        for p in ["C", "A", "B"]:
            c.post(f"/api/drives/{TEST_DRIVE}/pins", json={"path": p})
        res = c.get(f"/api/drives/{TEST_DRIVE}/pins")
        paths = [p["path"] for p in res.json()]
        assert paths == ["C", "A", "B"]
