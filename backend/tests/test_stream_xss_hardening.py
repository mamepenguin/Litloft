"""RED-phase tests for the streaming-endpoint XSS hardening follow-up.

Spec: ``docs/superpowers/specs/2026-05-09-stream-xss-hardening.md``

Contract under test (spec §3):

1. All ``GET /api/files/{id}/stream`` responses include
   ``X-Content-Type-Options: nosniff``.
2. Responses for the *dangerous-inline* mime set (``text/html``,
   ``application/xhtml+xml``, ``image/svg+xml``, ``text/xml``,
   ``application/xml``) include ``Content-Disposition: attachment;
   filename*=UTF-8''<filename>`` regardless of ``?download=`` —
   browsers must download instead of rendering inline.
3. Safe mimes (image/jpeg, video/mp4, text/markdown, application/pdf,
   etc.) keep their existing inline behaviour but still gain the
   ``nosniff`` header.
4. The original ``Content-Type`` header is preserved (browsers still
   know the underlying mime; we only block inline rendering).
5. All three response paths (Range / small-text / full stream) follow
   the same rule.

These tests are written *before* implementation lands and are expected
to fail (RED) until ``stream_file`` is updated.
"""

from pathlib import Path

from tests.conftest import TEST_DRIVE


def _create_file(
    db,
    drive_dir: Path,
    *,
    filename: str,
    mime_type: str,
    file_type: str,
    body: bytes = b"hello world",
):
    """Create a File row + on-disk content. Returns the persisted File."""
    path = drive_dir / filename
    path.write_bytes(body)

    from app.models import File

    file = File(
        filename=filename,
        title=Path(filename).stem,
        drive=TEST_DRIVE,
        folder_path="",
        file_path=filename,
        file_size=path.stat().st_size,
        file_type=file_type,
        mime_type=mime_type,
    )
    db.add(file)
    db.commit()
    db.refresh(file)
    return file


def _assert_attachment(headers, filename: str):
    disposition = headers.get("content-disposition", "")
    assert disposition.startswith("attachment; filename*=UTF-8''"), (
        f"expected attachment Content-Disposition, got: {disposition!r}"
    )
    # The filename* param is RFC 5987 percent-encoded; just spot-check
    # that the stem is recognisable rather than depending on exact
    # encoding of every character.
    assert Path(filename).stem in disposition or filename in disposition


def _assert_no_attachment(headers):
    disposition = headers.get("content-disposition", "")
    assert "attachment" not in disposition.lower(), (
        f"unexpected attachment Content-Disposition: {disposition!r}"
    )


def _assert_nosniff(headers):
    nosniff = headers.get("x-content-type-options", "")
    assert nosniff.lower() == "nosniff", (
        f"expected X-Content-Type-Options: nosniff, got: {nosniff!r}"
    )


# --- Dangerous mimes: must always be attachment + nosniff -------------------


class TestDangerousMimesGetAttachmentAndNosniff:
    def test_stream_html_has_attachment_and_nosniff(self, client):
        c, db, drive_dir, _ = client
        file = _create_file(
            db, drive_dir,
            filename="evil.html",
            mime_type="text/html",
            file_type="document",
            body=b"<script>alert(1)</script>",
        )
        res = c.get(f"/api/files/{file.id}/stream")
        assert res.status_code == 200
        _assert_attachment(res.headers, "evil.html")
        _assert_nosniff(res.headers)
        # Underlying mime is preserved — browsers know it's HTML, just
        # not allowed to render it inline.
        assert res.headers["content-type"] == "text/html"

    def test_stream_xhtml_has_attachment_and_nosniff(self, client):
        c, db, drive_dir, _ = client
        file = _create_file(
            db, drive_dir,
            filename="page.xhtml",
            mime_type="application/xhtml+xml",
            file_type="document",
            body=b"<html><body>x</body></html>",
        )
        res = c.get(f"/api/files/{file.id}/stream")
        assert res.status_code == 200
        _assert_attachment(res.headers, "page.xhtml")
        _assert_nosniff(res.headers)
        assert res.headers["content-type"] == "application/xhtml+xml"

    def test_stream_svg_has_attachment_and_nosniff(self, client):
        c, db, drive_dir, _ = client
        file = _create_file(
            db, drive_dir,
            filename="logo.svg",
            mime_type="image/svg+xml",
            file_type="image",
            body=b"<svg xmlns='http://www.w3.org/2000/svg'></svg>",
        )
        res = c.get(f"/api/files/{file.id}/stream")
        assert res.status_code == 200
        _assert_attachment(res.headers, "logo.svg")
        _assert_nosniff(res.headers)
        assert res.headers["content-type"] == "image/svg+xml"

    def test_stream_xml_application_has_attachment_and_nosniff(self, client):
        c, db, drive_dir, _ = client
        file = _create_file(
            db, drive_dir,
            filename="data.xml",
            mime_type="application/xml",
            file_type="document",
            body=b"<?xml version='1.0'?><root/>",
        )
        res = c.get(f"/api/files/{file.id}/stream")
        assert res.status_code == 200
        _assert_attachment(res.headers, "data.xml")
        _assert_nosniff(res.headers)
        assert res.headers["content-type"] == "application/xml"

    def test_stream_xml_text_has_attachment_and_nosniff(self, client):
        """Pin the other XML mime variant (``text/xml``) — both forms
        appear in the wild depending on platform mimetypes DB."""
        c, db, drive_dir, _ = client
        file = _create_file(
            db, drive_dir,
            filename="data2.xml",
            mime_type="text/xml",
            file_type="document",
            body=b"<?xml version='1.0'?><root/>",
        )
        res = c.get(f"/api/files/{file.id}/stream")
        assert res.status_code == 200
        _assert_attachment(res.headers, "data2.xml")
        _assert_nosniff(res.headers)
        assert res.headers["content-type"] == "text/xml"

    def test_stream_xslt_has_attachment_and_nosniff(self, client):
        """XSLT explicitly listed as a threat in spec §2 (XSLT injection)."""
        c, db, drive_dir, _ = client
        file = _create_file(
            db, drive_dir,
            filename="transform.xsl",
            mime_type="application/xslt+xml",
            file_type="document",
            body=b"<?xml version='1.0'?><xsl:stylesheet/>",
        )
        res = c.get(f"/api/files/{file.id}/stream")
        assert res.status_code == 200
        _assert_attachment(res.headers, "transform.xsl")
        _assert_nosniff(res.headers)
        assert res.headers["content-type"] == "application/xslt+xml"


