"""Acceptance tests for persistent highlights (SPEC-CORE-052): model, routes, authorization."""

import json
from datetime import UTC, datetime
from pathlib import Path

import pytest

from tests.conftest import TEST_DRIVE

ALICE = {"lit_viewer": "alice"}
BOB = {"lit_viewer": "bob"}


def _seed_file(db, drive_dir, filename="note.md", mime_type="text/markdown",
               file_type="document", folder="docs"):
    from app.models import File

    folder_dir = drive_dir / folder
    folder_dir.mkdir(exist_ok=True)
    (folder_dir / filename).write_text("hello world\n")
    file = File(
        filename=filename,
        title=filename.rsplit(".", 1)[0],
        drive=TEST_DRIVE,
        folder_path=folder,
        file_path=f"{folder}/{filename}",
        file_size=12,
        file_type=file_type,
        mime_type=mime_type,
    )
    db.add(file)
    db.commit()
    db.refresh(file)
    return file


def _seed_pdf(db, drive_dir):
    return _seed_file(db, drive_dir, filename="doc.pdf", mime_type="application/pdf")


def _url(file_id, hid=None):
    base = f"/api/files/{file_id}/highlights"
    return base if hid is None else f"{base}/{hid}"


def _body(quote="hello", prefix="", suffix=" world", page=None):
    return {"page": page, "quote": quote, "prefix": prefix, "suffix": suffix}


def _post(c, file_id, body, cookies=ALICE):
    return c.post(_url(file_id), json=body, cookies=cookies)


def _count(db, file_id=None):
    from app.models import Highlight

    db.expire_all()
    q = db.query(Highlight)
    if file_id is not None:
        q = q.filter(Highlight.file_id == file_id)
    return q.count()


class TestCreateAndList:
    def test_create_returns_201_with_record_spec_core_052(self, client):
        c, db, drive_dir, _ = client
        f = _seed_file(db, drive_dir)
        res = _post(c, f.id, _body())
        assert res.status_code == 201
        data = res.json()
        assert set(data) == {"id", "page", "quote", "prefix", "suffix", "created_at"}
        assert data["quote"] == "hello"
        assert data["suffix"] == " world"
        assert data["prefix"] == ""
        assert data["page"] is None
        assert len(data["id"]) == 12

    def test_response_never_carries_viewer_id_spec_core_052(self, client):
        c, db, drive_dir, _ = client
        f = _seed_file(db, drive_dir)
        res = _post(c, f.id, _body())
        assert res.status_code == 201
        listed = c.get(_url(f.id), cookies=ALICE)
        assert listed.status_code == 200 and len(listed.json()) == 1
        assert "viewer_id" not in res.json()
        assert all("viewer_id" not in row for row in listed.json())

    def test_list_oldest_first_spec_core_052(self, client):
        c, db, drive_dir, _ = client
        f = _seed_file(db, drive_dir)
        for q in ("one", "two", "three"):
            assert _post(c, f.id, _body(quote=q)).status_code == 201
        rows = c.get(_url(f.id), cookies=ALICE).json()
        assert [r["quote"] for r in rows] == ["one", "two", "three"]

    def test_list_empty_when_no_highlights_spec_core_052(self, client):
        c, db, drive_dir, _ = client
        f = _seed_file(db, drive_dir)
        res = c.get(_url(f.id), cookies=ALICE)
        assert res.status_code == 200
        assert res.json() == []

    def test_list_without_viewer_is_empty_list_spec_core_052(self, client):
        c, db, drive_dir, _ = client
        f = _seed_file(db, drive_dir)
        _post(c, f.id, _body())
        res = c.get(_url(f.id))
        assert res.status_code == 200
        assert res.json() == []

    def test_post_without_viewer_is_401_spec_core_052(self, client):
        c, db, drive_dir, _ = client
        f = _seed_file(db, drive_dir)
        res = c.post(_url(f.id), json=_body())
        assert res.status_code == 401
        assert _count(db) == 0

    def test_pdf_highlight_keeps_page_spec_core_052(self, client):
        c, db, drive_dir, _ = client
        f = _seed_pdf(db, drive_dir)
        res = _post(c, f.id, _body(page=3))
        assert res.status_code == 201
        assert res.json()["page"] == 3
        assert c.get(_url(f.id), cookies=ALICE).json()[0]["page"] == 3

    def test_per_viewer_isolation_spec_core_052(self, client):
        c, db, drive_dir, _ = client
        f = _seed_file(db, drive_dir)
        _post(c, f.id, _body(quote="mine"), ALICE)
        assert c.get(_url(f.id), cookies=BOB).json() == []
        assert len(c.get(_url(f.id), cookies=ALICE).json()) == 1

    def test_per_file_isolation_spec_core_052(self, client):
        c, db, drive_dir, _ = client
        f1 = _seed_file(db, drive_dir, filename="a.md")
        f2 = _seed_file(db, drive_dir, filename="b.md")
        _post(c, f1.id, _body())
        assert c.get(_url(f2.id), cookies=ALICE).json() == []


