"""SPEC-CORE-016: a file's first recorded write keeps the text it replaced as a baseline version."""

import logging

import pytest

from app.models import File, FileVersion
from app.services.hash import compute_file_hash
from tests.conftest import TEST_DRIVE


def _seed(
    db,
    drive_dir,
    *,
    path: str = "note.txt",
    body: bytes = b"old\n",
    mime_type: str = "text/plain",
) -> File:
    target = drive_dir / path
    target.write_bytes(body)
    row = File(
        filename=target.name,
        title=target.stem,
        drive=TEST_DRIVE,
        folder_path="",
        file_path=path,
        file_size=len(body),
        file_type="document",
        mime_type=mime_type,
        file_hash=compute_file_hash(target),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _put(api, file_id: str, before: bytes, after: bytes, *, viewer="Alice", kind=None):
    from app.services.content_write import compute_content_etag

    headers = {"If-Match": compute_content_etag(before), "X-Lit-Viewer": viewer}
    if kind is not None:
        headers["X-Litloft-Save-Kind"] = kind
    return api.put(f"/api/files/{file_id}/content", content=after, headers=headers)


def _rows(db, file_id: str) -> list[FileVersion]:
    db.expire_all()
    return (
        db.query(FileVersion)
        .filter(FileVersion.file_id == file_id)
        .order_by(FileVersion.id)
        .all()
    )


def _content(api, file_id: str, version_id: int) -> str:
    response = api.get(f"/api/files/{file_id}/versions/{version_id}")
    assert response.status_code == 200, response.text
    return response.json()["content"]


class TestBaselineOnFirstWrite:
    @pytest.mark.parametrize(
        ("save_kind", "expected_kind"),
        [(None, "auto"), ("explicit", "explicit")],
    )
    @pytest.mark.parametrize(
        ("before", "added", "removed", "diff"),
        [
            (
                b"old\n",
                1,
                1,
                [{"kind": "del", "text": "old\n"}, {"kind": "add", "text": "new\n"}],
            ),
            (b"", 1, 0, [{"kind": "add", "text": "new\n"}]),
        ],
        ids=["prior-text", "empty-file"],
    )
    def test_first_write_keeps_prior_text_as_oldest_viewerless_explicit_version(
        self, client, save_kind, expected_kind, before, added, removed, diff
    ):
        from app.auth import nickname_to_viewer_id

        api, db, drive_dir, _ = client
        file = _seed(db, drive_dir, body=before)

        response = _put(api, file.id, before, b"new\n", kind=save_kind)
        assert response.status_code == 200, response.text
        assert (drive_dir / file.file_path).read_bytes() == b"new\n"

        baseline, new = _rows(db, file.id)
        assert (baseline.kind, baseline.viewer_id, baseline.nickname) == (
            "explicit",
            None,
            None,
        )
        assert (new.kind, new.viewer_id, new.nickname) == (
            expected_kind,
            nickname_to_viewer_id("Alice"),
            "Alice",
        )
        assert baseline.created_at <= new.created_at

        listed = api.get(f"/api/files/{file.id}/versions")
        assert listed.status_code == 200, listed.text
        payload = listed.json()
        assert payload["total"] == 2
        assert [row["id"] for row in payload["versions"]] == [new.id, baseline.id]
        oldest = payload["versions"][1]
        assert (oldest["kind"], oldest["nickname"]) == ("explicit", None)
        assert oldest["size_bytes"] == len(before)

        assert _content(api, file.id, baseline.id) == before.decode()
        assert _content(api, file.id, new.id) == "new\n"

        newest = payload["versions"][0]
        assert (newest["lines_added"], newest["lines_removed"]) == (added, removed)
        diff_response = api.get(f"/api/files/{file.id}/versions/{new.id}/diff")
        assert diff_response.status_code == 200, diff_response.text
        assert diff_response.json()["lines"] == diff
        assert (
            diff_response.json()["lines_added"],
            diff_response.json()["lines_removed"],
        ) == (added, removed)

    def test_second_write_adds_no_second_baseline(self, client):
        api, db, drive_dir, _ = client
        file = _seed(db, drive_dir, body=b"old\n")

        first = _put(api, file.id, b"old\n", b"one\n", viewer="Alice")
        assert first.status_code == 200, first.text
        second = _put(api, file.id, b"one\n", b"two\n", viewer="Bob")
        assert second.status_code == 200, second.text

        rows = _rows(db, file.id)
        assert [row.nickname for row in rows] == [None, "Alice", "Bob"]
        assert [_content(api, file.id, row.id) for row in rows] == [
            "old\n",
            "one\n",
            "two\n",
        ]

    def test_markdown_tag_write_records_baseline(self, client):
        api, db, drive_dir, _ = client
        before = b"---\ntitle: note\n---\nbody\n"
        file = _seed(
            db, drive_dir, path="note.md", body=before, mime_type="text/markdown"
        )

        response = api.put(f"/api/files/{file.id}/tags", json={"tags": ["alpha"]})
        assert response.status_code == 200, response.text

        rows = _rows(db, file.id)
        assert len(rows) == 2
        baseline = rows[0]
        assert (baseline.kind, baseline.viewer_id, baseline.nickname) == (
            "explicit",
            None,
            None,
        )
        assert _content(api, file.id, baseline.id) == before.decode()
        assert "alpha" in _content(api, file.id, rows[1].id)

    @pytest.mark.parametrize("save_kind", [None, "explicit"])
    def test_write_of_identical_text_leaves_one_explicit_row(self, client, save_kind):
        api, db, drive_dir, _ = client
        file = _seed(db, drive_dir, body=b"same\n")

        response = _put(api, file.id, b"same\n", b"same\n", kind=save_kind)
        assert response.status_code == 200, response.text

        rows = _rows(db, file.id)
        assert len(rows) == 1
        assert rows[0].kind == "explicit"
        assert _content(api, file.id, rows[0].id) == "same\n"


class TestFileWithHistoryGetsNoBaseline:
    def test_write_after_recorded_version_records_only_the_new_text(self, client):
        from app.services.file_versions import record_version

        api, db, drive_dir, _ = client
        file = _seed(db, drive_dir, body=b"old\n")
        record_version(
            db,
            file_id=file.id,
            body=b"earlier\n",
            kind="auto",
            viewer_id="viewer-a",
            nickname="Carol",
        )
        db.commit()

        response = _put(api, file.id, b"old\n", b"new\n", kind="explicit")
        assert response.status_code == 200, response.text

        rows = _rows(db, file.id)
        assert [row.nickname for row in rows] == ["Carol", "Alice"]
        assert [_content(api, file.id, row.id) for row in rows] == [
            "earlier\n",
            "new\n",
        ]

    def test_write_after_create_records_only_the_new_text(self, client):
        api, db, _drive_dir, _ = client
        created = api.post(
            f"/api/drives/{TEST_DRIVE}/files",
            json={"path": "created.md", "content": "# created\n"},
        )
        assert created.status_code == 201, created.text
        file_id = created.json()["id"]
        before = _rows(db, file_id)
        assert len(before) == 1

        response = _put(
            api, file_id, b"# created\n", b"# edited\n", kind="explicit"
        )
        assert response.status_code == 200, response.text

        rows = _rows(db, file_id)
        assert len(rows) == 2
        assert rows[0].id == before[0].id
        assert _content(api, file_id, rows[1].id) == "# edited\n"


class TestBaselineEligibility:
    @pytest.mark.parametrize(
        ("before", "has_baseline"),
        [
            (b"x" * 15 + b"\n", True),
            (b"x" * 16 + b"\n", False),
            (b"\xff\xfeold\n", False),
        ],
        ids=["at-cap", "over-cap", "not-utf8"],
    )
    def test_ineligible_prior_text_skips_baseline_but_not_new_version(
        self, client, monkeypatch, before, has_baseline
    ):
        import app.services.file_versions as versions

        monkeypatch.setattr(versions, "FILE_VERSION_MAX_BODY_BYTES", 16)
        api, db, drive_dir, _ = client
        file = _seed(db, drive_dir, body=before)

        response = _put(api, file.id, before, b"new\n")
        assert response.status_code == 200, response.text
        assert (drive_dir / file.file_path).read_bytes() == b"new\n"

        rows = _rows(db, file.id)
        expected = [None, "Alice"] if has_baseline else ["Alice"]
        assert [row.nickname for row in rows] == expected
        assert _content(api, file.id, rows[-1].id) == "new\n"
        if has_baseline:
            assert _content(api, file.id, rows[0].id) == before.decode()


class TestRecordingFailure:
    @pytest.mark.parametrize("failing_body", [b"before\n", b"after\n"], ids=["baseline", "new"])
    def test_failure_on_either_version_keeps_write_and_records_neither(
        self, client, monkeypatch, caplog, failing_body
    ):
        import app.services.file_versions as versions

        api, db, drive_dir, _ = client
        file = _seed(db, drive_dir, body=b"before\n")

        def failing(original):
            def wrapper(*args, **kwargs):
                if kwargs.get("body") == failing_body:
                    raise RuntimeError("boom")
                return original(*args, **kwargs)

            return wrapper

        monkeypatch.setattr(
            versions,
            "record_version_with_action",
            failing(versions.record_version_with_action),
        )
        monkeypatch.setattr(
            versions, "record_version", failing(versions.record_version)
        )

        with caplog.at_level(logging.WARNING):
            response = _put(api, file.id, b"before\n", b"after\n")
        assert response.status_code == 200, response.text
        assert (drive_dir / file.file_path).read_bytes() == b"after\n"
        db.expire_all()
        refreshed = db.get(File, file.id)
        assert refreshed.file_size == len(b"after\n")
        assert _rows(db, file.id) == []
        assert "Could not record file version" in caplog.text
