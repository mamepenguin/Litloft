from pathlib import Path
import hashlib

from app.models import File
from app.services.markdown_images import (
    FirstMarkdownImage,
    find_first_markdown_image,
    project_markdown_thumbnail,
    replace_image_destination,
)
from app.services.fileops import copy_file
from app.services.scanner import _scan_and_register


def test_finds_first_inline_external_image_with_source_span():
    content = '# Recipe\n\n![dish](https://cdn.example/food_(1).jpg "hero")\n'
    destination = "https://cdn.example/food_(1).jpg"
    destination_start = content.index(destination)

    image = find_first_markdown_image(content)

    assert image == FirstMarkdownImage(
        syntax="inline",
        url=destination,
        destination_start=destination_start,
        destination_end=destination_start + len(destination),
    )
    assert replace_image_destination(content, image, "loft://abc123def456") == (
        '# Recipe\n\n![dish](loft://abc123def456 "hero")\n'
    )


def test_ignores_frontmatter_code_fences_inline_code_and_html_comments():
    content = """---
cover: "![not-an-image](https://example/frontmatter.jpg)"
---

`![inline-code](https://example/code.jpg)`

```markdown
![fenced](https://example/fenced.jpg)
```

<!-- ![comment](https://example/comment.jpg) -->

![real](loft://abc123def456)
"""

    image = find_first_markdown_image(content)

    assert image is not None
    assert image.syntax == "inline"
    assert image.url == "loft://abc123def456"


def test_reference_style_before_inline_is_reported_as_unsupported():
    content = "![first][hero]\n\n![second](https://example/second.jpg)\n"

    image = find_first_markdown_image(content)

    assert image is not None
    assert image.syntax == "reference"
    assert image.url is None
    assert image.destination_start is None
    assert image.destination_end is None


def test_raw_html_before_inline_is_reported_as_unsupported():
    content = '<img src="https://example/first.jpg">\n\n![second](https://example/second.jpg)\n'

    image = find_first_markdown_image(content)

    assert image is not None
    assert image.syntax == "html"
    assert image.url is None


def _seed_file(
    db,
    *,
    file_id: str,
    filename: str,
    file_path: str,
    file_type: str,
    mime_type: str,
    thumbnail_path: str | None = None,
    drive: str = "test-drive",
) -> File:
    row = File(
        id=file_id,
        filename=filename,
        title=Path(filename).stem,
        drive=drive,
        folder_path=str(Path(file_path).parent).replace(".", ""),
        file_path=file_path,
        file_size=1,
        file_type=file_type,
        mime_type=mime_type,
        thumbnail_path=thumbnail_path,
    )
    db.add(row)
    db.flush()
    return row


def test_projects_independent_thumbnail_from_same_drive_loft_image(client):
    _, db, drive_dir, data_dir = client
    image_path = drive_dir / "photos" / "dish.jpg"
    image_path.parent.mkdir(parents=True)
    image_path.write_bytes(b"source image")

    source_thumb_rel = "test-drive/photos/dish.jpg"
    source_thumb = data_dir / "thumbnails" / source_thumb_rel
    source_thumb.parent.mkdir(parents=True)
    source_thumb.write_bytes(b"thumbnail bytes")

    source = _seed_file(
        db,
        file_id="img123def456",
        filename="dish.jpg",
        file_path="photos/dish.jpg",
        file_type="image",
        mime_type="image/jpeg",
        thumbnail_path=source_thumb_rel,
    )
    note = _seed_file(
        db,
        file_id="note123def45",
        filename="recipe.md",
        file_path="recipe.md",
        file_type="document",
        mime_type="text/markdown",
    )

    changed = project_markdown_thumbnail(
        db, note, "# Recipe\n\n![dish](loft://img123def456)\n"
    )

    assert changed is True
    assert note.thumbnail_path == (
        "test-drive/.markdown/note123def45-img123def456.jpg"
    )
    assert note.thumbnail_path != source.thumbnail_path
    assert (data_dir / "thumbnails" / note.thumbnail_path).read_bytes() == b"thumbnail bytes"


def test_projection_clears_stale_thumbnail_when_first_image_is_external(client):
    _, db, _, data_dir = client
    old_rel = "test-drive/.markdown/note123def45-img123def456.jpg"
    old_path = data_dir / "thumbnails" / old_rel
    old_path.parent.mkdir(parents=True)
    old_path.write_bytes(b"old")
    note = _seed_file(
        db,
        file_id="note123def45",
        filename="recipe.md",
        file_path="recipe.md",
        file_type="document",
        mime_type="text/markdown",
        thumbnail_path=old_rel,
    )

    changed = project_markdown_thumbnail(
        db, note, "![dish](https://cdn.example/dish.jpg)\n"
    )

    assert changed is True
    assert note.thumbnail_path is None
    assert not old_path.exists()