class TestValidation:
    @pytest.mark.parametrize("quote", ["", "   ", "\n\t "])
    def test_empty_or_blank_quote_422_spec_core_052(self, client, quote):
        c, db, drive_dir, _ = client
        f = _seed_file(db, drive_dir)
        assert _post(c, f.id, _body(quote=quote)).status_code == 422
        assert _count(db) == 0

    def test_quote_boundary_2000_ok_2001_rejected_spec_core_052(self, client):
        c, db, drive_dir, _ = client
        f = _seed_file(db, drive_dir)
        assert _post(c, f.id, _body(quote="a" * 2000)).status_code == 201
        assert _post(c, f.id, _body(quote="a" * 2001)).status_code == 422

    @pytest.mark.parametrize("field", ["prefix", "suffix"])
    def test_prefix_suffix_boundary_64_ok_65_rejected_spec_core_052(self, client, field):
        c, db, drive_dir, _ = client
        f = _seed_file(db, drive_dir)
        ok = _body()
        ok[field] = "b" * 64
        assert _post(c, f.id, ok).status_code == 201
        bad = _body(quote="other")
        bad[field] = "b" * 65
        assert _post(c, f.id, bad).status_code == 422

    @pytest.mark.parametrize("page", [0, -1])
    def test_page_below_one_422_spec_core_052(self, client, page):
        c, db, drive_dir, _ = client
        f = _seed_pdf(db, drive_dir)
        assert _post(c, f.id, _body(page=page)).status_code == 422

    def test_pdf_requires_page_spec_core_052(self, client):
        c, db, drive_dir, _ = client
        f = _seed_pdf(db, drive_dir)
        assert _post(c, f.id, _body(page=None)).status_code == 422
        body = _body()
        del body["page"]
        assert _post(c, f.id, body).status_code == 422

    def test_pdf_page_one_is_valid_spec_core_052(self, client):
        c, db, drive_dir, _ = client
        f = _seed_pdf(db, drive_dir)
        assert _post(c, f.id, _body(page=1)).status_code == 201

    def test_non_pdf_rejects_page_spec_core_052(self, client):
        c, db, drive_dir, _ = client
        f = _seed_file(db, drive_dir)
        assert _post(c, f.id, _body(page=1)).status_code == 422

    def test_plain_text_file_is_accepted_without_page_spec_core_052(self, client):
        c, db, drive_dir, _ = client
        f = _seed_file(db, drive_dir, filename="a.txt", mime_type="text/plain")
        assert _post(c, f.id, _body()).status_code == 201

    def test_server_does_not_limit_other_file_types_spec_core_052(self, client):
        c, db, drive_dir, _ = client
        f = _seed_file(db, drive_dir, filename="a.mp4", mime_type="video/mp4",
                       file_type="video")
        assert _post(c, f.id, _body()).status_code == 201


