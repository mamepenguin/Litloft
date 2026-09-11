import io
import json
import time
from datetime import UTC, datetime

import pytest
from fastapi import HTTPException
from PIL import Image

from app.auth import require_admin
from app.main import app
from app.models import File, FileRelation, FileVersion
from app.services import markdown_image_import as importer
from app.services.maintenance import MaintenanceBusyError
from app.services.safe_image_fetch import NormalizedImage, SafeImageFetchError


@pytest.fixture(autouse=True)
def reset_import_state():
    importer._analyses.clear()
    importer._jobs.clear()
    importer._current_job_id = None
    yield
    importer._analyses.clear()
    importer._jobs.clear()
    importer._current_job_id = None


def _seed_markdown(db, drive_dir, *, file_id, path, content):
    full_path = drive_dir / path
    full_path.parent.mkdir(parents=True, exist_ok=True)
    full_path.write_text(content, encoding="utf-8")
    file = File(
        id=file_id,
        filename=full_path.name,
        title=full_path.stem,
        drive="test-drive",
        folder_path=str(full_path.parent.relative_to(drive_dir)).replace(".", ""),
        file_path=path,
        file_size=len(content.encode("utf-8")),
        file_type="document",
        mime_type="text/markdown",
    )
    db.add(file)
    db.commit()
    return file


def _normalized_jpeg():
    output = io.BytesIO()
    Image.new("RGB", (32, 24), "red").save(output, format="JPEG")
    return NormalizedImage(
        body=output.getvalue(),
        extension=".jpg",
        mime_type="image/jpeg",
        width=32,
        height=24,
    )


def _seed_image(db, drive_dir, *, file_id, path, drive="test-drive", body=b"x"):
    full_path = drive_dir / path
    full_path.parent.mkdir(parents=True, exist_ok=True)
    full_path.write_bytes(body)
    file = File(
        id=file_id,
        filename=full_path.name,
        title=full_path.stem,
        drive=drive,
        folder_path=str(full_path.parent.relative_to(drive_dir)).replace(".", ""),
        file_path=path,
        file_size=len(body),
        file_type="image",
        mime_type="image/jpeg",
    )
    db.add(file)
    db.commit()
    return file


def _analyse(http, **body):
    body.setdefault("drive", "test-drive")
    response = http.post("/api/admin/markdown-images/analyses", json=body)
    assert response.status_code == 200, response.text
    return response.json()


def _run_to_completion(http, analysis_id, hosts=("images.example.com",)):
    started = http.post(
        "/api/admin/markdown-images/imports",
        json={"analysis_id": analysis_id, "allowed_hosts": list(hosts)},
    )
    assert started.status_code == 202, started.text
    job_id = started.json()["job_id"]
    for _ in range(200):
        job = http.get(f"/api/admin/markdown-images/imports/{job_id}").json()
        if job["state"] in {"completed", "failed", "cancelled", "interrupted"}:
            return job
        time.sleep(0.02)
    raise AssertionError(f"job did not finish: {job}")


