from tests.conftest import TEST_DRIVE


def _seed_file(db, filename="song.mp4", drive=TEST_DRIVE, folder_path=""):
    from app.models import File
    file = File(
        filename=filename,
        title=filename.rsplit(".", 1)[0],
        drive=drive,
        folder_path=folder_path,
        file_path=f"{folder_path}/{filename}" if folder_path else filename,
        file_size=1000,
        file_type="audio",
        mime_type="audio/mpeg",
    )
    db.add(file)
    db.commit()
    db.refresh(file)
    return file


class TestPlaylistCRUD:
    def test_list_empty(self, client):
        c, *_ = client
        res = c.get(f"/api/drives/{TEST_DRIVE}/playlists")
        assert res.status_code == 200
        assert res.json() == []

    def test_create(self, client):
        c, *_ = client
        res = c.post(
            f"/api/drives/{TEST_DRIVE}/playlists",
            json={"name": "My Playlist"},
        )
        assert res.status_code == 201
        data = res.json()
        assert data["name"] == "My Playlist"
        assert data["drive"] == TEST_DRIVE
        assert data["item_count"] == 0

    def test_create_duplicate_name(self, client):
        c, *_ = client
        c.post(f"/api/drives/{TEST_DRIVE}/playlists", json={"name": "Dup"})
        res = c.post(f"/api/drives/{TEST_DRIVE}/playlists", json={"name": "Dup"})
        assert res.status_code == 409

    def test_create_empty_name(self, client):
        c, *_ = client
        res = c.post(f"/api/drives/{TEST_DRIVE}/playlists", json={"name": "   "})
        assert res.status_code == 422

    def test_create_long_name(self, client):
        c, *_ = client
        res = c.post(
            f"/api/drives/{TEST_DRIVE}/playlists",
            json={"name": "x" * 101},
        )
        assert res.status_code == 422

    def test_get_detail(self, client):
        c, *_ = client
        create_res = c.post(
            f"/api/drives/{TEST_DRIVE}/playlists",
            json={"name": "Detail"},
        )
        pl_id = create_res.json()["id"]
        res = c.get(f"/api/drives/{TEST_DRIVE}/playlists/{pl_id}")
        assert res.status_code == 200
        data = res.json()
        assert data["name"] == "Detail"
        assert data["items"] == []

    def test_get_not_found(self, client):
        c, *_ = client
        res = c.get(f"/api/drives/{TEST_DRIVE}/playlists/nonexistent1")
        assert res.status_code == 404

    def test_rename(self, client):
        c, *_ = client
        create_res = c.post(
            f"/api/drives/{TEST_DRIVE}/playlists",
            json={"name": "Old Name"},
        )
        pl_id = create_res.json()["id"]
        res = c.put(
            f"/api/drives/{TEST_DRIVE}/playlists/{pl_id}",
            json={"name": "New Name"},
        )
        assert res.status_code == 200
        assert res.json()["name"] == "New Name"

    def test_rename_duplicate(self, client):
        c, *_ = client
        c.post(f"/api/drives/{TEST_DRIVE}/playlists", json={"name": "A"})
        create_b = c.post(
            f"/api/drives/{TEST_DRIVE}/playlists",
            json={"name": "B"},
        )
        pl_id = create_b.json()["id"]
        res = c.put(
            f"/api/drives/{TEST_DRIVE}/playlists/{pl_id}",
            json={"name": "A"},
        )
        assert res.status_code == 409

    def test_delete(self, client):
        c, *_ = client
        create_res = c.post(
            f"/api/drives/{TEST_DRIVE}/playlists",
            json={"name": "ToDelete"},
        )
        pl_id = create_res.json()["id"]
        res = c.delete(f"/api/drives/{TEST_DRIVE}/playlists/{pl_id}")
        assert res.status_code == 204
        res = c.get(f"/api/drives/{TEST_DRIVE}/playlists")
        assert len(res.json()) == 0

    def test_invalid_drive(self, client):
        c, *_ = client
        res = c.get("/api/drives/no-such-drive/playlists")
        assert res.status_code == 404

    def test_list_order_by_updated(self, client):
        c, *_ = client
        c.post(f"/api/drives/{TEST_DRIVE}/playlists", json={"name": "First"})
        c.post(f"/api/drives/{TEST_DRIVE}/playlists", json={"name": "Second"})
        res = c.get(f"/api/drives/{TEST_DRIVE}/playlists")
        names = [p["name"] for p in res.json()]
        assert names == ["Second", "First"]