# --- Safe mimes: nosniff yes, attachment no ---------------------------------


class TestSafeMimesGetNosniffOnly:
    def test_stream_image_jpeg_only_nosniff(self, client):
        c, db, drive_dir, _ = client
        file = _create_file(
            db, drive_dir,
            filename="photo.jpg",
            mime_type="image/jpeg",
            file_type="image",
            body=b"\xff\xd8\xff\xe0fakejpegbytes",
        )
        res = c.get(f"/api/files/{file.id}/stream")
        assert res.status_code == 200
        _assert_nosniff(res.headers)
        _assert_no_attachment(res.headers)
        assert res.headers["content-type"] == "image/jpeg"

    def test_stream_video_mp4_only_nosniff(self, client):
        c, db, drive_dir, _ = client
        file = _create_file(
            db, drive_dir,
            filename="clip.mp4",
            mime_type="video/mp4",
            file_type="video",
            body=b"fakemp4bytes",
        )
        res = c.get(f"/api/files/{file.id}/stream")
        assert res.status_code == 200
        _assert_nosniff(res.headers)
        _assert_no_attachment(res.headers)
        assert res.headers["content-type"] == "video/mp4"

    def test_stream_text_markdown_only_nosniff(self, client):
        """Markdown hits the small-text path. nosniff must still apply
        and ETag must be preserved."""
        c, db, drive_dir, _ = client
        body = b"# hello\nworld\n"
        file = _create_file(
            db, drive_dir,
            filename="note.md",
            mime_type="text/markdown",
            file_type="document",
            body=body,
        )
        res = c.get(f"/api/files/{file.id}/stream")
        assert res.status_code == 200
        _assert_nosniff(res.headers)
        _assert_no_attachment(res.headers)
        assert res.headers["content-type"] == "text/markdown"
        # Regression guard: small-text path must still emit ETag.
        assert "etag" in res.headers, (
            "small-text path lost ETag header during hardening"
        )

    def test_stream_pdf_only_nosniff(self, client):
        c, db, drive_dir, _ = client
        file = _create_file(
            db, drive_dir,
            filename="doc.pdf",
            mime_type="application/pdf",
            file_type="document",
            body=b"%PDF-1.4\n%fake",
        )
        res = c.get(f"/api/files/{file.id}/stream")
        assert res.status_code == 200
        _assert_nosniff(res.headers)
        _assert_no_attachment(res.headers)
        assert res.headers["content-type"] == "application/pdf"


# --- Cross-path coverage: Range, small-text, ?download=true -----------------


class TestHardeningAcrossAllResponsePaths:
    def test_stream_dangerous_mime_with_range_header(self, client):
        """Range requests (206 path) must also attach + nosniff for
        dangerous mimes."""
        c, db, drive_dir, _ = client
        file = _create_file(
            db, drive_dir,
            filename="evil2.html",
            mime_type="text/html",
            file_type="document",
            # Body must be long enough to satisfy Range bytes=0-100
            body=b"x" * 1024,
        )
        res = c.get(
            f"/api/files/{file.id}/stream",
            headers={"Range": "bytes=0-100"},
        )
        assert res.status_code == 206
        _assert_attachment(res.headers, "evil2.html")
        _assert_nosniff(res.headers)
        assert res.headers["content-type"] == "text/html"

    def test_stream_dangerous_mime_small_text_path_via_markdown(self, client):
        """The small-text branch (markdown / plain text under 1 MB)
        must also emit nosniff. Markdown is not dangerous so attachment
        is *not* expected here — this case pins the nosniff coverage on
        the ETag-emitting branch.
        """
        c, db, drive_dir, _ = client
        file = _create_file(
            db, drive_dir,
            filename="small.md",
            mime_type="text/markdown",
            file_type="document",
            body=b"hello",
        )
        res = c.get(f"/api/files/{file.id}/stream")
        assert res.status_code == 200
        _assert_nosniff(res.headers)
        _assert_no_attachment(res.headers)
        # Sanity: small-text path is the one that emits ETag.
        assert "etag" in res.headers

    def test_stream_download_true_forces_attachment_for_safe_mimes(self, client):
        """``?download=true`` keeps its existing semantics: attachment
        on every mime, plus the new nosniff."""
        c, db, drive_dir, _ = client
        file = _create_file(
            db, drive_dir,
            filename="photo2.jpg",
            mime_type="image/jpeg",
            file_type="image",
            body=b"\xff\xd8\xff\xe0fakejpegbytes",
        )
        res = c.get(f"/api/files/{file.id}/stream?download=true")
        assert res.status_code == 200
        _assert_attachment(res.headers, "photo2.jpg")
        _assert_nosniff(res.headers)
        assert res.headers["content-type"] == "image/jpeg"