def test_analysis_is_network_free_and_redacts_url(client, monkeypatch):
    http, db, drive_dir, _ = client
    _seed_markdown(
        db,
        drive_dir,
        file_id="note123def45",
        path="recipes/curry.md",
        content="![dish](https://images.example.com/curry.jpg?token=secret)\n",
    )
    _seed_markdown(
        db,
        drive_dir,
        file_id="note234def56",
        path="recipes/plain.md",
        content="# Plain\n",
    )
    monkeypatch.setattr(
        importer,
        "fetch_and_normalize_image",
        lambda url: pytest.fail("analysis must not fetch the network"),
    )

    response = http.post(
        "/api/admin/markdown-images/analyses",
        json={"drive": "test-drive", "folder_path": "recipes", "recursive": True},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["counts"]["total_markdown"] == 2
    assert payload["counts"]["external_https_candidate"] == 1
    assert payload["counts"]["no_image"] == 1
    assert payload["host_counts"] == {"images.example.com": 1}
    assert "token=secret" not in response.text


def test_import_api_rejects_arbitrary_url_field(client):
    http, _, _, _ = client
    response = http.post(
        "/api/admin/markdown-images/imports",
        json={
            "analysis_id": "missing",
            "allowed_hosts": ["example.com"],
            "url": "https://example.com/image.jpg",
        },
    )
    assert response.status_code == 422


def test_import_localizes_image_and_rewrites_markdown(client, monkeypatch):
    http, db, drive_dir, data_dir = client
    note = _seed_markdown(
        db,
        drive_dir,
        file_id="note345def67",
        path="recipes/stew.md",
        content="Before\n![dish](https://images.example.com/stew.jpg)\nAfter\n",
    )
    monkeypatch.setattr(
        importer, "fetch_and_normalize_image", lambda url: _normalized_jpeg()
    )
    analysis = http.post(
        "/api/admin/markdown-images/analyses",
        json={"drive": "test-drive", "folder_path": "recipes", "recursive": True},
    ).json()

    start = http.post(
        "/api/admin/markdown-images/imports",
        json={
            "analysis_id": analysis["analysis_id"],
            "allowed_hosts": ["images.example.com"],
        },
    )
    assert start.status_code == 202
    job_id = start.json()["job_id"]
    for _ in range(100):
        job = http.get(f"/api/admin/markdown-images/imports/{job_id}").json()
        if job["state"] in {"completed", "failed", "cancelled"}:
            break
        time.sleep(0.02)

    assert job["state"] == "completed", job
    assert job["succeeded"] == 1
    db.expire_all()
    rewritten = (drive_dir / "recipes/stew.md").read_text(encoding="utf-8")
    asset = (
        db.query(File)
        .filter(File.drive == "test-drive", File.folder_path == "recipes/assets")
        .one()
    )
    assert rewritten == f"Before\n![dish](loft://{asset.id})\nAfter\n"
    assert (drive_dir / asset.file_path).exists()
    db.refresh(note)
    assert note.thumbnail_path == f"test-drive/.markdown/{note.id}-{asset.id}.jpg"
    assert (data_dir / "thumbnails" / note.thumbnail_path).exists()
    assert (
        db.query(FileRelation)
        .filter(
            FileRelation.file_id_a.in_([note.id, asset.id]),
            FileRelation.file_id_b.in_([note.id, asset.id]),
        )
        .count()
        == 1
    )
    versions = db.query(FileVersion).filter(FileVersion.file_id == note.id).all()
    assert len(versions) == 1
    assert versions[0].kind == "explicit"
    assert versions[0].viewer_id is None


def test_import_rejects_host_not_in_analysis(client):
    http, db, drive_dir, _ = client
    _seed_markdown(
        db,
        drive_dir,
        file_id="note456def78",
        path="recipe.md",
        content="![](https://images.example.com/a.jpg)\n",
    )
    analysis = http.post(
        "/api/admin/markdown-images/analyses",
        json={"drive": "test-drive"},
    ).json()
    response = http.post(
        "/api/admin/markdown-images/imports",
        json={
            "analysis_id": analysis["analysis_id"],
            "allowed_hosts": ["other.example.com"],
        },
    )
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "allowed_hosts_invalid"


def test_admin_router_rejects_non_admin(client):
    http, _, _, _ = client

    def forbidden():
        raise HTTPException(status_code=403, detail="Admin access required")

    app.dependency_overrides[require_admin] = forbidden
    response = http.post(
        "/api/admin/markdown-images/analyses",
        json={"drive": "test-drive"},
    )
    assert response.status_code == 403


def test_import_returns_conflict_without_creating_asset(client, monkeypatch):
    http, db, drive_dir, _ = client
    _seed_markdown(
        db,
        drive_dir,
        file_id="note567def89",
        path="recipes/pie.md",
        content="![](https://images.example.com/pie.jpg)\n",
    )
    monkeypatch.setattr(
        importer, "fetch_and_normalize_image", lambda url: _normalized_jpeg()
    )
    analysis = http.post(
        "/api/admin/markdown-images/analyses",
        json={"drive": "test-drive", "folder_path": "recipes"},
    ).json()
    (drive_dir / "recipes/pie.md").write_text("# Changed\n", encoding="utf-8")

    started = http.post(
        "/api/admin/markdown-images/imports",
        json={
            "analysis_id": analysis["analysis_id"],
            "allowed_hosts": ["images.example.com"],
        },
    ).json()
    for _ in range(100):
        job = http.get(
            f"/api/admin/markdown-images/imports/{started['job_id']}"
        ).json()
        if job["state"] == "completed":
            break
        time.sleep(0.02)

    assert job["conflicts"] == 1
    assert not (drive_dir / "recipes/assets").exists()
    assert (drive_dir / "recipes/pie.md").read_text(encoding="utf-8") == "# Changed\n"


def test_import_start_rejects_busy_maintenance(client, monkeypatch):
    http, db, drive_dir, _ = client
    _seed_markdown(
        db,
        drive_dir,
        file_id="note678def90",
        path="recipe.md",
        content="![](https://images.example.com/a.jpg)\n",
    )
    analysis = http.post(
        "/api/admin/markdown-images/analyses",
        json={"drive": "test-drive"},
    ).json()
    monkeypatch.setattr(importer, "is_busy", lambda: True)

    response = http.post(
        "/api/admin/markdown-images/imports",
        json={
            "analysis_id": analysis["analysis_id"],
            "allowed_hosts": ["images.example.com"],
        },
    )
    assert response.status_code == 409


class TestAnalysis:
    def test_a_loft_reference_into_another_drive_is_not_a_local_image(
        self, client, tmp_path, monkeypatch
    ):
        """A drive is a security boundary, so the target lookup is drive-scoped.

        Without the scope the note would be counted as already localised and
        left pointing at an id its own drive cannot serve.
        """
        import json

        import app.config as config

        http, db, drive_dir, _ = client
        other_dir = tmp_path / "drives" / "other"
        other_dir.mkdir(parents=True, exist_ok=True)
        drives_path = tmp_path / "drives.json"
        drives_path.write_text(
            json.dumps(
                [
                    {"name": "test-drive", "path": str(drive_dir)},
                    {"name": "other-drive", "path": str(other_dir)},
                ]
            )
        )
        monkeypatch.setattr(config, "DRIVES_CONFIG", drives_path)
        monkeypatch.setattr(config, "_drives_cache", None)

        _seed_image(db, other_dir, file_id="foreignimg01", path="pic.jpg", drive="other-drive")
        _seed_markdown(
            db,
            drive_dir,
            file_id="noteforeign1",
            path="note.md",
            content="![](loft://foreignimg01)\n",
        )

        counts = _analyse(http)["counts"]

        assert counts["invalid_loft_reference"] == 1
        assert counts["local_loft_image"] == 0

    def test_a_loft_reference_to_a_live_image_in_this_drive_is_local(self, client):
        http, db, drive_dir, _ = client
        _seed_image(db, drive_dir, file_id="localimage01", path="pic.jpg")
        _seed_markdown(
            db, drive_dir, file_id="notelocal001", path="note.md",
            content="![](loft://localimage01)\n",
        )

        counts = _analyse(http)["counts"]

        assert counts["local_loft_image"] == 1
        assert counts["invalid_loft_reference"] == 0

    @pytest.mark.parametrize(
        "url,category",
        [
            ("loft://short", "invalid_loft_reference"),
            ("loft://../../etc/passwd", "invalid_loft_reference"),
            ("http://images.example.com/a.jpg", "unsupported_first_image"),
            ("https://localhost/a.jpg", "unsupported_first_image"),
            ("/local/relative.jpg", "unsupported_first_image"),
        ],
    )
    def test_a_reference_the_importer_cannot_act_on_is_categorised_not_queued(
        self, client, url, category
    ):
        """Anything that is neither a live local id nor a fetchable HTTPS URL
        has to land in a count; a candidate list is a list of fetches."""
        http, db, drive_dir, _ = client
        _seed_markdown(
            db, drive_dir, file_id="noteuncat001", path="note.md",
            content=f"![]({url})\n",
        )

        analysis = _analyse(http)

        assert analysis["counts"][category] == 1
        assert analysis["counts"]["external_https_candidate"] == 0
        assert analysis["host_counts"] == {}

    def test_a_reference_style_image_is_not_a_candidate(self, client):
        """The importer rewrites the destination in place by offset, and a
        reference-style image has none — its target lives in a link definition
        elsewhere in the file."""
        http, db, drive_dir, _ = client
        _seed_markdown(
            db, drive_dir, file_id="noteref00001", path="note.md",
            content="![alt][ref]\n\n[ref]: https://images.example.com/a.jpg\n",
        )

        analysis = _analyse(http)

        assert analysis["counts"]["unsupported_first_image"] == 1
        assert analysis["counts"]["external_https_candidate"] == 0

    def test_a_non_recursive_analysis_stops_at_the_named_folder(self, client):
        """`recursive` is the operator's switch; the two queries have to differ."""
        http, db, drive_dir, _ = client
        _seed_markdown(
            db, drive_dir, file_id="notehere0001", path="recipes/here.md",
            content="![](https://images.example.com/a.jpg)\n",
        )
        _seed_markdown(
            db, drive_dir, file_id="notedeeper01", path="recipes/sub/deeper.md",
            content="![](https://images.example.com/b.jpg)\n",
        )
        _seed_markdown(
            db, drive_dir, file_id="noteoutside1", path="other/out.md",
            content="![](https://images.example.com/c.jpg)\n",
        )

        shallow = _analyse(http, folder_path="recipes", recursive=False)
        deep = _analyse(http, folder_path="recipes", recursive=True)

        assert shallow["counts"]["total_markdown"] == 1
        assert shallow["counts"]["external_https_candidate"] == 1
        assert deep["counts"]["total_markdown"] == 2
        assert deep["counts"]["external_https_candidate"] == 2

    def test_a_markdown_file_the_analysis_cannot_read_is_counted_and_skipped(
        self, client
    ):
        """One unreadable file must not cost the operator the whole analysis."""
        http, db, drive_dir, _ = client
        _seed_markdown(
            db, drive_dir, file_id="notereadok01", path="fine.md",
            content="![](https://images.example.com/a.jpg)\n",
        )
        _seed_markdown(db, drive_dir, file_id="notebinary01", path="binary.md", content="x")
        (drive_dir / "binary.md").write_bytes(b"\xff\xfe not utf-8")
        _seed_markdown(db, drive_dir, file_id="notemissing1", path="gone.md", content="x")
        (drive_dir / "gone.md").unlink()

        analysis = _analyse(http)

        assert analysis["counts"]["read_error"] == 2
        assert analysis["counts"]["external_https_candidate"] == 1
        assert {sample["category"] for sample in analysis["samples"]} == {
            "read_error",
            "external_https_candidate",
        }

    def test_a_markdown_file_over_the_size_limit_is_a_read_error(
        self, client, monkeypatch
    ):
        """The analysis reads every note into memory, so the cap is what keeps
        one enormous file from deciding how much the process allocates."""
        http, db, drive_dir, _ = client
        monkeypatch.setattr(importer, "MAX_MARKDOWN_BYTES", 16)
        _seed_markdown(
            db, drive_dir, file_id="notetoobig01", path="big.md",
            content="![](https://images.example.com/a.jpg)\n" + "padding\n" * 10,
        )

        analysis = _analyse(http)

        assert analysis["counts"]["read_error"] == 1
        assert analysis["counts"]["external_https_candidate"] == 0

    def test_the_sample_list_is_capped_while_the_counts_are_not(self, client):
        """Samples are shown to an operator; the counts are the measurement."""
        http, db, drive_dir, _ = client
        for index in range(30):
            _seed_markdown(
                db, drive_dir, file_id=f"notebulk{index:04d}", path=f"note{index}.md",
                content=f"![](https://images.example.com/{index}.jpg)\n",
            )

        analysis = _analyse(http)

        assert analysis["counts"]["external_https_candidate"] == 30
        assert len(analysis["samples"]) == 25
        assert analysis["host_counts"] == {"images.example.com": 30}

    def test_an_analysis_past_its_ttl_is_no_longer_usable(self, client, monkeypatch):
        """The candidates carry the content hash the import verifies against, so
        the TTL is what bounds how long a snapshot can authorise a write."""
        http, db, drive_dir, _ = client
        _seed_markdown(
            db, drive_dir, file_id="noteexpire01", path="note.md",
            content="![](https://images.example.com/a.jpg)\n",
        )
        analysis = _analyse(http)
        assert importer.get_analysis(analysis["analysis_id"]) is not None

        monkeypatch.setattr(
            importer, "_now", lambda: datetime.now(UTC) + importer.ANALYSIS_TTL * 2
        )

        assert importer.get_analysis(analysis["analysis_id"]) is None
        refused = http.post(
            "/api/admin/markdown-images/imports",
            json={
                "analysis_id": analysis["analysis_id"],
                "allowed_hosts": ["images.example.com"],
            },
        )
        assert refused.status_code == 404
        assert refused.json()["detail"]["code"] == "analysis_not_found"

    def test_an_unknown_drive_and_a_traversing_folder_are_refused(self, client):
        http, _, _, _ = client

        unknown = http.post(
            "/api/admin/markdown-images/analyses", json={"drive": "no-such-drive"}
        )
        traversal = http.post(
            "/api/admin/markdown-images/analyses",
            json={"drive": "test-drive", "folder_path": "../../etc"},
        )

        assert unknown.status_code == 400
        assert unknown.json()["detail"]["code"] == "drive_not_found"
        assert traversal.status_code == 400
        assert traversal.json()["detail"]["code"] == "invalid_folder"


class TestAssetPlacement:
    """`_choose_asset_path` decides whether a write reuses a file or adds one.

    The candidate filename is the note's stem plus the URL hash, so a note that
    references the same URL a second time lands on the name its first import
    already took. Getting the branch wrong either overwrites that file with
    different bytes or grows a copy on every run.
    """

    def test_the_same_url_a_second_time_reuses_the_file_already_there(
        self, client, monkeypatch
    ):
        http, db, drive_dir, _ = client
        image = _normalized_jpeg()
        monkeypatch.setattr(importer, "fetch_and_normalize_image", lambda url: image)
        _seed_markdown(
            db, drive_dir, file_id="notereuse001", path="one.md",
            content="![](https://images.example.com/a.jpg)\n",
        )
        first = _run_to_completion(http, _analyse(http)["analysis_id"])
        assert first["succeeded"] == 1

        (drive_dir / "one.md").write_text(
            "![](https://images.example.com/a.jpg)\n", encoding="utf-8"
        )
        second = _run_to_completion(http, _analyse(http)["analysis_id"])

        assert (second["reused"], second["succeeded"]) == (1, 0)
        assert len(list((drive_dir / "assets").glob("*.jpg"))) == 1
        assert db.query(File).filter(File.folder_path == "assets").count() == 1

    def test_different_bytes_under_the_same_name_get_their_own_file(
        self, client, monkeypatch
    ):
        http, db, drive_dir, _ = client
        monkeypatch.setattr(
            importer, "fetch_and_normalize_image", lambda url: _normalized_jpeg()
        )
        _seed_markdown(
            db, drive_dir, file_id="notecollide1", path="one.md",
            content="![](https://images.example.com/a.jpg)\n",
        )
        assert _run_to_completion(http, _analyse(http)["analysis_id"])["succeeded"] == 1
        existing = db.query(File).filter(File.folder_path == "assets").one()
        (drive_dir / existing.file_path).write_bytes(b"different bytes entirely")

        (drive_dir / "one.md").write_text(
            "![](https://images.example.com/a.jpg)\n", encoding="utf-8"
        )
        second = _run_to_completion(http, _analyse(http)["analysis_id"])

        assert second["succeeded"] == 1
        assert len(list((drive_dir / "assets").glob("*.jpg"))) == 2
        assert (drive_dir / existing.file_path).read_bytes() == b"different bytes entirely"


    def test_a_row_whose_file_is_gone_does_not_claim_the_name(
        self, client, monkeypatch
    ):
        """The row can outlive the file; the scanner marks that Missing, but not
        before its next pass. Reusing the name in between would point the note
        at a row with nothing behind it."""
        http, db, drive_dir, _ = client
        monkeypatch.setattr(
            importer, "fetch_and_normalize_image", lambda url: _normalized_jpeg()
        )
        _seed_markdown(
            db, drive_dir, file_id="notevanish01", path="one.md",
            content="![](https://images.example.com/a.jpg)\n",
        )
        assert _run_to_completion(http, _analyse(http)["analysis_id"])["succeeded"] == 1
        first = db.query(File).filter(File.folder_path == "assets").one()
        (drive_dir / first.file_path).unlink()

        (drive_dir / "one.md").write_text(
            "![](https://images.example.com/a.jpg)\n", encoding="utf-8"
        )
        second = _run_to_completion(http, _analyse(http)["analysis_id"])

        assert (second["succeeded"], second["reused"]) == (1, 0)
        db.expire_all()
        assert db.query(File).filter(File.folder_path == "assets").count() == 2
        assert not (drive_dir / first.file_path).exists()

    def test_a_write_that_fails_leaves_no_partial_file_behind(self, client):
        """The asset is written to a temp name and moved, so a failed move must
        not leave a dotfile sitting in the user's own assets folder."""
        _, _, drive_dir, _ = client
        target = drive_dir / "assets" / "image.jpg"
        target.parent.mkdir(parents=True, exist_ok=True)

        def refuse(source, destination):
            raise OSError("no space left on device")

        with pytest.MonkeyPatch.context() as patch:
            patch.setattr(importer.os, "replace", refuse)
            with pytest.raises(OSError):
                importer._write_asset(target, _normalized_jpeg())

        assert not target.exists()
        assert list(target.parent.iterdir()) == []


class TestImportFailurePaths:
    def test_a_failed_registration_leaves_no_asset_behind(self, client, monkeypatch):
        """A file no row points at is what the next scan registers as an image
        the user never added, and the note still points at the remote URL."""
        http, db, drive_dir, _ = client
        monkeypatch.setattr(
            importer, "fetch_and_normalize_image", lambda url: _normalized_jpeg()
        )

        def explode(*args, **kwargs):
            raise RuntimeError("registration exploded")

        monkeypatch.setattr(importer, "register_single_file", explode)
        _seed_markdown(
            db, drive_dir, file_id="notereg00001", path="note.md",
            content="![](https://images.example.com/a.jpg)\n",
        )

        job = _run_to_completion(http, _analyse(http)["analysis_id"])

        assert job["failed"] == 1
        assert job["recent_errors"][0]["code"] == "import_failed"
        assert list((drive_dir / "assets").glob("*")) == []
        assert (drive_dir / "note.md").read_text(encoding="utf-8") == (
            "![](https://images.example.com/a.jpg)\n"
        )

    def test_a_failed_content_write_takes_the_new_asset_with_it(
        self, client, monkeypatch
    ):
        """Otherwise the drive keeps an image nothing references and the note is
        unchanged, so the next run imports the same URL again."""
        http, db, drive_dir, _ = client
        monkeypatch.setattr(
            importer, "fetch_and_normalize_image", lambda url: _normalized_jpeg()
        )

        def explode(*args, **kwargs):
            raise RuntimeError("content write exploded")

        monkeypatch.setattr(importer, "write_text_content", explode)
        _seed_markdown(
            db, drive_dir, file_id="notewrite001", path="note.md",
            content="![](https://images.example.com/a.jpg)\n",
        )

        job = _run_to_completion(http, _analyse(http)["analysis_id"])

        assert job["failed"] == 1
        db.expire_all()
        assert db.query(File).filter(File.folder_path == "assets").count() == 0
        assert list((drive_dir / "assets").glob("*.jpg")) == []

    def test_a_failed_content_write_keeps_an_asset_it_did_not_create(
        self, client, monkeypatch
    ):
        """The file was on disk before this import began, so rolling back what
        this import did cannot include it: the note may link it from elsewhere,
        and `physical_delete` has nothing to undo it with."""
        http, db, drive_dir, _ = client
        image = _normalized_jpeg()
        monkeypatch.setattr(importer, "fetch_and_normalize_image", lambda url: image)
        _seed_markdown(
            db, drive_dir, file_id="notekeep0001", path="one.md",
            content="![](https://images.example.com/a.jpg)\n",
        )
        assert _run_to_completion(http, _analyse(http)["analysis_id"])["succeeded"] == 1
        asset = db.query(File).filter(File.folder_path == "assets").one()
        (drive_dir / "one.md").write_text(
            "![](https://images.example.com/a.jpg)\n", encoding="utf-8"
        )

        def explode(*args, **kwargs):
            raise RuntimeError("content write exploded")

        monkeypatch.setattr(importer, "write_text_content", explode)
        job = _run_to_completion(http, _analyse(http)["analysis_id"])

        assert job["failed"] == 1
        assert "orphan_file_id" not in job["recent_errors"][0]["detail"]
        db.expire_all()
        assert db.query(File).filter(File.id == asset.id).count() == 1
        assert (drive_dir / asset.file_path).exists()

    def test_a_cleanup_that_also_fails_names_the_orphan_it_left(
        self, client, monkeypatch
    ):
        """The asset row cannot be removed, so the id goes into the error the
        operator reads — it is the only handle on the file left behind."""
        http, db, drive_dir, _ = client
        monkeypatch.setattr(
            importer, "fetch_and_normalize_image", lambda url: _normalized_jpeg()
        )

        def explode(*args, **kwargs):
            raise RuntimeError("content write exploded")

        def explode_cleanup(*args, **kwargs):
            raise RuntimeError("physical delete exploded")

        monkeypatch.setattr(importer, "write_text_content", explode)
        monkeypatch.setattr(importer, "physical_delete", explode_cleanup)
        _seed_markdown(
            db, drive_dir, file_id="noteorphan01", path="note.md",
            content="![](https://images.example.com/a.jpg)\n",
        )

        job = _run_to_completion(http, _analyse(http)["analysis_id"])

        assert job["failed"] == 1
        detail = job["recent_errors"][0]["detail"]
        assert "content_write_failed" in detail
        assert "orphan_file_id=" in detail
        orphan_id = detail.split("orphan_file_id=")[1].split()[0]
        db.expire_all()
        assert db.query(File).filter(File.id == orphan_id).one().file_type == "image"

    def test_a_projection_failure_does_not_undo_a_durable_write(
        self, client, monkeypatch
    ):
        """Relations and the note thumbnail are derived data. Reporting the
        import as failed would invite a re-run against a note already rewritten.
        """
        http, db, drive_dir, _ = client
        monkeypatch.setattr(
            importer, "fetch_and_normalize_image", lambda url: _normalized_jpeg()
        )

        def explode(*args, **kwargs):
            raise RuntimeError("projection exploded")

        monkeypatch.setattr(importer, "sync_markdown_file_relations", explode)
        _seed_markdown(
            db, drive_dir, file_id="noteproj0001", path="note.md",
            content="![](https://images.example.com/a.jpg)\n",
        )

        job = _run_to_completion(http, _analyse(http)["analysis_id"])

        assert (job["state"], job["succeeded"], job["failed"]) == ("completed", 1, 0)
        db.expire_all()
        asset = db.query(File).filter(File.folder_path == "assets").one()
        assert (drive_dir / "note.md").read_text(encoding="utf-8") == (
            f"![](loft://{asset.id})\n"
        )

    def test_a_note_that_stopped_being_active_is_a_conflict(self, client, monkeypatch):
        http, db, drive_dir, _ = client
        monkeypatch.setattr(
            importer, "fetch_and_normalize_image", lambda url: _normalized_jpeg()
        )
        note = _seed_markdown(
            db, drive_dir, file_id="notetrashed1", path="note.md",
            content="![](https://images.example.com/a.jpg)\n",
        )
        analysis = _analyse(http)
        note.deleted_at = datetime.now(UTC)
        db.commit()

        job = _run_to_completion(http, analysis["analysis_id"])

        assert job["conflicts"] == 1
        assert job["recent_errors"][0]["code"] == "content_conflict"
        assert not (drive_dir / "assets").exists()

    def test_a_refused_fetch_is_reported_under_its_own_code(self, client, monkeypatch):
        """`recent_errors` is what the admin screen shows, so the distinction
        between "too large" and "the fetch broke" has to survive to it."""
        http, db, drive_dir, _ = client

        def refuse(url):
            raise SafeImageFetchError("response_too_large", "Image response exceeds byte limit")

        monkeypatch.setattr(importer, "fetch_and_normalize_image", refuse)
        _seed_markdown(
            db, drive_dir, file_id="notetoolarge", path="note.md",
            content="![](https://images.example.com/a.jpg)\n",
        )

        job = _run_to_completion(http, _analyse(http)["analysis_id"])

        assert job["failed"] == 1
        assert job["recent_errors"][0]["code"] == "response_too_large"
        assert not (drive_dir / "assets").exists()


class TestJobLifecycle:
    def test_a_cancelled_job_stops_before_the_remaining_candidates(
        self, client, monkeypatch
    ):
        http, db, drive_dir, _ = client
        fetched = []

        def fetch(url):
            fetched.append(url)
            current = http.get("/api/admin/markdown-images/imports/current").json()
            assert current["job"]["job_id"] == importer._current_job_id
            assert current["job"]["state"] == "running"
            cancelled = http.post(
                f"/api/admin/markdown-images/imports/{importer._current_job_id}/cancel"
            )
            assert cancelled.status_code == 200
            assert cancelled.json()["state"] == "cancelling"
            return _normalized_jpeg()

        monkeypatch.setattr(importer, "fetch_and_normalize_image", fetch)
        for index in range(4):
            _seed_markdown(
                db, drive_dir, file_id=f"notecancel{index:02d}", path=f"note{index}.md",
                content=f"![](https://images.example.com/{index}.jpg)\n",
            )

        job = _run_to_completion(http, _analyse(http)["analysis_id"])

        assert job["state"] == "cancelled"
        assert len(fetched) == 1
        assert job["processed"] == 1
        assert job["total"] == 4

    def test_cancelling_a_finished_job_leaves_its_state_alone(self, client, monkeypatch):
        http, db, drive_dir, _ = client
        monkeypatch.setattr(
            importer, "fetch_and_normalize_image", lambda url: _normalized_jpeg()
        )
        _seed_markdown(
            db, drive_dir, file_id="notedonecanc", path="note.md",
            content="![](https://images.example.com/a.jpg)\n",
        )
        job = _run_to_completion(http, _analyse(http)["analysis_id"])

        response = http.post(f"/api/admin/markdown-images/imports/{job['job_id']}/cancel")

        assert response.status_code == 200
        assert response.json()["state"] == "completed"

    def test_a_job_no_longer_in_memory_is_read_back_from_disk(self, client, monkeypatch):
        """A restart empties `_jobs`; the operator's job link must still answer."""
        http, db, drive_dir, _ = client
        monkeypatch.setattr(
            importer, "fetch_and_normalize_image", lambda url: _normalized_jpeg()
        )
        _seed_markdown(
            db, drive_dir, file_id="noteondisk01", path="note.md",
            content="![](https://images.example.com/a.jpg)\n",
        )
        job = _run_to_completion(http, _analyse(http)["analysis_id"])
        importer._jobs.clear()

        response = http.get(f"/api/admin/markdown-images/imports/{job['job_id']}")

        assert response.status_code == 200
        assert response.json()["succeeded"] == 1
        assert http.get("/api/admin/markdown-images/imports/deadbeefcafe").status_code == 404
        cancelled = http.post(
            f"/api/admin/markdown-images/imports/{job['job_id']}/cancel"
        )
        assert cancelled.status_code == 200
        assert cancelled.json()["state"] == "completed"
        assert http.post(
            "/api/admin/markdown-images/imports/deadbeefcafe/cancel"
        ).status_code == 404

    def test_a_job_record_that_will_not_parse_is_not_found_rather_than_a_500(
        self, client
    ):
        http, _, _, _ = client
        directory = importer._job_dir()
        directory.mkdir(parents=True, exist_ok=True)
        (directory / "corruptjob01.json").write_text("{not json", encoding="utf-8")

        assert http.get("/api/admin/markdown-images/imports/corruptjob01").status_code == 404

    def test_a_job_interrupted_by_a_restart_is_marked_and_surfaced(self, client):
        """A job left `running` by a kill is not running. Saying so is what tells
        the operator the note rewrites stopped part-way through."""
        http, _, _, _ = client
        directory = importer._job_dir()
        directory.mkdir(parents=True, exist_ok=True)
        (directory / "runningjob01.json").write_text(
            json.dumps(
                {
                    "job_id": "runningjob01",
                    "analysis_id": "gone",
                    "drive": "test-drive",
                    "allowed_hosts": ["images.example.com"],
                    "state": "running",
                    "total": 3,
                    "processed": 1,
                }
            ),
            encoding="utf-8",
        )
        (directory / "donejob00001.json").write_text(
            json.dumps(
                {
                    "job_id": "donejob00001",
                    "analysis_id": "gone",
                    "drive": "test-drive",
                    "allowed_hosts": [],
                    "state": "completed",
                }
            ),
            encoding="utf-8",
        )
        (directory / "brokenjob001.json").write_text("{not json", encoding="utf-8")

        importer.initialize_interrupted_jobs()

        assert set(importer._jobs) == {"runningjob01"}
        assert importer._jobs["runningjob01"].state == "interrupted"
        assert json.loads(
            (directory / "runningjob01.json").read_text(encoding="utf-8")
        )["state"] == "interrupted"
        assert json.loads(
            (directory / "donejob00001.json").read_text(encoding="utf-8")
        )["state"] == "completed"
        current = http.get("/api/admin/markdown-images/imports/current").json()["job"]
        assert current["job_id"] == "runningjob01"

    def test_a_job_that_cannot_take_the_maintenance_lock_reports_it(
        self, client, monkeypatch
    ):
        """The lock is taken inside the task, after the request was answered
        with 202, so this refusal reaches the operator only through the job
        record."""
        http, db, drive_dir, _ = client
        fetched = []

        def fetch(url):
            fetched.append(url)
            return _normalized_jpeg()

        def refuse(*args, **kwargs):
            raise MaintenanceBusyError("another operation took the lock first")

        monkeypatch.setattr(importer, "fetch_and_normalize_image", fetch)
        monkeypatch.setattr(importer, "maintenance_operation", refuse)
        _seed_markdown(
            db, drive_dir, file_id="notelocked01", path="note.md",
            content="![](https://images.example.com/a.jpg)\n",
        )

        job = _run_to_completion(http, _analyse(http)["analysis_id"])

        assert job["state"] == "failed"
        assert job["recent_errors"][0]["code"] == "maintenance_busy"
        assert fetched == []
        assert not (drive_dir / "assets").exists()

    def test_a_scope_that_disappeared_between_analysis_and_start_is_refused(
        self, client
    ):
        """The snapshot names a folder; nothing stops it being moved in between."""
        http, db, drive_dir, _ = client
        _seed_markdown(
            db, drive_dir, file_id="notescope001", path="recipes/note.md",
            content="![](https://images.example.com/a.jpg)\n",
        )
        analysis = _analyse(http, folder_path="recipes")
        (drive_dir / "recipes" / "note.md").unlink()
        (drive_dir / "recipes").rmdir()

        response = http.post(
            "/api/admin/markdown-images/imports",
            json={
                "analysis_id": analysis["analysis_id"],
                "allowed_hosts": ["images.example.com"],
            },
        )

        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "scope_invalid"

    def test_an_empty_allowed_hosts_list_is_refused_by_both_layers(self, client):
        """An empty set is not "everything", and it is a subset of anything, so
        `requested.issubset(...)` on its own would accept it.

        The schema stops it at the HTTP edge, so the service-side guard is
        checked directly rather than through a request that cannot reach it.
        """
        http, db, drive_dir, _ = client
        _seed_markdown(
            db, drive_dir, file_id="notenohosts1", path="note.md",
            content="![](https://images.example.com/a.jpg)\n",
        )
        analysis = _analyse(http)

        response = http.post(
            "/api/admin/markdown-images/imports",
            json={"analysis_id": analysis["analysis_id"], "allowed_hosts": []},
        )
        assert response.status_code == 422

        with pytest.raises(ValueError, match="allowed_hosts_invalid"):
            importer.start_import(analysis["analysis_id"], [])

    def test_only_the_approved_hosts_are_fetched(self, client, monkeypatch):
        """Approval is per host and the candidate list spans several, so the
        filter is what keeps an unapproved origin from being contacted."""
        http, db, drive_dir, _ = client
        fetched = []

        def fetch(url):
            fetched.append(url)
            return _normalized_jpeg()

        monkeypatch.setattr(importer, "fetch_and_normalize_image", fetch)
        _seed_markdown(
            db, drive_dir, file_id="noteapprove1", path="yes.md",
            content="![](https://images.example.com/a.jpg)\n",
        )
        _seed_markdown(
            db, drive_dir, file_id="noteapprove2", path="no.md",
            content="![](https://other.example.net/b.jpg)\n",
        )
        analysis = _analyse(http)
        assert analysis["counts"]["external_https_candidate"] == 2

        job = _run_to_completion(http, analysis["analysis_id"])

        assert fetched == ["https://images.example.com/a.jpg"]
        assert (job["total"], job["succeeded"]) == (1, 1)
        assert (drive_dir / "no.md").read_text(encoding="utf-8") == (
            "![](https://other.example.net/b.jpg)\n"
        )
