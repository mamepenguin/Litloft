# Viewers and players

Litloft picks a viewer based on the file's MIME type. The same file detail page (`/files/<id>`) hosts every viewer; only the central component changes. Below the viewer you always get tags, comments, related files, and any addon-injected sections (transcripts, AI summaries, EXIF, similar files).

## The companion rail

Video and `.loft` files get a **companion region** — a second column of playback-aware panels that belongs to the player rather than to the page below it.

- **Chapters sit at the top**, addon panels below (the Intelligence addon's playback-following transcript is the one that ships today). They stack rather than sharing a tab strip, so a coarse index and the fine text can follow the same clock at once.
- **Beside or below** — a toggle directly under the player swaps the region between a column beside the player and a full-width block under it. The choice is saved in `localStorage`, per device.
- In the beside form the column spans the whole page, so you can scroll the left side through metadata, summaries and comments while the rail stays put and keeps following playback.
- The beside form only appears where it actually fits (the detail area has to be at least 60 rem wide). On a narrower window, or in the two-pane right pane, the region falls back to stacking below the player and the toggle is hidden.
- **Audio never gets the rail.** The player is a couple of hundred pixels tall and a column beside it would leave half the width empty; the region stays full-width under the player.
- With no occupant — no chapters and no addon panel — the region is not rendered at all and the page looks exactly as it did before.

## Chapters

A chapter list in the companion region, seekable by click, with the chapter the playhead is inside highlighted.

- **Where they come from** — three producers, all writing to the same core table:
  - **Container metadata**, read with `ffprobe` when the file is first scanned or uploaded (`source: "extracted"`).
  - **A `.loft` provider**, from the metadata captured at import time by the [media_import addon](../addons/media-import.md) (also `extracted`).
  - **An LLM**, through the Intelligence addon's *Suggested Chapters* section on the file detail page. Like auto-tags this is a Suggest → Approve/Dismiss workflow; approving promotes the set into the core table as `curated`.
- **Curated wins.** Once a person has approved a set, a later re-probe or a Media Import refresh leaves it alone.
- **Collapsing** shrinks the panel to a single line naming the chapter the playhead is inside. Expanded, the header goes back to the plain label — the highlighted row already says where you are.
- A chapter with no usable title is dropped rather than rendered blank, so the list may be shorter than the file's own marker count.
- Chapter lists are read-only in the core UI: there is no chapter editor.

## Video player

![Video player with hover preview, subtitles menu, and autoplay controls](../images/user-guide/video-player-subtitles-preview.png)

Litloft draws **its own control bar** over the video frame. The same bar, gestures and settings sheet serve both the native `<video>` element and the `.loft` player, so the two behave identically.

- **Two layouts, picked by input device** — a pointer (`pointer: fine`) gets a compact bar that reveals on movement and a settings popover parked above the button; a finger (`pointer: coarse`) gets larger targets and a settings sheet rising from the bottom edge. A tablet paired with a keyboard case can switch mid-session.
- **Gestures differ by input device, and do not overlap.** On touch: a single tap surfaces the bar, a double-tap on the left or right half skips 10 s that way (further taps within 1.3 s keep adding to the same hop, with the running total on screen), a long press boosts a *playing* file to 2x until you let go, and a vertical swipe or a pinch enters and leaves fullscreen. With a mouse: click plays and pauses, double-click toggles fullscreen — there is no tap-to-skip and no speed boost. See [keyboard shortcuts and gestures](keyboard-shortcuts.md).
- **Settings sheet** — captions on/off and playback speed (0.5, 0.75, 1, 1.25, 1.5, 2) are core's own. The player's owner contributes rows of its own to the same sheet, which core keeps opaque: the native player adds Picture-in-Picture, autoplay, a hand-back-to-browser-controls switch, and a subtitle track picker when the file has more than one track.
- **Browser controls** — the settings switch hands the frame back to the browser's native bar, which is also where the platform's own fullscreen and AirPlay entries live. A *Use Litloft controls* link under the player takes it back. The choice is remembered per device.
- **Fullscreen** — the browser's Fullscreen API where it exists. No Apple mobile browser implements element fullscreen, so there the player frame is pinned over the viewport with `position: fixed` instead. The frame is styled in place and never moved to a new parent, so an embedded player keeps its position and its API binding.
- **Adaptive streaming** — the backend serves byte-range requests; the player seeks instantly without re-downloading.
- **Resume from last position** — see [shared playback clock](#shared-playback-clock-and-watch-history) below.
- **Subtitles** — sidecar `.srt` / `.vtt` files in the same folder are auto-attached, for `.loft` files as well as for real video. Name them after the video's basename: `movie.srt` (default track) or `movie.<lang>.srt` / `movie.<lang>.vtt` where `<lang>` is a 2–3 letter code (`en`, `ja`, `eng`, …) — each becomes an entry in the language picker, default track first. `.srt` is converted to WebVTT on the fly for the browser player. Subtitle files do not appear as their own entries in the file list. When no sidecar exists, the player offers the Intelligence addon's generated track instead.
- **Picture-in-picture** — `autoPictureInPicture` is enabled where the browser supports it, plus an explicit toggle in the settings sheet.
- **Mini player** — on desktop, scrolling the player out of view reflows it into a fixed 320x180 window at the bottom right. The element is never remounted, so nothing reloads.
- **Media session** — lock-screen and OS media-key controls (play/pause, next, previous within a collection).
- **Cast** — Chromecast button when a compatible session is detected.
- **Autoplay** — defaults **off** to respect attention. Toggled from the settings sheet; the choice is persisted in localStorage.
- **Keyboard shortcuts** — see [keyboard shortcuts and gestures](keyboard-shortcuts.md).

## Audio player

Audio keeps the browser's own `<audio controls>` bar rather than Litloft's — there is no frame to draw over.

- Resume from last position and `last_played_at` updated on open.
- Media session for OS controls. Title and subtitle come from Litloft's own metadata (file title, folder path); the artwork is the file's Litloft thumbnail, not embedded ID3 art.
- Cast button and an autoplay toggle sit below the player.

## Image viewer

The full-screen image viewer is a page-turner for a folder of images. Archives get a separate viewer built from the same gesture handling, described under [ZIP / TAR / RAR archives](#zip--tar--rar-archives).

![Image viewer in two-page spread mode with right-to-left reading enabled](../images/user-guide/image-viewer-spread-rtl.png)

- **Swipe navigation** — horizontal swipe (50 px threshold) advances; swiping right goes to the next image in both reading directions.
- **Edge taps** — tapping the left or right 25% of the screen turns the page. These *are* reading-direction-aware: in *right-to-left* mode (manga, Arabic, Hebrew) they are mirrored, as are the on-screen arrows and the arrow keys.
- **Centre tap** — toggles the controls bar.
- **Slideshow** — play/pause button with an interval of 3, 5 or 10 seconds. Controls fade out three seconds into playback.
- **Spread (double-page)** — shows a landscape image as two half-width pages, turned one at a time, for scanned comics and magazines. Portrait images are unaffected.
- **Reading direction** — LTR (default) or RTL. The toggle appears while spread mode is on.
- **HEIC support** — converted to JPEG on the fly using Pillow + pillow-heif, and cached. ffmpeg-based fallbacks are intentionally avoided because they produce black thumbnails for HEIC.

The file detail page for a single image shows the image itself. The full-screen page-turner opens from the maximise button beside it, and walks the other images in the same folder from there.

## Markdown viewer

Litloft renders Markdown with a curated set of extensions:

![Markdown viewer with frontmatter chips and a rendered Mermaid diagram](../images/user-guide/markdown-viewer-frontmatter-mermaid.png)

- **Syntax highlighting** for fenced code blocks (`highlight.js`).
- **Mermaid diagrams** — lazy-loaded; opt-in only, since Mermaid evaluates string input as code-like configuration. Untrusted sources such as LLM answers render with Mermaid off.
- **GitHub-flavoured task lists** with rendered checkboxes.
- **Frontmatter chips** — YAML frontmatter is parsed and the `tags`, `title`, `description`, and other recognised keys are surfaced as editable chips. Saving chips writes to the file (canonical store for `.md`) and the backend mirrors `tags` into the database.
- **`loft://` internal links** — `loft://<file_id>` (12-char) opens the linked file. The same scheme works in image syntax, resolving to the file's stream URL. Two-way: such links are also synced to the `file_relations` table so the file detail "Related" section works.
- **In-place editor** — where the [knowledge addon](../addons/knowledge.md) is installed and its editor is enabled for the drive, the page switches to a document layout with an edit / split / preview toggle and a side inspector. Saves use a 500 ms debounce to coalesce typing into one HTTP write. Without that addon the Markdown viewer is read-only apart from the frontmatter chips.

## PDF viewer

- Rendered page by page with PDF.js (`react-pdf`), inside the page rather than in a browser plugin frame — so text selection works and the Intelligence addon can quote the page you are looking at.
- Page navigation and a zoom control (0.5x to 2x in 0.25 steps); the page fits the available width by default.
- The initial page can be set from the URL, which is how Ask citations land on the right page.
- Pages stream from the backend as they are needed; the viewer does not rasterise the whole document up front.

## Office (DOCX / XLSX / PPTX) preview

Office files have **no in-app viewer**. The detail page shows the file type, name and size with a *Download* action.

What Litloft does read is a short text excerpt — up to 400 characters extracted server-side with `python-docx` / `openpyxl` / `python-pptx` — which is used as the file's thumbnail in listings and makes the document findable by search.

## ZIP / TAR / RAR archives

- The archive is **not extracted on the server**; entries are streamed lazily.
- The listing has grid and list view modes, sorting, and a breadcrumb for folders inside the archive.
- Per-entry caps: 50 MB per entry, max 10 000 entries, max 3 concurrent extractions across all viewers.
- Click an entry → an image page-turner or a text viewer opens over the listing if the type is recognised, else the entry downloads.
- The archive page-turner shares the image viewer's gestures, spread mode and reading direction, and adds a per-entry **download** button.

## Text files

`.txt`, source code and similar text MIME types are shown read-only, with the search term highlighted when you arrive from a search result. A file over 1 MB is not fetched until you confirm, so opening a huge log by accident costs nothing.

Writing text content back is possible through the API (`PUT /api/files/{id}/content`), restricted to `text/markdown` and `text/plain`:

- 1 MB write cap (server-enforced).
- `If-Match` required — a stale ETag is rejected with `412`, so two editors cannot silently overwrite each other.
- Atomic write on the backend (`.tmp` + rename) so a crash mid-save never produces a half-written file.
- For Markdown specifically, frontmatter changes are detected and `File.tags` is re-projected.

The only editor in the UI that uses this path is the Markdown editor described above.

## Adaptive player (media-import)

When a file is a `.loft` reference produced by the [media_import addon](../addons/media-import.md), the viewer dispatches to a provider-specific embed:

- **YouTube** — embedded through the IFrame API and driven by Litloft's own control bar, gestures and settings sheet, exactly like a local video. A metadata panel (channel, caption status) renders below the player.
- **Vimeo** — embedded Vimeo player.
- **Anything else** — a link card to the original URL; no in-place player.

Two things are specific to the YouTube embed:

- **Player UI choice** — a row in the settings sheet swaps Litloft's controls for YouTube's own. It is off by default: Litloft's controls are the point of the embed, and switching trades away the gestures, the caption toggle and the speed sheet. On iOS the browser then refuses inline playback and opens its own full-screen player, which is the only place Picture-in-Picture can be reached from — a cross-origin iframe puts its `<video>` out of our reach.
- **Ad awareness** — while the provider is drawing chrome of its own (a pre-roll, an end screen), Litloft's overlay stands down and file-scoped controls go quiet, so an ad's own controls are never covered.
- **Embedding-restricted fallback** — when a video's owner disallows embedded playback (YouTube reports this regardless of which control skin was requested), Litloft gives up on the in-page player entirely and shows the file's thumbnail with a "Watch on YouTube" link that opens the video on youtube.com in a new tab. The player UI choice above has no effect in this state, since neither skin can play the video in an iframe.

## Shared playback clock and watch history

Both playback backends run on one implementation, so resume, periodic saving and completion behave the same whatever is playing.

- **Periodic saves** every 5 seconds of playback, plus one on teardown if the position has drifted by more than a second since the last write.
- **Resume** skips a 5-second dead zone at both ends of the timeline: below it there is nothing worth restoring, above it you would be dropped straight back at the end.
- **An explicit `?t=` position wins** over stored progress. A citation click is a "land here" instruction, so snapping back to where you left off would be a bug.
- **Reaching the end records the final position; it never deletes the record.** See [comments and watch history](comments-history.md).
- **Media with no trustworthy duration** — a live stream, or media that never probed its length — never resumes and never records a completed state. There is no position to be at, and inventing one would be worse than saying nothing.
- **Interruptions are not persisted.** While an ad owns the clock, nothing is written; YouTube's end-of-video event fires for pre-rolls too, and writing there unguarded would stamp the ad's length onto the video as a finished watch.

## Per-file actions menu

Every viewer page has a `…` menu with:

- Edit title and description.
- Download original.
- Rename (in-place).
- Move to another folder.
- Move to trash.

Restoring from trash is done from the [trash view](trash-and-missing.md), not from this menu.

## What gets hidden

A file in the **missing** state still has its viewer page but streams return `410 Gone` (the file is no longer on disk). Tags, comments, watch history, and AI artefacts persist for when the file reappears. See [trash and missing files](trash-and-missing.md).