class TestDuplicateAndLimit:
    def test_duplicate_returns_existing_200_spec_core_052(self, client):
        c, db, drive_dir, _ = client
        f = _seed_file(db, drive_dir)
        first = _post(c, f.id, _body())
        second = _post(c, f.id, _body())
        assert first.status_code == 201
        assert second.status_code == 200
        assert second.json()["id"] == first.json()["id"]
        assert _count(db, f.id) == 1

    def test_duplicate_pdf_same_page_returns_existing_spec_core_052(self, client):
        c, db, drive_dir, _ = client
        f = _seed_pdf(db, drive_dir)
        a = _post(c, f.id, _body(page=2))
        b = _post(c, f.id, _body(page=2))
        assert b.status_code == 200 and b.json()["id"] == a.json()["id"]

    @pytest.mark.parametrize("change", [
        {"prefix": "x"}, {"suffix": "y"}, {"page": 2},
    ])
    def test_differing_context_or_page_is_not_a_duplicate_spec_core_052(self, client, change):
        c, db, drive_dir, _ = client
        f = _seed_pdf(db, drive_dir)
        assert _post(c, f.id, _body(page=1)).status_code == 201
        assert _post(c, f.id, {**_body(page=1), **change}).status_code == 201
        assert _count(db, f.id) == 2

    def test_same_selection_by_two_viewers_is_not_a_duplicate_spec_core_052(self, client):
        c, db, drive_dir, _ = client
        f = _seed_file(db, drive_dir)
        assert _post(c, f.id, _body(), ALICE).status_code == 201
        assert _post(c, f.id, _body(), BOB).status_code == 201

    def _fill(self, db, file_id, viewer_id, n):
        from app.models import Highlight

        now = datetime.now(UTC)
        for i in range(n):
            db.add(Highlight(id=f"h{i:011d}", viewer_id=viewer_id, file_id=file_id,
                             page=None, quote=f"q{i}", prefix="", suffix="",
                             created_at=now))
        db.commit()

    def test_501st_new_highlight_is_409_spec_core_052(self, client):
        from app.routers.progress import nickname_to_viewer_id

        c, db, drive_dir, _ = client
        f = _seed_file(db, drive_dir)
        self._fill(db, f.id, nickname_to_viewer_id("alice"), 500)
        res = _post(c, f.id, _body(quote="brand new"))
        assert res.status_code == 409
        assert _count(db, f.id) == 500

    def test_500th_is_accepted_spec_core_052(self, client):
        from app.routers.progress import nickname_to_viewer_id

        c, db, drive_dir, _ = client
        f = _seed_file(db, drive_dir)
        self._fill(db, f.id, nickname_to_viewer_id("alice"), 499)
        assert _post(c, f.id, _body(quote="brand new")).status_code == 201
        assert _count(db, f.id) == 500

    def test_duplicate_at_500_returns_existing_not_409_spec_core_052(self, client):
        from app.routers.progress import nickname_to_viewer_id

        c, db, drive_dir, _ = client
        f = _seed_file(db, drive_dir)
        self._fill(db, f.id, nickname_to_viewer_id("alice"), 499)
        first = _post(c, f.id, _body(quote="last"))
        assert first.status_code == 201
        again = _post(c, f.id, _body(quote="last"))
        assert again.status_code == 200
        assert again.json()["id"] == first.json()["id"]

    def test_invalid_at_500_is_422_before_limit_spec_core_052(self, client):
        from app.routers.progress import nickname_to_viewer_id

        c, db, drive_dir, _ = client
        f = _seed_file(db, drive_dir)
        self._fill(db, f.id, nickname_to_viewer_id("alice"), 500)
        assert _post(c, f.id, _body(quote="")).status_code == 422

    def test_limit_is_per_viewer_and_per_file_spec_core_052(self, client):
        from app.routers.progress import nickname_to_viewer_id

        c, db, drive_dir, _ = client
        f1 = _seed_file(db, drive_dir, filename="a.md")
        f2 = _seed_file(db, drive_dir, filename="b.md")
        self._fill(db, f1.id, nickname_to_viewer_id("alice"), 500)
        assert _post(c, f1.id, _body(quote="new"), BOB).status_code == 201
        assert _post(c, f2.id, _body(quote="new"), ALICE).status_code == 201


