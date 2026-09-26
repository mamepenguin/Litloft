# PR-1 invariants (R-0, approved by the user 2026-09-26)

1. A hostile EPUB (bad XML, DOCTYPE in any encoding, missing cover, `..` / percent-encoded / absolute escape in the OPF path or the cover href, oversized or deflate-bomb entry, SVG / BMP / non-raster or >40 Mpx cover, corrupt zip) yields no thumbnail and raises nothing out of the generator.
2. No byte of an EPUB is passed to ffmpeg / ffprobe (subprocess).
3. Thumbnail generation does not change the EPUB's bytes, nor the row's state columns (missing_since / deleted_at).
4. `.epub` is not readable through GET /api/internal/files/{id}/content and not writable through PUT /api/files/{id}/content.
5. Reads from the zip are bounded on decompressed bytes: container / OPF 1 MB, cover 10 MB.
6. Existing zip archive browsing (Shift_JIS entry names) behaves as before the decoder moved.
