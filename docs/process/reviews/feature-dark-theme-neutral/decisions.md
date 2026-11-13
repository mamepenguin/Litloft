# Decisions

decision:
ran_in_app: yes
at: 9e81059e3e34e964dc99da1807d83998d3fd75f3
by: agent
evidence: Scratch stack `litloft-r5-dark` (frontend on :3997, drive `.r5/drive`, data `.r5/data`); theme selected as a user does at Settings → Appearance → Dark (stored `theme-preference=dark`, `document.documentElement.dataset.theme === "dark"` at DOMContentLoaded and after hydration, body bg `rgb(19, 19, 18)` at DOMContentLoaded); screenshots `docs/process/reviews/feature-dark-theme-neutral/shots/00-design-artboard-Neutral.png` (agreed canvas opened as a file), `01`–`05` at 1280x800, `06`–`10` at 390x844, `07b` drawer + active filter, `11` card progress bar; computed values in the table below (raw dump `.r5/measurements.json`); `/manifest.json` served `background_color: "#131312"`, `theme_color: "#131312"`; `<meta name="theme-color">` = `#131312` for `(prefers-color-scheme: dark)` and `#ffffff` for light.
pending: The iOS shell's surround (`useReportPageBackground`) and the installed-PWA splash on a real device, the browser bar on a real dark-mode device, and rendering over the real home LAN are `agent_cannot_verify` in `docs/process/PROJECT.md` and were not run. The selected-card coral outline was not reachable in these screens: clicking a card opens the file, so no selected state is shown in the grid (see below).

## R-5 report

### Setup

- Scratch stack: `LITLOFT_PORT=3997 docker compose -p litloft-r5-dark -f docker-compose.yml -f .r5/override.yml up -d --build backend frontend`, with `.r5/override.yml` mounting `.r5/drives.json`, `.r5/passwords.json`, `.r5/data`, `.r5/drive`.
- Drive "Scratch Strata" (`/app/drives/scratch`): folder `Clips` with 7 short mp4s (testsrc, SMPTE bars, six solid colours), folder `Photos` with 2 PNGs, and `Neutral-Ground.epub` (hand-built: `mimetype`, `META-INF/container.xml`, OPF, one XHTML chapter with four paragraphs). Scan: `added=10, missing=0`, thumbnails rendered.
- Browser: Chromium through `frontend/node_modules/@playwright/test` (scripts in `.r5/`). No unit test or diff was read.
- Theme: Settings → Appearance → Dark. `data-theme` was `dark` before hydration, so the dark block is applied before first paint (item 1.1).

### Steps, expected from the spec and seen

1. **Folder view, grid, sidebar open, 1280x800** (`01-folder-grid-sidebar-1280.png`): expected the dark block's surfaces. Seen: near-black page and sidebar, near-black folder cards, coral Add button, grey meta text. The in-folder field "Filter in this folder..." paints `#1c1c1b`, not the design's `#2f2f2c`.
2. **Search field and filter chip** (`02-search-field-filter-chip-1280.png`). Typing `type:video` in the app's Search overlay shows the chip "Type Video" on `#2f2f2c` (match). The overlay's own field is transparent over the modal's `#131312` at 1280; at 390 it is the sand pill `#2f2f2c` (`09-search-field-filter-chip-390.png`).
3. **Active filter** (`03-folder-filter-active-1280.png`, `08-folder-filter-active-390.png`): choosing File type → Video marks the toolbar Filter button with `bg-elevated` `#272725` and primary text; no coral chip and no chip row in the folder view. A chip row does not exist on this screen; the only chips are in the Search overlay.
4. **Video detail, 1280x800** (`04-video-detail-1280.png`): player on the near-black ground, inspector pane `#1c1c1b`, title `#eeeeea`, muted metadata `#a5a59f`, coral volume fill and coral card progress bar. After playing ~2 s, the folder's card progress bar is coral (`11-folder-progress-1280.png`).
5. **Video detail, 390x844** (`10-video-detail-390.png`): same surfaces; player fills the width, no card fill behind it.
6. **EPUB reader, 1280x800** (`05-epub-reader-1280.png`): the file opens in the reader inside the detail pane. The book surface is the reader's `blob:` content frame: injected style `html, body { background: #131312 !important; color: #eeeeea !important; }`, computed `html`/`body` background `rgb(19, 19, 18)`. The reader shell around the iframe is also `rgb(19, 19, 18)`.

### Measured colours, dark theme

Computed with `getComputedStyle` on the element that paints each surface (Chromium, 2026-11-13).