class TestDelete:
    def test_delete_removes_only_that_record_spec_core_052(self, client):
        c, db, drive_dir, _ = client
        f = _seed_file(db, drive_dir)
        a = _post(c, f.id, _body(quote="a")).json()
        b = _post(c, f.id, _body(quote="b")).json()
        res = c.delete(_url(f.id, a["id"]), cookies=ALICE)
        assert res.status_code == 204
        rows = c.get(_url(f.id), cookies=ALICE).json()
        assert [r["id"] for r in rows] == [b["id"]]

    def test_delete_unknown_record_is_204_spec_core_052(self, client):
        c, db, drive_dir, _ = client
        f = _seed_file(db, drive_dir)
        assert c.delete(_url(f.id, "nope00000000"), cookies=ALICE).status_code == 204

    def test_delete_other_viewers_record_is_204_and_keeps_it_spec_core_052(self, client):
        c, db, drive_dir, _ = client
        f = _seed_file(db, drive_dir)
        h = _post(c, f.id, _body(), ALICE).json()
        assert c.delete(_url(f.id, h["id"]), cookies=BOB).status_code == 204
        assert _count(db, f.id) == 1

    def test_delete_via_another_file_is_204_and_keeps_it_spec_core_052(self, client):
        c, db, drive_dir, _ = client
        f1 = _seed_file(db, drive_dir, filename="a.md")
        f2 = _seed_file(db, drive_dir, filename="b.md")
        h = _post(c, f1.id, _body()).json()
        assert c.delete(_url(f2.id, h["id"]), cookies=ALICE).status_code == 204
        assert _count(db, f1.id) == 1

    def test_delete_without_viewer_deletes_nothing_spec_core_052(self, client):
        c, db, drive_dir, _ = client
        f = _seed_file(db, drive_dir)
        h = _post(c, f.id, _body()).json()
        res = c.delete(_url(f.id, h["id"]))
        assert res.status_code in (204, 401)
        assert _count(db, f.id) == 1


class TestFileState:
    def test_unknown_file_404_on_all_routes_spec_core_052(self, client):
        c, db, drive_dir, _ = client
        real = _seed_file(db, drive_dir)
        assert _post(c, real.id, _body()).status_code == 201
        assert c.get(_url("nofile000000"), cookies=ALICE).status_code == 404
        assert _post(c, "nofile000000", _body()).status_code == 404
        assert c.delete(_url("nofile000000", "x"), cookies=ALICE).status_code == 404

    def test_trashed_file_404_on_all_routes_spec_core_052(self, client):
        c, db, drive_dir, _ = client
        f = _seed_file(db, drive_dir)
        h = _post(c, f.id, _body()).json()
        f.deleted_at = datetime.now(UTC)
        db.commit()
        assert c.get(_url(f.id), cookies=ALICE).status_code == 404
        assert _post(c, f.id, _body(quote="x")).status_code == 404
        assert c.delete(_url(f.id, h["id"]), cookies=ALICE).status_code == 404
        assert _count(db, f.id) == 1

    def test_missing_file_404_on_all_routes_spec_core_052(self, client):
        c, db, drive_dir, _ = client
        f = _seed_file(db, drive_dir)
        h = _post(c, f.id, _body()).json()
        f.missing_since = datetime.now(UTC)
        db.commit()
        assert c.get(_url(f.id), cookies=ALICE).status_code == 404
        assert _post(c, f.id, _body(quote="x")).status_code == 404
        assert c.delete(_url(f.id, h["id"]), cookies=ALICE).status_code == 404

    def test_trash_keeps_and_restore_returns_highlights_spec_core_052(self, client):
        c, db, drive_dir, _ = client
        f = _seed_file(db, drive_dir)
        _post(c, f.id, _body())
        f.deleted_at = datetime.now(UTC)
        db.commit()
        assert _count(db, f.id) == 1
        f.deleted_at = None
        db.commit()
        assert len(c.get(_url(f.id), cookies=ALICE).json()) == 1

    def test_purge_cascades_highlights_spec_core_052(self, client):
        c, db, drive_dir, _ = client
        f = _seed_file(db, drive_dir)
        _post(c, f.id, _body())
        fid = f.id
        db.delete(f)
        db.commit()
        assert _count(db, fid) == 0

    def test_saving_never_modifies_the_file_spec_core_052(self, client):
        c, db, drive_dir, _ = client
        f = _seed_file(db, drive_dir)
        path = Path(drive_dir) / f.file_path
        before = (path.read_bytes(), path.stat().st_mtime_ns)
        h = _post(c, f.id, _body()).json()
        c.delete(_url(f.id, h["id"]), cookies=ALICE)
        assert (path.read_bytes(), path.stat().st_mtime_ns) == before


