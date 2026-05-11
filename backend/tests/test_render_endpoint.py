"""Tests for the HTML render endpoint.

Spec: ``docs/superpowers/specs/2026-05-11-html-preview.md``

Contract:

1. ``GET /api/files/{id}/render`` returns 200 for text/html files with
   ``Content-Type: text/html; charset=utf-8``, ``Content-Disposition:
   inline``, ``X-Content-Type-Options: nosniff``, and a strict
   Content-Security-Policy header containing the spec-mandated
   directives (sandbox, default-src 'none', form-action 'none',
   connect-src 'none', allowlisted CDN script/style sources).
2. Non-HTML mimes return 404 (the endpoint is HTML-only by design).
3. Missing files return 410 (consistent with ``/stream``).
4. Files larger than the 5 MB cap return 413.
5. Non-UTF-8 bodies return 415 (Phase 1 limitation, documented).
6. The bootstrap script is injected before ``</body>`` when present
   (case-insensitive), otherwise appended.
7. The ``/stream`` endpoint continues to force attachment for
   text/html — the render path must not change stream behaviour.
"""

from pathlib import Path

from tests.conftest import TEST_DRIVE


def _create_html_file(
    db,
    drive_dir: Path,
    *,
    filename: str = "page.html",
    mime_type: str = "text/html",
    body: bytes = b"<!doctype html><html><body><h1>hi</h1></body></html>",
):
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
        file_type="document",
        mime_type=mime_type,
    )
    db.add(file)
    db.commit()
    db.refresh(file)
    return file


class TestRenderSuccess:
    def test_returns_html_with_inline_disposition(self, client):
        c, db, drive_dir, _ = client
        file = _create_html_file(db, drive_dir)
        res = c.get(f"/api/files/{file.id}/render")
        assert res.status_code == 200
        assert res.headers["content-type"] == "text/html; charset=utf-8"
        assert res.headers["content-disposition"] == "inline"

    def test_includes_nosniff(self, client):
        c, db, drive_dir, _ = client
        file = _create_html_file(db, drive_dir)
        res = c.get(f"/api/files/{file.id}/render")
        assert res.headers.get("x-content-type-options", "").lower() == "nosniff"

    def test_csp_has_required_directives(self, client):
        c, db, drive_dir, _ = client
        file = _create_html_file(db, drive_dir)
        res = c.get(f"/api/files/{file.id}/render")
        csp = res.headers["content-security-policy"]
        # The sandbox directive must allow scripts — otherwise even the
        # bootstrap resize script (let alone the artifact's own JS)
        # cannot run, which defeats the whole point of HTML preview.
        assert "sandbox allow-scripts" in csp
        # allow-same-origin must NOT be present, or the iframe would be
        # able to read parent cookies / localStorage despite the sandbox.
        assert "allow-same-origin" not in csp
        assert "default-src 'none'" in csp
        assert "form-action 'none'" in csp
        assert "connect-src 'none'" in csp
        assert "frame-ancestors 'self'" in csp

    def test_csp_allows_main_cdn_scripts(self, client):
        c, db, drive_dir, _ = client
        file = _create_html_file(db, drive_dir)
        res = c.get(f"/api/files/{file.id}/render")
        csp = res.headers["content-security-policy"]
        assert "https://cdn.jsdelivr.net" in csp
        assert "https://unpkg.com" in csp
        assert "https://esm.sh" in csp
        assert "https://cdnjs.cloudflare.com" in csp
        assert "https://cdn.tailwindcss.com" in csp

    def test_csp_allows_google_fonts(self, client):
        c, db, drive_dir, _ = client
        file = _create_html_file(db, drive_dir)
        res = c.get(f"/api/files/{file.id}/render")
        csp = res.headers["content-security-policy"]
        assert "https://fonts.googleapis.com" in csp
        assert "https://fonts.gstatic.com" in csp

    def test_body_contains_original_content(self, client):
        c, db, drive_dir, _ = client
        file = _create_html_file(
            db, drive_dir,
            body=b"<!doctype html><html><body><h1>marker</h1></body></html>",
        )
        res = c.get(f"/api/files/{file.id}/render")
        assert b"<h1>marker</h1>" in res.content