def test_projection_rejects_cross_drive_reference(client):
    _, db, _, _ = client
    _seed_file(
        db,
        file_id="img123def456",
        filename="dish.jpg",
        file_path="dish.jpg",
        file_type="image",
        mime_type="image/jpeg",
        drive="other-drive",
    )
    note = _seed_file(
        db,
        file_id="note123def45",
        filename="recipe.md",
        file_path="recipe.md",
        file_type="document",
        mime_type="text/markdown",
    )

    changed = project_markdown_thumbnail(
        db, note, "![dish](loft://img123def456)\n"
    )

    assert changed is False
    assert note.thumbnail_path is None


def test_content_put_projects_markdown_thumbnail(client):
    api, db, drive_dir, data_dir = client
    image_path = drive_dir / "photos" / "dish.jpg"
    image_path.parent.mkdir(parents=True)
    image_path.write_bytes(b"source image")
    source_thumb_rel = "test-drive/photos/dish.jpg"
    source_thumb = data_dir / "thumbnails" / source_thumb_rel
    source_thumb.parent.mkdir(parents=True)
    source_thumb.write_bytes(b"thumbnail bytes")
    _seed_file(
        db,
        file_id="img123def456",
        filename="dish.jpg",
        file_path="photos/dish.jpg",
        file_type="image",
        mime_type="image/jpeg",
        thumbnail_path=source_thumb_rel,
    )
    note_path = drive_dir / "recipe.md"
    note_path.write_text("initial\n")
    note = _seed_file(
        db,
        file_id="note123def45",
        filename="recipe.md",
        file_path="recipe.md",
        file_type="document",
        mime_type="text/markdown",
    )
    db.commit()
    new_content = "# Recipe\n\n![dish](loft://img123def456)\n"
    current_etag = hashlib.sha256(b"initial\n").hexdigest()

    response = api.put(
        f"/api/files/{note.id}/content",
        content=new_content.encode(),
        headers={
            "Content-Type": "text/plain; charset=utf-8",
            "If-Match": f'"{current_etag}"',
        },
    )

    assert response.status_code == 200, response.text
    db.expire_all()
    updated = db.get(File, note.id)
    assert updated.thumbnail_path == (
        "test-drive/.markdown/note123def45-img123def456.jpg"
    )


def test_scanner_backfills_markdown_thumbnail(client):
    _, db, drive_dir, data_dir = client
    image_path = drive_dir / "photos" / "dish.jpg"
    image_path.parent.mkdir(parents=True)
    image_path.write_bytes(b"source image")
    note_path = drive_dir / "recipe.md"
    note_path.write_text("![dish](loft://img123def456)\n")
    source_thumb_rel = "test-drive/photos/dish.jpg"
    source_thumb = data_dir / "thumbnails" / source_thumb_rel
    source_thumb.parent.mkdir(parents=True)
    source_thumb.write_bytes(b"thumbnail bytes")
    _seed_file(
        db,
        file_id="img123def456",
        filename="dish.jpg",
        file_path="photos/dish.jpg",
        file_type="image",
        mime_type="image/jpeg",
        thumbnail_path=source_thumb_rel,
    )
    note = _seed_file(
        db,
        file_id="note123def45",
        filename="recipe.md",
        file_path="recipe.md",
        file_type="document",
        mime_type="text/markdown",
    )
    db.commit()

    _scan_and_register(db, "test-drive")

    db.refresh(note)
    assert note.thumbnail_path == (
        "test-drive/.markdown/note123def45-img123def456.jpg"
    )


def test_copy_projects_a_new_markdown_owned_thumbnail(client):
    _, db, drive_dir, data_dir = client
    image_path = drive_dir / "photos" / "dish.jpg"
    image_path.parent.mkdir(parents=True)
    image_path.write_bytes(b"source image")
    note_path = drive_dir / "recipe.md"
    content = "![dish](loft://img123def456)\n"
    note_path.write_text(content)
    source_thumb_rel = "test-drive/photos/dish.jpg"
    source_thumb = data_dir / "thumbnails" / source_thumb_rel
    source_thumb.parent.mkdir(parents=True)
    source_thumb.write_bytes(b"thumbnail bytes")
    _seed_file(
        db,
        file_id="img123def456",
        filename="dish.jpg",
        file_path="photos/dish.jpg",
        file_type="image",
        mime_type="image/jpeg",
        thumbnail_path=source_thumb_rel,
    )
    note = _seed_file(
        db,
        file_id="note123def45",
        filename="recipe.md",
        file_path="recipe.md",
        file_type="document",
        mime_type="text/markdown",
    )
    project_markdown_thumbnail(db, note, content)
    db.commit()

    copied = copy_file(db, note.id, None, "copies")

    assert copied.thumbnail_path == (
        f"test-drive/.markdown/{copied.id}-img123def456.jpg"
    )
    assert copied.thumbnail_path != note.thumbnail_path
    assert (data_dir / "thumbnails" / copied.thumbnail_path).read_bytes() == (
        b"thumbnail bytes"
    )
    assert (data_dir / "thumbnails" / note.thumbnail_path).exists()