class TestLockedDrive:
    def test_locked_drive_404_on_all_routes_spec_core_052(self, client, tmp_path):
        import app.auth as auth_module
        import app.config as config

        c, db, drive_dir, _ = client
        f = _seed_file(db, drive_dir)
        h = _post(c, f.id, _body()).json()

        drives_json = tmp_path / "drives_protected.json"
        drives_json.write_text(json.dumps([
            {"name": TEST_DRIVE, "path": str(drive_dir), "access_group": "private"}
        ]))
        config._drives_cache = None
        config.DRIVES_CONFIG = drives_json
        pw_file = tmp_path / "passwords.json"
        pw_file.write_text(json.dumps([{"password": "secret123", "groups": ["private"]}]))
        auth_module._passwords_cache = None
        orig_pw = auth_module.PASSWORDS_CONFIG
        auth_module.PASSWORDS_CONFIG = pw_file
        auth_module.load_passwords()
        try:
            assert c.get(_url(f.id), cookies=ALICE).status_code == 404
            assert _post(c, f.id, _body(quote="x")).status_code == 404
            assert c.delete(_url(f.id, h["id"]), cookies=ALICE).status_code == 404
            assert _count(db, f.id) == 1
        finally:
            auth_module.PASSWORDS_CONFIG = orig_pw
            auth_module._passwords_cache = None


class TestTableCreation:
    def test_table_and_index_created_by_create_all_spec_core_052(self, db_session):
        from sqlalchemy import inspect

        insp = inspect(db_session.get_bind())
        assert "highlights" in insp.get_table_names()
        cols = {c["name"] for c in insp.get_columns("highlights")}
        assert cols == {"id", "viewer_id", "file_id", "page", "quote", "prefix",
                        "suffix", "created_at"}
        index_cols = [tuple(i["column_names"]) for i in insp.get_indexes("highlights")]
        assert ("viewer_id", "file_id") in index_cols
        fks = insp.get_foreign_keys("highlights")
        assert any(fk["referred_table"] == "files"
                   and fk["options"].get("ondelete", "").upper() == "CASCADE"
                   for fk in fks)

    def test_init_db_creates_table_on_existing_database_spec_core_052(self, tmp_path, monkeypatch):
        from sqlalchemy import create_engine, inspect, text

        import app.config as config
        import app.database as database

        monkeypatch.setattr(config, "DATA_DIR", tmp_path / "data")
        (tmp_path / "data").mkdir()
        engine = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
        monkeypatch.setattr(database, "engine", engine)
        database.init_db()
        with engine.begin() as conn:
            conn.execute(text("DROP TABLE highlights"))
        database.init_db()
        assert "highlights" in inspect(engine).get_table_names()
        engine.dispose()