class TestPlaylistItems:
    def test_add_items(self, client):
        c, db, *_ = client
        file = _seed_file(db, "song.mp3")
        create_res = c.post(
            f"/api/drives/{TEST_DRIVE}/playlists",
            json={"name": "Songs"},
        )
        pl_id = create_res.json()["id"]

        res = c.post(
            f"/api/drives/{TEST_DRIVE}/playlists/{pl_id}/items",
            json={"file_ids": [file.id]},
        )
        assert res.status_code == 200
        data = res.json()
        assert len(data["items"]) == 1
        assert data["items"][0]["file"]["id"] == file.id
        assert data["items"][0]["position"] == 0

    def test_add_duplicate_skipped(self, client):
        c, db, *_ = client
        file = _seed_file(db, "dup.mp3")
        create_res = c.post(
            f"/api/drives/{TEST_DRIVE}/playlists",
            json={"name": "DupTest"},
        )
        pl_id = create_res.json()["id"]

        c.post(
            f"/api/drives/{TEST_DRIVE}/playlists/{pl_id}/items",
            json={"file_ids": [file.id]},
        )
        res = c.post(
            f"/api/drives/{TEST_DRIVE}/playlists/{pl_id}/items",
            json={"file_ids": [file.id]},
        )
        assert res.status_code == 200
        assert len(res.json()["items"]) == 1

    def test_add_file_not_found(self, client):
        c, *_ = client
        create_res = c.post(
            f"/api/drives/{TEST_DRIVE}/playlists",
            json={"name": "NotFound"},
        )
        pl_id = create_res.json()["id"]
        res = c.post(
            f"/api/drives/{TEST_DRIVE}/playlists/{pl_id}/items",
            json={"file_ids": ["abcdefghijkl"]},
        )
        assert res.status_code == 404

    def test_remove_item(self, client):
        c, db, *_ = client
        file = _seed_file(db, "remove.mp3")
        create_res = c.post(
            f"/api/drives/{TEST_DRIVE}/playlists",
            json={"name": "RemoveTest"},
        )
        pl_id = create_res.json()["id"]
        add_res = c.post(
            f"/api/drives/{TEST_DRIVE}/playlists/{pl_id}/items",
            json={"file_ids": [file.id]},
        )
        item_id = add_res.json()["items"][0]["id"]

        res = c.delete(f"/api/drives/{TEST_DRIVE}/playlists/{pl_id}/items/{item_id}")
        assert res.status_code == 204

        detail = c.get(f"/api/drives/{TEST_DRIVE}/playlists/{pl_id}")
        assert len(detail.json()["items"]) == 0

    def test_remove_item_not_found(self, client):
        c, *_ = client
        create_res = c.post(
            f"/api/drives/{TEST_DRIVE}/playlists",
            json={"name": "RemoveNF"},
        )
        pl_id = create_res.json()["id"]
        res = c.delete(f"/api/drives/{TEST_DRIVE}/playlists/{pl_id}/items/99999")
        assert res.status_code == 404

    def test_reorder(self, client):
        c, db, *_ = client
        f1 = _seed_file(db, "a.mp3")
        f2 = _seed_file(db, "b.mp3")
        create_res = c.post(
            f"/api/drives/{TEST_DRIVE}/playlists",
            json={"name": "Reorder"},
        )
        pl_id = create_res.json()["id"]
        add_res = c.post(
            f"/api/drives/{TEST_DRIVE}/playlists/{pl_id}/items",
            json={"file_ids": [f1.id, f2.id]},
        )
        items = add_res.json()["items"]
        item_ids = [items[1]["id"], items[0]["id"]]  # reverse

        res = c.put(
            f"/api/drives/{TEST_DRIVE}/playlists/{pl_id}/items/reorder",
            json={"item_ids": item_ids},
        )
        assert res.status_code == 200
        reordered = res.json()["items"]
        assert reordered[0]["file"]["id"] == f2.id
        assert reordered[1]["file"]["id"] == f1.id

    def test_reorder_mismatch(self, client):
        c, db, *_ = client
        f1 = _seed_file(db, "mis.mp3")
        create_res = c.post(
            f"/api/drives/{TEST_DRIVE}/playlists",
            json={"name": "Mismatch"},
        )
        pl_id = create_res.json()["id"]
        c.post(
            f"/api/drives/{TEST_DRIVE}/playlists/{pl_id}/items",
            json={"file_ids": [f1.id]},
        )

        res = c.put(
            f"/api/drives/{TEST_DRIVE}/playlists/{pl_id}/items/reorder",
            json={"item_ids": [99999]},
        )
        assert res.status_code == 409


class TestPlaylistCascadeDelete:
    def test_file_delete_removes_from_playlist(self, client):
        c, db, *_ = client
        file = _seed_file(db, "cascade.mp3")
        create_res = c.post(
            f"/api/drives/{TEST_DRIVE}/playlists",
            json={"name": "Cascade"},
        )
        pl_id = create_res.json()["id"]
        c.post(
            f"/api/drives/{TEST_DRIVE}/playlists/{pl_id}/items",
            json={"file_ids": [file.id]},
        )

        c.delete(f"/api/files/{file.id}")
        detail = c.get(f"/api/drives/{TEST_DRIVE}/playlists/{pl_id}")
        assert len(detail.json()["items"]) == 0

    def test_playlist_delete_removes_items(self, client):
        c, db, *_ = client
        file = _seed_file(db, "pldelete.mp3")
        create_res = c.post(
            f"/api/drives/{TEST_DRIVE}/playlists",
            json={"name": "PlDelete"},
        )
        pl_id = create_res.json()["id"]
        c.post(
            f"/api/drives/{TEST_DRIVE}/playlists/{pl_id}/items",
            json={"file_ids": [file.id]},
        )

        c.delete(f"/api/drives/{TEST_DRIVE}/playlists/{pl_id}")
        res = c.get(f"/api/drives/{TEST_DRIVE}/playlists/{pl_id}")
        assert res.status_code == 404