| Spec's line | Spec | Measured | Element |
|---|---|---|---|
| Page ground | `#131312` | `rgb(19, 19, 18)` | content `<section class="… bg-bg-primary">`; `body` |
| Sidebar ground | `#131312` | `rgb(19, 19, 18)` | `<aside class="… bg-bg-sidebar">` (fixed at 1280, drawer at 390) |
| File cards | `#1c1c1b` | folder cards `rgb(28, 28, 27)`; file tiles **no background** (`rgba(0, 0, 0, 0)`); EPUB tile's media box `rgb(39, 39, 37)` | folder card `div.rounded-2xl.bg-bg-card`; file tile `a.group.block.rounded-2xl…`; media box `div.relative.aspect-video.bg-bg-elevated` |
| Selected sidebar row | `#272725` | `rgb(39, 39, 37)` | active "Library" row `a.bg-bg-elevated.text-text-primary` |
| Search field | `#2f2f2c` | in-folder pill `rgb(28, 28, 27)`; Search overlay input `rgba(0, 0, 0, 0)` over `rgb(19, 19, 18)` at 1280, `rgb(47, 47, 44)` at 390 | `input[placeholder="Filter in this folder..."]`; overlay input / its `bg-bg-primary` modal |
| Filter chips | `#2f2f2c` | `rgb(47, 47, 44)` | `span.bg-sand` inside `[data-role="filter-chips"]` |
| Primary text | `#eeeeea` | `rgb(238, 238, 234)` | file title `span.text-text-primary`; detail title |
| Card meta, counts, inactive sidebar rows | `#a5a59f` | `rgb(165, 165, 159)` | card `span.tabular-nums` ("1.7 KB", "15 minutes ago"), "Scratch Strata · 1 items", "7 items · Video", inactive "Reading" row |
| Primary button | coral `#e85d5e` | `rgb(232, 93, 94)`, text `rgb(255, 255, 255)` | "Add" `button.bg-accent` |
| Active chip | coral `#e85d5e` | not present; active filter is `bg-elevated` `rgb(39, 39, 37)` on the Filter button, chips have no active state | `button.border-bg-border.bg-bg-elevated.font-medium` ("Video") |
| Progress bar | coral `#e85d5e` | `rgb(232, 93, 94)` | card `div.h-full.rounded-full.bg-accent` (116x6 px) after playing; player volume `div.absolute.inset-y-0.left-0.bg-accent` |
| Selected card outline | coral `#e85d5e` | not observed | clicking a card opens it; no selected state is painted in the grid |
| EPUB book surface (I9) | `#131312` | `rgb(19, 19, 18)` | reader content frame `html`/`body` (injected `background: #131312 !important`); shell also `rgb(19, 19, 18)` |
| Browser bar, dark scheme | `#131312` | `content="#131312" media="(prefers-color-scheme: dark)"`; light: `#ffffff` | `<meta name="theme-color">` in `<head>` |
| PWA splash | `#131312` | `background_color "#131312"`, `theme_color "#131312"` | `/manifest.json` as served |

All 31 dark tokens read from the page as declared (`--bg-primary #131312`, `--bg-card #1c1c1b`, `--bg-elevated #272725`, `--bg-sidebar #131312`, `--sand #2f2f2c`, `--text-primary #eeeeea`, `--text-muted #a5a59f`, `--accent #e85d5e`, `--warm-silver #8a8a84`).

### Differences from the spec's checkable lines

- **File cards.** The design line says file cards paint `#1c1c1b`. In the app the grid's file tiles (7 videos in `Clips`, the EPUB in the drive root) paint no background at all; the page ground `#131312` shows behind the thumbnail and the caption. `#1c1c1b` is painted by folder cards and by the video detail's inspector pane. The EPUB tile's large rounded block is its media box at `#272725`.
- **Search field.** The design line says the search field paints `#2f2f2c`. At 1280 the Search overlay's input has no fill (it sits on the modal's `#131312`), and the in-folder "Filter in this folder..." field paints `#1c1c1b`. Only the 390 Search overlay's input is the sand pill `#2f2f2c`.
- **Active chip.** The design draws the active chip coral; the folder view has no chip row and marks the active File-type filter with `bg-elevated` `#272725` on the Filter button. No coral chip exists on these screens. The spec says "as today", and the accent itself is unchanged.
- **Selected card outline.** Not reachable: clicking a card opens the file (detail/player) and the grid is replaced, so no selected-card ring could be seen at either width.

### Not checked

- `pending:` items above (iOS shell surround, installed-PWA splash, real device browser bar, LAN).

### Teardown

`docker compose -p litloft-r5-dark -f docker-compose.yml -f .r5/override.yml down` was run at the end; no other compose project was touched.

## Design check

Accepted by the owner on 2026-11-13. This change replaces token values only; which token paints which part is unchanged, and the artboard drew a simplified folder screen.

- D-1 accepted: file tiles keep painting no card fill; `--bg-card` paints folder cards and the inspector pane, as today.
- D-2 accepted: the in-folder filter field stays `--bg-card` and the search overlay input keeps its current fill per width.
- D-3 accepted: the folder view has no chip row; the active filter stays marked with `--bg-elevated` on the Filter button.
- D-4 accepted: a file card has no selected state in the grid to show; the selection ring is unchanged code.
