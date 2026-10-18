# Transparent pictures show the surface behind them

SPEC-ID: SPEC-CORE-006
SPEC-ID: SPEC-CORE-007

Approval:

## Summary

A picture with transparent regions (a PNG logo, a GIF with a transparent palette entry, a
WebP with alpha) is drawn with its transparent pixels filled by whatever RGB the file
happens to store there, usually black. Two causes, measured on 2026-10-18:

- Image thumbnails are written as JPEG by ffmpeg (`generate_image_thumbnail`), and ffmpeg
  drops the alpha channel when it converts, so a pixel stored as `(0,0,0,0)` comes out
  `(0,0,0)` and one stored as `(255,255,255,0)` comes out `(255,255,255)`.
- The file detail's `ImageCanvas` paints that JPEG thumbnail as a `background-image` under
  the full picture so something is on screen while the full one decodes, and leaves it
  there afterwards. The full picture's transparent pixels show the JPEG through them.

After this change the transparent regions show the surface the thumbnail or picture sits
on, and follow the light/dark theme: `bg-bg-elevated` on listing cards and justified-grid
cells, `bg-bg-card` on the file detail canvas, and each other thumbnail surface's own
container colour. This is the surrounding surface, not the page background; the user
accepted the surface colour.

- **SPEC-CORE-006**: a picture whose source carries transparency gets a WebP thumbnail with
  alpha; every other picture keeps its JPEG thumbnail. The thumbnail endpoint labels each
  response with the format of its bytes. Existing JPEG thumbnails of transparent pictures
  are replaced as scans walk the drive.
- **SPEC-CORE-007**: `ImageCanvas` stops painting the thumbnail under the full picture once
  the full picture has decoded.

For the single viewer of the personal library, who sees black blocks around logos and
icons today.

## Definitions

- **Carries transparency**: Pillow opens the source (header only) and either its mode has
  an alpha band (`RGBA`, `LA`, `PA`, `RGBa`, `La`) or its `info` has a `transparency` entry.
  A source Pillow cannot open does not carry transparency. Measured in the backend image
  (Pillow 11.2.1): RGBA PNG, palette PNG with tRNS, GIF with a transparent index, WebP with
  alpha, RGBA TIFF and ICO carry transparency; an RGB PNG does not; AVIF cannot be opened
  and so never does.
- **Opaque source**: one that does not carry transparency. An RGBA picture whose pixels are
  all fully opaque (a typical screenshot) still carries transparency by this definition.

## Required items

### 1. Normal flow

**Generating a picture thumbnail (SPEC-CORE-006).** The non-HEIC picture generator
(`generate_image_thumbnail`) makes the format choice for every caller:

1. Opaque source: ffmpeg writes the JPEG exactly as today (same arguments, `-q:v 2`).
2. Source that carries transparency: ffmpeg writes a WebP with alpha using the same input
   and scale filter, one frame, and these output options set explicitly:
   `-f webp -c:v libwebp -pix_fmt yuva420p -quality 85`. `-f webp` is required because the
   output path ends in `.jpg` and ffmpeg otherwise infers JPEG from the extension;
   `-quality` is set because ffmpeg's `-q:v 2` means quality 2 to libwebp. Measured in the
   backend image: libwebp is present, and the output starts `RIFF....WEBP` with alpha 0
   preserved for every format listed under Definitions.
3. If the WebP write fails, the generator writes the JPEG as in step 1 and returns its
   result. A transparent picture never ends up with no thumbnail where it had one before
   this change.
4. The bytes go to the same cache slot as today, `path_thumbnail_rel(...)`, which ends in
   `.jpg`. The path is not renamed (see Checked, no action).

