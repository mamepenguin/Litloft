import io
import time

import pytest
from fastapi import HTTPException
from PIL import Image

from app.auth import require_admin
from app.main import app
from app.models import File, FileRelation, FileVersion
from app.services import markdown_image_import as importer
from app.services.safe_image_fetch import NormalizedImage


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
