# Viewers and players

Litloft picks a viewer based on the file's MIME type. The same file detail page (`/files/<id>`) hosts every viewer; only the central component changes. Below the viewer you always get tags, comments, related files, and any addon-injected sections (transcripts, AI summaries, EXIF, similar files).

## Video player

- **Adaptive streaming** — the backend serves byte-range requests; the player seeks instantly without re-downloading.
- **Resume from last position** — playback position is saved every 5 seconds. When you reopen the file, you resume where you left off.
- **Subtitles** — sidecar `.srt` / `.vtt` files in the same folder are auto-attached. Name them after the video's basename: `movie.srt` (default track) or `movie.<lang>.srt` / `movie.<lang>.vtt` where `<lang>` is a 2–3 letter code (`en`, `ja`, `eng`, …) — each becomes an entry in the language picker, default track first. `.srt` is converted to WebVTT on the fly for the browser player. Subtitle files do not appear as their own entries in the file list.
- **Sprite preview on hover** — the scrubber shows a thumbnail strip generated lazily by ffmpeg. Generation is gated by a semaphore (max 2 concurrent) so a busy library does not blow up CPU.
- **Picture-in-picture** — `autoPictureInPicture` is enabled where the browser supports it.
- **Media session** — lock-screen and OS media-key controls (play/pause, next, previous within a playlist).
- **Theatre mode** — toggle to expand the player and show a sidebar with the playlist queue or related files.
- **Cast** — Chromecast button when a compatible session is detected.
- **Autoplay** — defaults **off** to respect attention. Toggle on the player; choice is persisted in localStorage.
- **Keyboard shortcuts** — `space` (play/pause), `←` / `→` (seek ±5 s), `/` (fullscreen). Single-character shortcuts only fire when no input is focused.

## Audio player

- Resume from last position and `last_played_at` updated on open.
- Media session for OS controls.
- Autoplay toggle (same persistence as the video player).
- Title and artwork from ID3 / file metadata; fallback to thumbnail.

## Image viewer

The image viewer doubles as an archive page-turner — both single images and pages inside ZIP/TAR/RAR archives use the same component.

- **Swipe navigation** — left/right swipe (50 px threshold) advances. Direction is reading-direction-aware: in *right-to-left* mode (manga, Arabic, Hebrew) the swipe is mirrored.
- **Edge taps** — tapping the left or right 25% of the screen behaves like swipe.
- **Centre tap** — toggles the controls bar.
- **Slideshow** — auto-advance with intervals 1 / 2 / 5 / 10 s, or disable.
- **Spread (double-page)** — show two pages side by side for landscape monitors. Works for `.cbz` and similar comic archives.
- **Reading direction** — LTR (default) or RTL toggle; affects swipes and spreads.
- **Pinch-zoom and pan** — multi-touch and pointer-based.
- **Download per page** — ZIP entries can be downloaded individually.
- **HEIC support** — converted on the fly using Pillow + pillow-heif. ffmpeg-based fallbacks are intentionally avoided because they produce black thumbnails for HEIC.

## Markdown viewer

Litloft renders Markdown with a curated set of extensions:

- **Syntax highlighting** for fenced code blocks (`highlight.js`).
- **Mermaid diagrams** — lazy-loaded; opt-in only, since Mermaid evaluates string input as code-like configuration.
- **GitHub-flavoured task lists** with rendered checkboxes.
- **Frontmatter chips** — YAML frontmatter is parsed and the `tags`, `title`, `description`, and other recognised keys are surfaced as editable chips above the body. Saving chips writes to the file (canonical store for `.md`) and the backend mirrors `tags` into the database.
- **`loft://` internal links** — `loft://<file_id>` (12-char) opens the linked file. Two-way: such links are also synced to the `file_relations` table so the file detail "Related" section works.
- **In-place editor** — click *Edit* to switch the viewer to a text editor. Saves use a 500 ms debounce to coalesce typing into one HTTP write.

## PDF viewer

- Embedded PDF.js iframe with `#page=N` deep linking.
- Initial page can be set via URL fragment.
- Larger PDFs stream from the backend; the viewer does not load the entire file at once.

## Office (DOCX / XLSX / PPTX) preview

Office files are rendered through an embedded preview pipeline. Behaviour:

- For supported formats, an HTML preview is shown.
- For unsupported variants or when conversion fails, you get a **Download** button instead.

## ZIP / TAR / RAR archives

- The archive is **not extracted on the server**; entries are streamed lazily.
- The viewer shows a tree (or, for image-heavy archives, the image viewer described above).
- Per-entry caps: 50 MB per entry, max 10 000 entries, max 3 concurrent extractions across all viewers.
- Click an entry → in-browser preview if the type is recognised, else download.

## Text editor

For `.txt`, `.md`, source code, and similar text MIME types you can switch into edit mode:

- 1 MB write cap (server-enforced).
- Debounced auto-save (500 ms).
- Atomic write on the backend (`.tmp` + rename) so a crash mid-save never produces a half-written file.
- For Markdown specifically, frontmatter changes are detected and `File.tags` is re-projected.

## Adaptive player (media-import)

When a file is a `.loft` reference produced by the [media_import addon](../addons/media-import.md), the viewer dispatches to a provider-specific embed:

- **YouTube** — embedded YouTube player with metadata sidebar.
- **Vimeo** — embedded Vimeo player.
- **SoundCloud** / others — fallback link card; no in-place player in current versions.

## Per-file actions menu

Every viewer page has a `…` menu with:

- Rename (in-place).
- Move / copy to another folder.
- Edit title and description.
- Delete (soft) / Restore from trash.
- Download original.
- Open parent folder.

## What gets hidden

A file in the **missing** state still has its viewer page but streams return `410 Gone` (the file is no longer on disk). Tags, comments, watch history, and AI artefacts persist for when the file reappears. See [trash and missing files](trash-and-missing.md).
