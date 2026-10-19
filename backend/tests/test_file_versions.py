from datetime import UTC, datetime, timedelta
import json
import zlib

import pytest

from app.models import File, FileVersion
from app.services.hash import compute_file_hash
from tests.conftest import TEST_DRIVE


def _file(db, *, suffix: str = "md", mime_type: str = "text/markdown") -> File:
    row = File(
        filename=f"note.{suffix}",
        title="note",
        drive="test-drive",
        folder_path="",
        file_path=f"note.{suffix}",
        file_size=0,
        file_type="document",
        mime_type=mime_type,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _record(db, file_id: str, content: str, **kwargs):
    from app.services.file_versions import record_version

    return record_version(
        db,
        file_id=file_id,
        body=content.encode(),
        kind=kwargs.pop("kind", "auto"),
        viewer_id=kwargs.pop("viewer_id", "viewer-a"),
        nickname=kwargs.pop("nickname", "Alice"),
        **kwargs,
    )


def _record_result(db, file_id: str, content: str, **kwargs):
    from app.services.file_versions import record_version_with_action

    return record_version_with_action(
        db,
        file_id=file_id,
        body=content.encode(),
        kind=kwargs.pop("kind", "auto"),
        viewer_id=kwargs.pop("viewer_id", "viewer-a"),
        nickname=kwargs.pop("nickname", "Alice"),
        **kwargs,
    )


def _seed_text(db, drive_dir, *, path="note.txt", content="old\n") -> File:
    target = drive_dir / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)
    row = File(
        filename=target.name,
        title=target.stem,
        drive=TEST_DRIVE,
        folder_path=str(target.parent.relative_to(drive_dir)).replace(".", ""),
        file_path=path,
        file_size=len(content.encode()),
        file_type="document",
        mime_type="text/plain",
        file_hash=compute_file_hash(target),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


class TestRecordVersion:
    def test_same_viewer_autosaves_inside_window_collapse(self, db_session):
        from app.models import FileVersion

        file = _file(db_session)
        first = _record(db_session, file.id, "one\n")
        second = _record(db_session, file.id, "two\n")

        assert first.id == second.id
        assert db_session.query(FileVersion).count() == 1
        assert second.nickname == "Alice"

    def test_different_viewer_inserts(self, db_session):
        from app.models import FileVersion

        file = _file(db_session)
        _record(db_session, file.id, "one\n")
        _record(
            db_session,
            file.id,
            "two\n",
            viewer_id="viewer-b",
            nickname="Bob",
        )
        assert db_session.query(FileVersion).count() == 2

    def test_anonymous_autosaves_collapse(self, db_session):
        from app.models import FileVersion

        file = _file(db_session)
        first = _record(
            db_session, file.id, "one\n", viewer_id=None, nickname=None
        )
        second = _record(
            db_session, file.id, "two\n", viewer_id=None, nickname=None
        )
        assert first.id == second.id
        assert db_session.query(FileVersion).count() == 1
        assert second.viewer_id is None
        assert second.nickname is None

    def test_autosave_after_window_inserts(self, db_session):
        from app.models import FileVersion
        from app.services.file_versions import FILE_VERSION_COLLAPSE_WINDOW

        file = _file(db_session)
        first = _record(db_session, file.id, "one\n")
        first.created_at = (
            datetime.now(UTC) - FILE_VERSION_COLLAPSE_WINDOW - timedelta(seconds=1)
        )
        db_session.commit()

        second = _record(db_session, file.id, "two\n")
        assert first.id != second.id
        assert db_session.query(FileVersion).count() == 2

    def test_explicit_and_following_auto_each_insert(self, db_session):
        from app.models import FileVersion

        file = _file(db_session)
        _record(db_session, file.id, "one\n", kind="auto")
        explicit = _record(db_session, file.id, "two\n", kind="explicit")
        second_explicit = _record(
            db_session, file.id, "three\n", kind="explicit"
        )
        after = _record(db_session, file.id, "four\n", kind="auto")

        assert len({explicit.id, second_explicit.id, after.id}) == 3
        assert db_session.query(FileVersion).count() == 4

    def test_identical_explicit_version_is_a_no_op(self, db_session):
        file = _file(db_session)
        first = _record(db_session, file.id, "kept\n", kind="explicit")

        result = _record_result(
            db_session,
            file.id,
            "kept\n",
            kind="explicit",
            viewer_id="viewer-b",
            nickname="Bob",
        )

        assert result.action == "unchanged"
        assert result.row.id == first.id
        assert db_session.query(FileVersion).count() == 1
        assert result.row.viewer_id == "viewer-a"
        assert result.row.nickname == "Alice"

    def test_identical_explicit_save_promotes_latest_auto(self, db_session):
        file = _file(db_session)
        automatic = _record(db_session, file.id, "kept\n", kind="auto")

        result = _record_result(
            db_session,
            file.id,
            "kept\n",
            kind="explicit",
            viewer_id="viewer-b",
            nickname="Bob",
        )

        assert result.action == "promoted"
        assert result.row.id == automatic.id
        assert result.row.kind == "explicit"
        assert result.row.viewer_id == "viewer-b"
        assert result.row.nickname == "Bob"
        assert db_session.query(FileVersion).count() == 1

    def test_invalid_kind_is_rejected(self, db_session):
        file = _file(db_session)
        with pytest.raises(ValueError):
            _record(db_session, file.id, "one\n", kind="manual")


class TestLineCountsAndCap:
    def test_first_version_diffs_against_empty(self, db_session):
        row = _record(db_session, _file(db_session).id, "one\ntwo\n")
        assert (row.lines_added, row.lines_removed) == (2, 0)

    def test_new_version_counts_against_predecessor(self, db_session):
        file = _file(db_session)
        older = _record(db_session, file.id, "one\n", kind="explicit")
        newer = _record(db_session, file.id, "one\ntwo\n", kind="explicit")

        assert (older.lines_added, older.lines_removed) == (1, 0)
        assert (newer.lines_added, newer.lines_removed) == (1, 0)

    def test_collapse_recomputes_against_unchanged_predecessor(self, db_session):
        file = _file(db_session)
        _record(db_session, file.id, "one\n", kind="explicit")
        collapsed = _record(db_session, file.id, "one\ntwo\n")
        collapsed = _record(db_session, file.id, "one\ntwo\nthree\n")

        assert (collapsed.lines_added, collapsed.lines_removed) == (2, 0)

    def test_cap_evicts_oldest_auto_and_recomputes_successor(self, db_session, monkeypatch):
        from app.models import FileVersion
        import app.services.file_versions as service

        monkeypatch.setattr(service, "FILE_VERSION_MAX_ROWS", 3)
        file = _file(db_session)
        e1 = _record(db_session, file.id, "base\n", kind="explicit")
        a2 = _record(db_session, file.id, "base\ntwo\n", viewer_id="a")
        a3 = _record(
            db_session,
            file.id,
            "base\ntwo\nthree\n",
            viewer_id="b",
        )
        _record(db_session, file.id, "last\n", kind="explicit")

        ids = {row.id for row in db_session.query(FileVersion).all()}
        assert e1.id in ids
        assert a2.id not in ids
        assert a3.id in ids
        db_session.refresh(a3)
        assert (a3.lines_added, a3.lines_removed) == (2, 0)
        result = service.diff_version(db_session, file_id=file.id, version_id=a3.id)
        assert result is not None
        assert (result[2], result[3]) == (a3.lines_added, a3.lines_removed)

    def test_row_becoming_oldest_recomputes_against_empty(self, db_session, monkeypatch):
        from app.models import FileVersion
        import app.services.file_versions as service

        monkeypatch.setattr(service, "FILE_VERSION_MAX_ROWS", 2)
        file = _file(db_session)
        first = _record(db_session, file.id, "old\n", kind="auto")
        successor = _record(db_session, file.id, "one\ntwo\n", kind="explicit")
        _record(db_session, file.id, "last\n", kind="explicit")

        assert db_session.get(FileVersion, first.id) is None
        db_session.refresh(successor)
        assert (successor.lines_added, successor.lines_removed) == (2, 0)
        result = service.diff_version(
            db_session, file_id=file.id, version_id=successor.id
        )
        assert result is not None
        assert (result[2], result[3]) == (
            successor.lines_added,
            successor.lines_removed,
        )

    def test_large_short_line_diff_uses_linear_fallback(
        self, db_session, monkeypatch
    ):
        import app.services.file_versions as service

        file = _file(db_session)
        before = "a\n" * 80_000
        after = "b\n" * 80_000

        def forbid_sequence_matcher(*args, **kwargs):
            raise AssertionError("large input must not use SequenceMatcher")

        monkeypatch.setattr(service.difflib, "SequenceMatcher", forbid_sequence_matcher)
        _record(db_session, file.id, before, kind="explicit")
        row = _record(db_session, file.id, after, kind="explicit")
        result = service.diff_version(
            db_session, file_id=file.id, version_id=row.id
        )

        assert result is not None
        assert (row.lines_added, row.lines_removed) == (80_000, 80_000)
        assert (result[2], result[3]) == (80_000, 80_000)
        assert result[1][0].kind == "del"
        assert result[1][0].text == "a\n"
        assert result[1][-1].kind == "add"
        assert result[1][-1].text == "b\n"

    def test_structured_diff_preserves_content_that_looks_like_headers(
        self, db_session
    ):
        import app.services.file_versions as service

        file = _file(db_session)
        _record(db_session, file.id, "-- heading\nsame\n", kind="explicit")
        row = _record(
            db_session,
            file.id,
            "--- heading\nsame\n",
            kind="explicit",
        )

        result = service.diff_version(
            db_session, file_id=file.id, version_id=row.id
        )

        assert result is not None
        assert [(line.kind, line.text) for line in result[1]] == [
            ("del", "-- heading\n"),
            ("add", "--- heading\n"),
            ("context", "same\n"),
        ]


class TestVersionBodyValidation:
    @pytest.mark.parametrize("damage", ["zlib", "size", "etag", "oversize"])
    def test_invalid_snapshot_raises_service_error(self, db_session, damage):
        import app.services.file_versions as service

        file = _file(db_session)
        row = _record(db_session, file.id, "safe\n", kind="explicit")
        if damage == "zlib":
            row.content_z = b"not-zlib"
        elif damage == "size":
            row.size_bytes += 1
        elif damage == "etag":
            row.etag = "0" * 64
        else:
            oversized = b"x" * (service.FILE_VERSION_MAX_BODY_BYTES + 1)
            row.content_z = zlib.compress(oversized)
            row.size_bytes = len(oversized)
            row.etag = service.compute_content_etag(oversized)
        db_session.commit()

        expected = (
            service.FileVersionBodyTooLargeError
            if damage == "oversize"
            else service.FileVersionCorruptError
        )
        with pytest.raises(expected):
            service.get_version_body(
                db_session, file_id=file.id, version_id=row.id
            )


class TestWritePathRecording:
    def test_put_header_is_the_only_explicit_trigger(self, client):
        from app.auth import nickname_to_viewer_id
        from app.services.content_write import compute_content_etag

        api, db, drive_dir, _ = client
        file = _seed_text(db, drive_dir)

        first = api.put(
            f"/api/files/{file.id}/content",
            content=b"auto\n",
            headers={
                "If-Match": compute_content_etag(b"old\n"),
                "X-Lit-Viewer": "Alice",
                "X-Litloft-Save-Kind": "not-explicit",
            },
        )
        assert first.status_code == 200, first.text
        explicit = api.put(
            f"/api/files/{file.id}/content",
            content=b"kept\n",
            headers={
                "If-Match": compute_content_etag(b"auto\n"),
                "X-Lit-Viewer": "Alice",
                "X-Litloft-Save-Kind": "explicit",
            },
        )
        assert explicit.status_code == 200, explicit.text

        db.expire_all()
        rows = (
            db.query(FileVersion)
            .filter(FileVersion.file_id == file.id)
            .order_by(FileVersion.id)
            .all()
        )
        assert [row.kind for row in rows] == ["auto", "explicit"]
        assert rows[0].nickname == "Alice"
        assert rows[0].viewer_id == nickname_to_viewer_id("Alice")

    def test_identical_explicit_put_promotes_auto_then_becomes_no_op(self, client):
        from app.services.content_write import compute_content_etag

        api, db, drive_dir, _ = client
        file = _seed_text(db, drive_dir)
        headers = {
            "If-Match": compute_content_etag(b"old\n"),
            "X-Lit-Viewer": "Alice",
        }

        automatic = api.put(
            f"/api/files/{file.id}/content",
            content=b"kept\n",
            headers=headers,
        )
        assert automatic.status_code == 200, automatic.text
        assert automatic.headers["X-Litloft-Version-Action"] == "created"

        explicit_headers = {
            "If-Match": automatic.headers["ETag"],
            "X-Lit-Viewer": "Alice",
            "X-Litloft-Save-Kind": "explicit",
        }
        promoted = api.put(
            f"/api/files/{file.id}/content",
            content=b"kept\n",
            headers=explicit_headers,
        )
        assert promoted.status_code == 200, promoted.text
        assert promoted.headers["X-Litloft-Version-Action"] == "promoted"

        unchanged = api.put(
            f"/api/files/{file.id}/content",
            content=b"kept\n",
            headers={**explicit_headers, "If-Match": promoted.headers["ETag"]},
        )
        assert unchanged.status_code == 200, unchanged.text
        assert unchanged.headers["X-Litloft-Version-Action"] == "unchanged"

        db.expire_all()
        rows = db.query(FileVersion).filter(FileVersion.file_id == file.id).all()
        assert len(rows) == 1
        assert rows[0].kind == "explicit"

    def test_create_and_missing_recovery_record_explicit(self, client):
        from datetime import UTC, datetime

        api, db, _drive_dir, _ = client
        created = api.post(
            f"/api/drives/{TEST_DRIVE}/files",
            json={"path": "created.md", "content": "# created\n"},
        )
        assert created.status_code == 201, created.text
        created_id = created.json()["id"]

        missing = File(
            filename="recovered.md",
            title="recovered",
            drive=TEST_DRIVE,
            folder_path="",
            file_path="recovered.md",
            file_size=0,
            file_type="document",
            mime_type="text/markdown",
            missing_since=datetime.now(UTC),
        )
        db.add(missing)
        db.commit()
        db.refresh(missing)
        recovered = api.post(
            f"/api/drives/{TEST_DRIVE}/files",
            json={"path": "recovered.md", "content": "# recovered\n"},
        )
        assert recovered.status_code == 200, recovered.text

        db.expire_all()
        for file_id in (created_id, missing.id):
            rows = db.query(FileVersion).filter(FileVersion.file_id == file_id).all()
            assert len(rows) == 1
            assert rows[0].kind == "explicit"

    def test_recording_failure_does_not_fail_put_or_roll_back_metadata(
        self, client, monkeypatch
    ):
        from app.services.content_write import compute_content_etag
        import app.services.file_versions as versions

        api, db, drive_dir, _ = client
        file = _seed_text(db, drive_dir, content="before\n")
        calls = 0

        def fail_record(*args, **kwargs):
            nonlocal calls
            calls += 1
            raise RuntimeError("boom")

        monkeypatch.setattr(versions, "record_version_with_action", fail_record)

        response = api.put(
            f"/api/files/{file.id}/content",
            content=b"after\n",
            headers={"If-Match": compute_content_etag(b"before\n")},
        )
        assert response.status_code == 200, response.text
        assert (drive_dir / file.file_path).read_bytes() == b"after\n"
        db.expire_all()
        refreshed = db.get(File, file.id)
        assert refreshed.file_size == len(b"after\n")
        assert refreshed.file_hash == compute_file_hash(drive_dir / file.file_path)
        assert db.query(FileVersion).filter(FileVersion.file_id == file.id).count() == 0
        assert calls == 1


class TestVersionReadRoutes:
    def test_list_body_and_diff_are_scoped_and_consistent(self, client):
        api, db, drive_dir, _ = client
        file = _seed_text(db, drive_dir, content="one\n")
        older = _record(db, file.id, "one\n", kind="explicit")
        newer = _record(db, file.id, "one\ntwo\n", kind="explicit")
        other = _seed_text(db, drive_dir, path="other.txt")
        db.commit()

        listed = api.get(f"/api/files/{file.id}/versions")
        assert listed.status_code == 200, listed.text
        payload = listed.json()
        assert payload["total"] == 2
        assert payload["limit"] == 50
        assert payload["offset"] == 0
        assert [row["id"] for row in payload["versions"]] == [newer.id, older.id]
        assert "content" not in payload["versions"][0]
        assert payload["versions"][0]["created_at"].endswith("Z")

        body = api.get(f"/api/files/{file.id}/versions/{newer.id}")
        assert body.status_code == 200, body.text
        assert body.json() == {
            "id": newer.id,
            "content": "one\ntwo\n",
            "etag": newer.etag,
        }

        diff = api.get(f"/api/files/{file.id}/versions/{newer.id}/diff")
        assert diff.status_code == 200, diff.text
        assert diff.json()["lines"] == [
            {"kind": "context", "text": "one\n"},
            {"kind": "add", "text": "two\n"},
        ]
        assert "diff" not in diff.json()
        assert diff.json()["lines_added"] == newer.lines_added
        assert diff.json()["lines_removed"] == newer.lines_removed
        for response in (listed, body, diff):
            assert response.headers["Cache-Control"] == "no-store"

        assert api.get(f"/api/files/{other.id}/versions/{newer.id}").status_code == 404
        assert api.get(f"/api/files/{other.id}/versions/{newer.id}/diff").status_code == 404

    @pytest.mark.parametrize("damage", ["corrupt", "oversize"])
    def test_invalid_snapshot_returns_non_sensitive_error(self, client, damage):
        import app.services.file_versions as service

        api, db, drive_dir, _ = client
        file = _seed_text(db, drive_dir)
        newer = _record(db, file.id, "newer-secret\n", kind="explicit")
        if damage == "corrupt":
            newer.content_z = b"broken"
        else:
            oversized = b"secret" * (
                service.FILE_VERSION_MAX_BODY_BYTES // len(b"secret") + 1
            )
            newer.content_z = zlib.compress(oversized)
            newer.size_bytes = len(oversized)
            newer.etag = service.compute_content_etag(oversized)
        db.commit()

        body = api.get(f"/api/files/{file.id}/versions/{newer.id}")
        diff = api.get(f"/api/files/{file.id}/versions/{newer.id}/diff")
        assert body.status_code == 500
        assert diff.status_code == 500
        assert body.json() == {"detail": "Stored version is unavailable"}
        assert diff.json() == {"detail": "Stored version is unavailable"}
        assert body.headers["Cache-Control"] == "no-store"
        assert diff.headers["Cache-Control"] == "no-store"
        assert "secret" not in body.text
        assert "secret" not in diff.text

    def test_limit_is_capped_at_100_and_total_is_unbounded(self, client):
        api, db, drive_dir, _ = client
        file = _seed_text(db, drive_dir)
        for index in range(105):
            _record(db, file.id, f"{index}\n", kind="explicit")
        db.commit()

        response = api.get(f"/api/files/{file.id}/versions?limit=500")
        assert response.status_code == 200, response.text
        assert response.json()["total"] == 105
        assert response.json()["limit"] == 100
        assert len(response.json()["versions"]) == 100

    def test_all_routes_hide_locked_drive(self, client):
        import app.config as config

        api, db, drive_dir, _ = client
        file = _seed_text(db, drive_dir)
        row = _record(db, file.id, "secret\n", kind="explicit")
        db.commit()
        config.DRIVES_CONFIG.write_text(
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

        assert api.get(f"/api/files/{file.id}/versions").status_code == 404
        assert api.get(f"/api/files/{file.id}/versions/{row.id}").status_code == 404
        assert api.get(f"/api/files/{file.id}/versions/{row.id}/diff").status_code == 404

    def test_read_routes_allow_text_plain_and_hide_non_writable_mime(self, client):
        api, db, drive_dir, _ = client
        text_file = _seed_text(db, drive_dir)
        text_version = _record(db, text_file.id, "plain\n", kind="explicit")
        video = _file(db, suffix="mp4", mime_type="video/mp4")
        video_version = _record(db, video.id, "not exposed\n", kind="explicit")
        db.commit()

        assert api.get(
            f"/api/files/{text_file.id}/versions/{text_version.id}"
        ).status_code == 200
        assert api.get(f"/api/files/{video.id}/versions").status_code == 404
        assert api.get(
            f"/api/files/{video.id}/versions/{video_version.id}"
        ).status_code == 404
        assert api.get(
            f"/api/files/{video.id}/versions/{video_version.id}/diff"
        ).status_code == 404

    def test_trash_and_missing_keep_versions_but_purge_cascades(self, client):
        api, db, drive_dir, _ = client
        trashed = _seed_text(db, drive_dir, path="trash.txt")
        trashed_id = trashed.id
        trashed_version = _record(db, trashed_id, "trash\n", kind="explicit")
        missing = _seed_text(db, drive_dir, path="missing.txt")
        missing_id = missing.id
        missing_version = _record(db, missing_id, "missing\n", kind="explicit")
        db.commit()

        assert api.delete(f"/api/files/{trashed_id}").status_code == 200
        db.expire_all()
        assert db.query(FileVersion).filter(FileVersion.file_id == trashed_id).count() == 1
        for suffix in (
            "versions",
            f"versions/{trashed_version.id}",
            f"versions/{trashed_version.id}/diff",
        ):
            assert api.get(f"/api/files/{trashed_id}/{suffix}").status_code == 404

        (drive_dir / missing.file_path).unlink()
        missing_row = db.get(File, missing_id)
        missing_row.missing_since = datetime.now(UTC)
        db.commit()
        assert db.query(FileVersion).filter(FileVersion.file_id == missing_id).count() == 1
        for suffix in (
            "versions",
            f"versions/{missing_version.id}",
            f"versions/{missing_version.id}/diff",
        ):
            assert api.get(f"/api/files/{missing_id}/{suffix}").status_code == 404

        assert api.delete(f"/api/files/{trashed_id}/purge").status_code == 200
        db.expire_all()
        assert db.query(FileVersion).filter(FileVersion.file_id == trashed_id).count() == 0
