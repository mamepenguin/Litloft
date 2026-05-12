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


class TestCollectionCRUD:
    def test_list_empty(self, client):
        c, *_ = client
        res = c.get(f"/api/drives/{TEST_DRIVE}/collections")
        assert res.status_code == 200
        assert res.json() == []

    def test_create(self, client):
        c, *_ = client
        res = c.post(
            f"/api/drives/{TEST_DRIVE}/collections",
            json={"name": "My Collection"},
        )
        assert res.status_code == 201
        data = res.json()
        assert data["name"] == "My Collection"
        assert data["drive"] == TEST_DRIVE
        assert data["item_count"] == 0
        assert data["description"] is None

    def test_create_with_description(self, client):
        c, *_ = client
        res = c.post(
            f"/api/drives/{TEST_DRIVE}/collections",
            json={"name": "With Desc", "description": "A curated bundle"},
        )
        assert res.status_code == 201
        data = res.json()
        assert data["description"] == "A curated bundle"

    def test_create_duplicate_name(self, client):
        c, *_ = client
        c.post(f"/api/drives/{TEST_DRIVE}/collections", json={"name": "Dup"})
        res = c.post(f"/api/drives/{TEST_DRIVE}/collections", json={"name": "Dup"})
        assert res.status_code == 409

    def test_create_empty_name(self, client):
        c, *_ = client
        res = c.post(f"/api/drives/{TEST_DRIVE}/collections", json={"name": "   "})
        assert res.status_code == 422

    def test_create_long_name(self, client):
        c, *_ = client
        res = c.post(
            f"/api/drives/{TEST_DRIVE}/collections",
            json={"name": "x" * 101},
        )
        assert res.status_code == 422

    def test_get_detail(self, client):
        c, *_ = client
        create_res = c.post(
            f"/api/drives/{TEST_DRIVE}/collections",
            json={"name": "Detail", "description": "d"},
        )
        cid = create_res.json()["id"]
        res = c.get(f"/api/drives/{TEST_DRIVE}/collections/{cid}")
        assert res.status_code == 200
        data = res.json()
        assert data["name"] == "Detail"
        assert data["description"] == "d"
        assert data["items"] == []

    def test_get_not_found(self, client):
        c, *_ = client
        res = c.get(f"/api/drives/{TEST_DRIVE}/collections/nonexistent1")
        assert res.status_code == 404

    def test_rename(self, client):
        c, *_ = client
        create_res = c.post(
            f"/api/drives/{TEST_DRIVE}/collections",
            json={"name": "Old Name"},
        )
        cid = create_res.json()["id"]
        res = c.put(
            f"/api/drives/{TEST_DRIVE}/collections/{cid}",
            json={"name": "New Name"},
        )
        assert res.status_code == 200
        assert res.json()["name"] == "New Name"

    def test_update_description(self, client):
        c, *_ = client
        create_res = c.post(
            f"/api/drives/{TEST_DRIVE}/collections",
            json={"name": "Desc"},
        )
        cid = create_res.json()["id"]
        res = c.put(
            f"/api/drives/{TEST_DRIVE}/collections/{cid}",
            json={"description": "Added later"},
        )
        assert res.status_code == 200
        assert res.json()["description"] == "Added later"
        assert res.json()["name"] == "Desc"

    def test_clear_description(self, client):
        c, *_ = client
        create_res = c.post(
            f"/api/drives/{TEST_DRIVE}/collections",
            json={"name": "C", "description": "x"},
        )
        cid = create_res.json()["id"]
        res = c.put(
            f"/api/drives/{TEST_DRIVE}/collections/{cid}",
            json={"description": None},
        )
        assert res.status_code == 200
        assert res.json()["description"] is None

    def test_rename_duplicate(self, client):
        c, *_ = client
        c.post(f"/api/drives/{TEST_DRIVE}/collections", json={"name": "A"})
        create_b = c.post(
            f"/api/drives/{TEST_DRIVE}/collections",
            json={"name": "B"},
        )
        cid = create_b.json()["id"]
        res = c.put(
            f"/api/drives/{TEST_DRIVE}/collections/{cid}",
            json={"name": "A"},
        )
        assert res.status_code == 409

    def test_delete(self, client):
        c, *_ = client
        create_res = c.post(
            f"/api/drives/{TEST_DRIVE}/collections",
            json={"name": "ToDelete"},
        )
        cid = create_res.json()["id"]
        res = c.delete(f"/api/drives/{TEST_DRIVE}/collections/{cid}")
        assert res.status_code == 204
        res = c.get(f"/api/drives/{TEST_DRIVE}/collections")
        assert len(res.json()) == 0

    def test_invalid_drive(self, client):
        c, *_ = client
        res = c.get("/api/drives/no-such-drive/collections")
        assert res.status_code == 404

    def test_list_order_by_updated(self, client):
        c, *_ = client
        c.post(f"/api/drives/{TEST_DRIVE}/collections", json={"name": "First"})
        c.post(f"/api/drives/{TEST_DRIVE}/collections", json={"name": "Second"})
        res = c.get(f"/api/drives/{TEST_DRIVE}/collections")
        names = [p["name"] for p in res.json()]
        assert names == ["Second", "First"]


