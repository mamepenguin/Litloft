# Images needed

A consolidated list of images and diagrams referenced (or that should be referenced) in the documentation. Contributions welcome — open a PR with the image and link it from the relevant page.

Place new images under `docs/images/` (create the directory if it does not exist). Reference them with relative paths from the doc that uses them.

> **Note for contributors**: keep screenshots PNG with a transparent background where possible. Crop to the relevant region. For UI screenshots, use a clean state (no debug banners, no test data filenames).

## Getting started

| ID | Where it goes | What it shows |
|---|---|---|
| GS-01 | `getting-started/installation.md` | Final state after `docker compose up -d --build`: terminal output + browser at `:3000` redirected to `/setup`. |
| GS-02 | `getting-started/first-run-setup.md` (top) | Wizard stepper showing all six steps. |
| GS-03 | `getting-started/first-run-setup.md` (Step 3 — Drives) | Drives form with two example drives (`Movies`, `Photos`). |
| GS-04 | `getting-started/first-run-setup.md` (Step 5 — Password) | Password form with the *every group is covered* validation visible. |
| GS-05 | `getting-started/first-run-setup.md` (Step 6 — Addon policy) | Drive × addon matrix with one drive opted out of `intelligence.transcription_cloud`. |

## User guide

| ID | Where it goes | What it shows |
|---|---|---|
| UG-01 | `user-guide/file-browsing.md` | Annotated drive home page: folder grid, file grid, carousels (Continue watching, Recently added, Favourites), breadcrumb. |
| UG-02 | `user-guide/viewers-and-players.md` (Video) | Video player with sprite preview on hover, subtitle picker, autoplay toggle. |
| UG-03 | `user-guide/viewers-and-players.md` (Image) | Image viewer in spread mode, RTL toggle visible. |
| UG-04 | `user-guide/viewers-and-players.md` (Markdown) | Markdown view with frontmatter chips at top (tags, title, description), Mermaid diagram below. |
| UG-05 | `user-guide/search.md` | Search page with semantic + scene search toggles, results showing highlighted timestamps. |
| UG-06 | `user-guide/search.md` (Ask) | Ask answer with citation chips, *no strong source* (⚠) example. |
| UG-07 | `user-guide/upload-and-fileops.md` | Upload progress drawer with multiple files in flight + a paused one. |
| UG-08 | `user-guide/playlists-favorites.md` | Playlist editor with drag-handles for reordering. |
| UG-09 | `user-guide/tags-and-relations.md` | Markdown file detail showing frontmatter tags as chips and *Related files* below. |
| UG-10 | `user-guide/trash-and-missing.md` | Trash view with date-stamped entries and *Restore* / *Delete forever* buttons. |
| UG-11 | `user-guide/comments-history.md` | File detail comments thread + Continue watching carousel. |
| UG-12 | `user-guide/keyboard-shortcuts.md` | The cheat sheet modal opened with `?`. |

## Admin guide

| ID | Where it goes | What it shows |
|---|---|---|
| AG-01 | `admin-guide/admin-dashboard.md` | Annotated admin dashboard: per-drive cards, system metrics, addon widgets, restart-pending banner. |
| AG-02 | `admin-guide/settings-gui.md` | Settings page with all three sections visible (Drives, Passwords, AddonPolicy). |
| AG-03 | `admin-guide/docker-compose.md` | Excerpt of an example `docker-compose.override.yml` with comments highlighting drive mounts and intelligence service. |
| AG-04 | `admin-guide/backup-restore.md` | Diagram of what to back up: `data/`, JSON config, `.env`, addon configs, drive directories. |

## Addons

| ID | Where it goes | What it shows |
|---|---|---|
| AD-01 | `addons/intelligence.md` (top) | Ask page with cited answer. |
| AD-02 | `addons/intelligence.md` (Detailed summary) | Long-form summary with citation chips on each bullet, ⚠ on a low-confidence one. |
| AD-03 | `addons/intelligence.md` (Suggested tags) | Chip editor with Suggested tags and Approve / Dismiss buttons. |
| AD-04 | `addons/intelligence.md` (Scene search) | Scene-search toggle on, results showing video timestamps with thumbnails. |
| AD-05 | `addons/knowledge.md` | Vault note alongside file detail with Active Summary widget showing related notes. |
| AD-06 | `addons/cloud-sync.md` | Dashboard widget with multiple drive mappings, *Sync now* / *Cancel* buttons, schedule. |
| AD-07 | `addons/media-import.md` | File detail of a `.loft` file with embedded YouTube player and metadata sidebar. |

## Reference

| ID | Where it goes | What it shows |
|---|---|---|
| REF-01 | `reference/file-states.md` | Three-state diagram (Active / Missing / Trash) with arrows and the conditions for each transition. |

## Developer guide

| ID | Where it goes | What it shows |
|---|---|---|
| DEV-01 | `developer-guide/architecture.md` (replace ASCII art) | Topology diagram of browser → custom server → backend, with addons orbiting. |
| DEV-02 | `developer-guide/architecture.md` (replace ASCII art) | File-state finite-state machine. |
| DEV-03 | `developer-guide/addon-dev.md` | Diagram of slot system: a single page with multiple slots, each filled by a different addon. |

## Reused

| ID | Where it goes | What it shows |
|---|---|---|
| LOGO | various | Project logo (existing in `legacy/screenshot_*` may be reusable). |

## Animated GIFs

A short animation often beats a static screenshot. Suggested:

- Drag-and-drop upload in action.
- Continue-watching: pause halfway through a video → reload page → resume from same spot.
- Tag chip editing on a Markdown file → frontmatter updates in the side preview.
- Scene-search hit → click → player jumps to the timestamp.

## Conventions

- File names: `<id-lowercase>.png` (e.g. `gs-02-wizard-stepper.png`).
- Resolution: 2× density preferred (Retina-ready).
- Dark mode: capture both, name the dark version `<id>-dark.png`. Use the markdown `<picture>` element to switch.
- Do not include real personal data. Use the bundled `videos/` test content.

## Status

These images do not yet exist. Replace this list with completed entries (`✅ <id>: docs/images/<file>.png`) as they are added.