class TestBootstrapInjection:
    def test_injected_before_body_close(self, client):
        c, db, drive_dir, _ = client
        file = _create_html_file(
            db, drive_dir,
            body=b"<!doctype html><html><body><p>x</p></body></html>",
        )
        res = c.get(f"/api/files/{file.id}/render")
        assert b"litloft:height" in res.content
        # The bootstrap must land before </body> so it executes after the
        # document parses but inside body context.
        idx_boot = res.content.index(b"litloft:height")
        idx_close = res.content.index(b"</body>")
        assert idx_boot < idx_close

    def test_injected_before_uppercase_body_close(self, client):
        c, db, drive_dir, _ = client
        file = _create_html_file(
            db, drive_dir,
            body=b"<!DOCTYPE html><HTML><BODY><P>x</P></BODY></HTML>",
        )
        res = c.get(f"/api/files/{file.id}/render")
        assert b"litloft:height" in res.content
        idx_boot = res.content.index(b"litloft:height")
        idx_close = res.content.lower().index(b"</body>")
        assert idx_boot < idx_close

    def test_appended_when_no_body_close(self, client):
        c, db, drive_dir, _ = client
        file = _create_html_file(
            db, drive_dir,
            body=b"<h1>fragment with no body tag</h1>",
        )
        res = c.get(f"/api/files/{file.id}/render")
        assert b"litloft:height" in res.content

    def test_fullscreen_hash_check_present(self, client):
        c, db, drive_dir, _ = client
        file = _create_html_file(db, drive_dir)
        res = c.get(f"/api/files/{file.id}/render")
        # Bootstrap must check location.hash so fullscreen mode skips
        # the resize reporting loop.
        assert b"litloft-fullscreen" in res.content


class TestRenderRejections:
    def test_non_html_mime_returns_404(self, client):
        c, db, drive_dir, _ = client
        file = _create_html_file(
            db, drive_dir,
            filename="note.md",
            mime_type="text/markdown",
            body=b"# hi\n",
        )
        res = c.get(f"/api/files/{file.id}/render")
        assert res.status_code == 404

    def test_image_mime_returns_404(self, client):
        c, db, drive_dir, _ = client
        file = _create_html_file(
            db, drive_dir,
            filename="pic.jpg",
            mime_type="image/jpeg",
            body=b"\xff\xd8\xff fake jpeg",
        )
        res = c.get(f"/api/files/{file.id}/render")
        assert res.status_code == 404

    def test_unknown_file_id_returns_404(self, client):
        c, db, drive_dir, _ = client
        res = c.get("/api/files/zzNOTFOUNDzz/render")
        assert res.status_code == 404

    def test_non_utf8_returns_415(self, client):
        c, db, drive_dir, _ = client
        # Shift-JIS bytes that are not valid UTF-8.
        body = "<html><body>日本語</body></html>".encode("shift_jis")
        file = _create_html_file(db, drive_dir, body=body)
        res = c.get(f"/api/files/{file.id}/render")
        assert res.status_code == 415

    def test_oversized_returns_413(self, client):
        c, db, drive_dir, _ = client
        # Just over 5 MB (the _RENDER_MAX_BYTES cap).
        body = b"<html><body>" + (b"x" * (5 * 1024 * 1024 + 1)) + b"</body></html>"
        file = _create_html_file(db, drive_dir, body=body)
        res = c.get(f"/api/files/{file.id}/render")
        assert res.status_code == 413


class TestStreamRegression:
    """The /render endpoint must not affect /stream's attachment forcing."""

    def test_stream_still_returns_attachment_for_html(self, client):
        c, db, drive_dir, _ = client
        file = _create_html_file(db, drive_dir, filename="evil.html")
        res = c.get(f"/api/files/{file.id}/stream")
        assert res.status_code == 200
        disposition = res.headers.get("content-disposition", "")
        assert disposition.startswith("attachment;")