class TestCollectionItems:
    def test_add_items(self, client):
        c, db, *_ = client
        file = _seed_file(db, "song.mp3")
        create_res = c.post(
            f"/api/drives/{TEST_DRIVE}/collections",
            json={"name": "Songs"},
        )
        cid = create_res.json()["id"]

        res = c.post(
            f"/api/drives/{TEST_DRIVE}/collections/{cid}/items",
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
            f"/api/drives/{TEST_DRIVE}/collections",
            json={"name": "DupTest"},
        )
        cid = create_res.json()["id"]

        c.post(
            f"/api/drives/{TEST_DRIVE}/collections/{cid}/items",
            json={"file_ids": [file.id]},
        )
        res = c.post(
            f"/api/drives/{TEST_DRIVE}/collections/{cid}/items",
            json={"file_ids": [file.id]},
        )
        assert res.status_code == 200
        assert len(res.json()["items"]) == 1

    def test_add_file_not_found(self, client):
        c, *_ = client
        create_res = c.post(
            f"/api/drives/{TEST_DRIVE}/collections",
            json={"name": "NotFound"},
        )
        cid = create_res.json()["id"]
        res = c.post(
            f"/api/drives/{TEST_DRIVE}/collections/{cid}/items",
            json={"file_ids": ["abcdefghijkl"]},
        )
        assert res.status_code == 404

    def test_remove_item(self, client):
        c, db, *_ = client
        file = _seed_file(db, "remove.mp3")
        create_res = c.post(
            f"/api/drives/{TEST_DRIVE}/collections",
            json={"name": "RemoveTest"},
        )
        cid = create_res.json()["id"]
        add_res = c.post(
            f"/api/drives/{TEST_DRIVE}/collections/{cid}/items",
            json={"file_ids": [file.id]},
        )
        item_id = add_res.json()["items"][0]["id"]

        res = c.delete(f"/api/drives/{TEST_DRIVE}/collections/{cid}/items/{item_id}")
        assert res.status_code == 204

        detail = c.get(f"/api/drives/{TEST_DRIVE}/collections/{cid}")
        assert len(detail.json()["items"]) == 0

    def test_remove_item_not_found(self, client):
        c, *_ = client
        create_res = c.post(
            f"/api/drives/{TEST_DRIVE}/collections",
            json={"name": "RemoveNF"},
        )
        cid = create_res.json()["id"]
        res = c.delete(f"/api/drives/{TEST_DRIVE}/collections/{cid}/items/99999")
        assert res.status_code == 404

    def test_reorder(self, client):
        c, db, *_ = client
        f1 = _seed_file(db, "a.mp3")
        f2 = _seed_file(db, "b.mp3")
        create_res = c.post(
            f"/api/drives/{TEST_DRIVE}/collections",
            json={"name": "Reorder"},
        )
        cid = create_res.json()["id"]
        add_res = c.post(
            f"/api/drives/{TEST_DRIVE}/collections/{cid}/items",
            json={"file_ids": [f1.id, f2.id]},
        )
        items = add_res.json()["items"]
        item_ids = [items[1]["id"], items[0]["id"]]  # reverse

        res = c.put(
            f"/api/drives/{TEST_DRIVE}/collections/{cid}/items/reorder",
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
            f"/api/drives/{TEST_DRIVE}/collections",
            json={"name": "Mismatch"},
        )
        cid = create_res.json()["id"]
        c.post(
            f"/api/drives/{TEST_DRIVE}/collections/{cid}/items",
            json={"file_ids": [f1.id]},
        )

        res = c.put(
            f"/api/drives/{TEST_DRIVE}/collections/{cid}/items/reorder",
            json={"item_ids": [99999]},
        )
        assert res.status_code == 409


class TestCollectionCascadeDelete:
    def test_file_delete_removes_from_collection(self, client):
        c, db, *_ = client
        file = _seed_file(db, "cascade.mp3")
        create_res = c.post(
            f"/api/drives/{TEST_DRIVE}/collections",
            json={"name": "Cascade"},
        )
        cid = create_res.json()["id"]
        c.post(
            f"/api/drives/{TEST_DRIVE}/collections/{cid}/items",
            json={"file_ids": [file.id]},
        )

        # Soft delete keeps DB record, so cascade doesn't trigger
        c.delete(f"/api/files/{file.id}")
        detail = c.get(f"/api/drives/{TEST_DRIVE}/collections/{cid}")
        assert len(detail.json()["items"]) == 1

        # Purge permanently removes, triggering cascade
        c.delete(f"/api/files/{file.id}/purge")
        detail = c.get(f"/api/drives/{TEST_DRIVE}/collections/{cid}")
        assert len(detail.json()["items"]) == 0

    def test_collection_delete_removes_items(self, client):
        c, db, *_ = client
        file = _seed_file(db, "cdelete.mp3")
        create_res = c.post(
            f"/api/drives/{TEST_DRIVE}/collections",
            json={"name": "CDelete"},
        )
        cid = create_res.json()["id"]
        c.post(
            f"/api/drives/{TEST_DRIVE}/collections/{cid}/items",
            json={"file_ids": [file.id]},
        )

        c.delete(f"/api/drives/{TEST_DRIVE}/collections/{cid}")
        res = c.get(f"/api/drives/{TEST_DRIVE}/collections/{cid}")
        assert res.status_code == 404