The callers that run the generator, all unchanged in code: new-file registration
(`scanner.py`, both the per-file path and the scan's pass-2 registration), the scan's
relocate branch when the old thumbnail is missing, an upload that creates or revives a
record (`upload.py`), and the Markdown projection's fallback when its source has no
thumbnail (`markdown_images.py`).

**Serving (SPEC-CORE-006).** `GET /api/files/{id}/thumbnail` reads the first 12 bytes of
the file it is about to send and sets `Content-Type` from them: `RIFF????WEBP` →
`image/webp`; `89 50 4E 47 0D 0A 1A 0A` → `image/png`; anything else (JPEG, the
placeholder, a file shorter than the signature) → `image/jpeg`, as today. ETag,
`Last-Modified`, `Cache-Control: no-cache`, `304` handling and the placeholder fallback
are unchanged.

**Replacing existing thumbnails (SPEC-CORE-006).** In the scan's existing-file branch,
where the letterbox migration runs today (rows whose source is on disk, trashed rows
included, as the letterbox migration does), a picture whose expected thumbnail exists is
regenerated when all of these hold:

1. its mime type is not `image/jpeg` and it is not HEIC (`is_heic_file` false);
2. its stored thumbnail begins with the JPEG signature (`FF D8 FF`);
3. the source carries transparency.

The checks run in that order, so a stored WebP stops at check 2 and its source is not
opened. This check runs **before** the letterbox check; when it regenerates, the
letterbox check is skipped for that row in that scan (the new thumbnail is already
unpadded). A successful regeneration sets `needs_update = True`, as the letterbox
migration does, so it is counted in `updated` and logged as `Updated file: ...`. A failed
one leaves the stored JPEG (`write_thumbnail_atomically` renames only on success) and
`thumbnail_path` unchanged; with the step-3 fallback the stored bytes are then a fresh
JPEG, and the next scan tries again.

**Detail canvas (SPEC-CORE-007).** `ImageCanvas` keeps the thumbnail as a background on
the span while `decoded` is false. When the full picture fires `onLoad` (or is already
complete when the effect runs), `decoded` becomes true and the span carries no
`background-image`. The outer box keeps `bg-bg-card`, so transparent pixels show it.
Switching to another file resets `decoded` to false, so the next file's thumbnail is
painted again until its own picture decodes.

### 2. Failure cases

- Pillow cannot open the source: opaque; the JPEG path runs as today.
- ffmpeg fails to write the WebP: fallback to JPEG (step 3). If the JPEG also fails, the
  generator returns false, exactly as a failed JPEG does today.
- The migration's regeneration produces JPEG through the fallback: the row keeps a JPEG,
  and every later scan retries it (one ffmpeg WebP attempt plus one JPEG per scan for that
  file) and logs the WebP failure at warning level.
- The thumbnail file is shorter than a signature: served as `image/jpeg`.
- The full picture never decodes (network failure, unsupported format): the thumbnail stays
  painted under it, as today.

### 3. States

A picture's stored thumbnail is in one of: none; JPEG; WebP-with-alpha. Every path that
runs the generator chooses the format afresh from the source at that moment:

| Path | Possible transition |
|---|---|
| New-file registration (per-file, pass 2), upload create/revive | none → JPEG or WebP; any → none on total failure, as today |
| Scan relocate with old thumbnail missing | any → JPEG or WebP (from the current source) |
| Scan migration (this spec) | JPEG → WebP only |
| Letterbox migration | JPEG → JPEG (opaque source), or JPEG → WebP if it regenerates a transparent source whose migration did not run first (cannot happen: the migration runs first) |
| Markdown projection | copies the source's bytes, whatever their format |

Not allowed: the scan never turns a stored WebP into JPEG on its own, even if the source
at that path has become opaque; a rename/move that carries an existing thumbnail file
never re-encodes it.

`ImageCanvas`: `decoded=false` (thumbnail painted under the picture) → `decoded=true`
(no background on the span) on load; back to `false` on a file change.

### 4. Data read and written

- `data/thumbnails/**` — read (signature check, serving) and written (generation,
  migration). Same paths as today.
- Source picture files on the drives — read (Pillow header, ffmpeg). Never written.
- `files.thumbnail_path` — unchanged in shape; written only where it is today.
- No table, column or migration is added.

### 5. External services

ffmpeg (local subprocess, 30 s timeout per run as today) and Pillow (in process). No
network service. A slow or hung ffmpeg behaves as today (timeout → that attempt fails).

### 6. Authorization

Unchanged. The thumbnail endpoint keeps `_get_file_any_state_or_404` with the viewer's
unlocked groups and `_validate_path` under `DATA_DIR`. The scan is the existing scan.

### 7. Effect on existing features

- **Markdown thumbnail projection** (`markdown_images.py`): copies the source picture's
  thumbnail bytes to `<drive>/.markdown/<md id>-<src id>.jpg` when the source's file is
  newer. After a source's thumbnail moves to WebP, its projection is replaced with the same
  WebP bytes and served as `image/webp`.
- **media_import `.loft` thumbnails** (`addons/media_import/backend/service.py`) are saved
  as downloaded into `<stem>.jpg`; they can be JPEG, WebP or PNG. They are not touched by
  the migration (`get_thumbnail_generator` returns none for `.loft`). With the sniffing
  above, WebP and PNG ones are now labelled with their real type instead of `image/jpeg`.
- **intelligence CLIP**: pictures are embedded from the source file, not the thumbnail.
  The thumbnail fallback (non-picture types, and a Markdown file whose projection now
  holds a WebP) opens it with Pillow, which reads WebP; converting RGBA to RGB yields the
  stored RGB of transparent pixels, which is what the JPEG held before.
- **iOS Now Playing** artwork: `UIImage(data:)` decodes WebP (iOS 14+). Only audio/video
  artwork uses it in practice; those thumbnails stay JPEG.
- **Placeholder** (`static/placeholder.jpg`): unchanged, served as `image/jpeg`.
- **Video, PDF, EPUB, HEIC, `image/jpeg`** thumbnails: unchanged (PDF and EPUB keep their
  white frame).
- **Gallery** (`ImageGallery`): unchanged; it draws the full picture on `bg-black`.
- **Letterbox migration**: reads the stored size with Pillow, which reads WebP too.
- **`.claude/rules/backend-conventions.md`** states "JPEG throughout"; that rule is updated
  to say a picture that carries transparency gets a WebP with alpha.

### 8. Error behavior

Nothing new is shown to the viewer. A failed WebP write logs a warning naming the file and
falls back to JPEG; a failed JPEG logs the existing
`ffmpeg image thumbnail failed for ...` error. A source Pillow cannot open is not logged.

### 9. User-visible behavior

- Every surface that draws a thumbnail shows its own container colour through a
  transparent picture's transparent regions, in both themes: `bg-bg-elevated` on cards,
  justified-grid cells, list rows and search results; the hover or selected colour on
  collection rows; the faded trash and missing grids as they fade the rest of the card.
  Today those regions are black (or whatever RGB the file stored).
- File detail: before the full picture decodes, the thumbnail shows as today (with
  transparent regions showing `bg-bg-card`); after it decodes, transparent regions show
  `bg-bg-card`. Today they keep showing the thumbnail's black.
- Existing transparent pictures change over as the scans that walk their folders run;
  until then they look as today.
- Pictures from an opaque source get the same JPEG bytes as today.
- `docs/reference/api.md`'s thumbnail row is updated: WebP with alpha for a picture that
  carries transparency, JPEG otherwise, and the `Content-Type` follows the bytes. No
  user-guide change (a rendering fix the viewer does not need instructions for).

### 10. Non-functional

- Size: measured on a 1600x1200 synthetic RGBA source at 320 px: JPEG 16.8 KB, PNG
  21.7 KB, WebP 2.2 KB (ffmpeg default quality). Not a hard limit.
- First scan after upgrade: every picture that carries transparency and has a JPEG
  thumbnail is re-encoded once, one ffmpeg run each, inside the scan that holds the scan
  lock (other scan requests get 409 meanwhile), with no per-scan cap — the same shape as
  the letterbox migration. On macOS most screenshots are RGBA PNGs, so this can be most
  PNGs in a library.
- Steady state: one header read of the stored thumbnail per non-JPEG, non-HEIC picture per
  scan, plus one header read of the source while the stored thumbnail is still JPEG.
  Opaque PNGs keep paying that source header read on every scan, because nothing records
  that they were checked.
- Browser support: WebP with alpha is decoded by every browser the app supports (Safari
  14+, Chromium, Firefox).

## Touch points

- `backend/app/services/thumbnail.py` — `generate_image_thumbnail` (format choice, JPEG
  fallback), a transparency check helper.
- `backend/app/routers/files.py` — `_revalidating_image` content type from the bytes.
- `backend/app/services/scanner.py` (HIGH zone) — existing-file branch: JPEG→WebP
  migration ahead of the letterbox migration.
- `backend/app/services/upload.py`, `backend/app/services/markdown_images.py` — reached
  through the generator and copied bytes; no code change planned.
- `frontend/src/components/ImageCanvas.tsx` — drop the background once decoded.
- `data/thumbnails/**` — written (same paths).
- `.claude/rules/backend-conventions.md` — "JPEG throughout" rule.
- `docs/reference/api.md` — thumbnail endpoint row.
- Tests: `backend/tests/` (thumbnail generator, scanner migration, upload, Markdown
  projection, files router), `frontend/src/components/` tests for `ImageCanvas`.
- No protected path is edited.

## Invariants

I1. A picture whose source carries transparency gets a WebP thumbnail whose pixels are alpha 0 where the downscaled source is alpha 0.
I2. A picture from an opaque source gets a JPEG thumbnail produced by the same ffmpeg command as before this change.
I3. `GET /api/files/{id}/thumbnail` answers `Content-Type: image/webp` for stored WebP bytes, `image/png` for stored PNG bytes, and `image/jpeg` for anything else including the placeholder, with the same ETag, `Cache-Control: no-cache` and `304` behaviour as before.
I4. A scan replaces a stored JPEG thumbnail with a WebP only when the picture's source carries transparency; it never rewrites a stored WebP, never opens the source of a picture whose stored thumbnail is WebP, and never touches a video, PDF, EPUB, HEIC, `image/jpeg` or `.loft` thumbnail.
I5. A transparent picture whose WebP write fails still gets a JPEG thumbnail, and a failed migration leaves the record's `thumbnail_path` unchanged.
I6. After a source picture's thumbnail becomes WebP, a Markdown file whose thumbnail projects that picture serves the same WebP bytes as `image/webp` after the next scan.
I7. After the full picture in `ImageCanvas` has decoded, the element around it carries no `background-image`; before it has decoded, the thumbnail is painted there when the file has one.
I8. Moving `ImageCanvas` to another file paints that file's thumbnail again until its own picture has decoded.
I9. Thumbnail cache paths and `files.thumbnail_path` values keep their current form (`.jpg` names); no row is added, removed or renamed by this change.

## Checked, no action

- **Renaming the cache slot to `.webp`.** `path_thumbnail_rel` is called by the scanner,
  fileops moves and renames, and the scan compares `thumbnail_path` against it to decide
  relocation. Making the extension depend on the source's transparency would make every
  one of those call sites open the source, and would relocate thumbnails on upgrade. The
  bytes carry their format; the endpoint reads it.
- **PNG instead of WebP.** Larger at 320 px (measured above); WebP with alpha is supported
  by every target client.
- **Detecting transparent pixels instead of an alpha band.** Deciding "at least one pixel
  is not opaque" needs a full decode per check. An opaque RGBA picture therefore gets a
  WebP; it looks the same as its JPEG would.
- **Flattening onto a colour instead.** The surface differs per theme and per surface, so
  no single colour baked into the file matches.
- **AVIF with alpha.** Pillow 11.2.1 in the backend image cannot open AVIF, so an AVIF
  never carries transparency by the definition and keeps its JPEG. Adding an AVIF plugin is
  a separate change.
- **32-bit BMP with alpha.** Pillow opens it as RGB, so it keeps its JPEG.
- **HEIC with alpha.** Rare; the Pillow HEIC path keeps flattening to JPEG.
- **Animated GIF/WebP.** Only the first frame is used, as today.
- **Removing the thumbnail under `ImageCanvas` entirely.** It covers the decode of a large
  picture and the shared-element landing; it stays until decode.
- **Recording which opaque PNGs were checked**, to avoid the repeated header read: would
  need a column or a sidecar; not worth it for a header read.
- **Capping migrations per scan.** The letterbox migration set the precedent of migrating
  as scans walk, uncapped; the first-scan cost is accepted (§10).
- **Stopping retries of a WebP that always fails.** Would need a record of the failure;
  the file keeps a working JPEG and the cost is one extra ffmpeg run per scan for it.
- **A user-guide entry.** The change fixes a rendering; nothing to instruct.
