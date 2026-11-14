# Decisions

decision: ship (human, 2026-11-14, "ship", after r1 HUMAN_REVIEW_REQUIRED for unspecified_behavior: the MCP add_to_collection and get_collection outputs gaining on_home accepted as a read-only pass-through; B findings R1-claude-read-1, TP-1, TP-2, TP-3, TP-4 accepted)
ran_in_app: yes
at: d0119924c16ff58eb7575f59851158f1e7ec6797
by: agent
evidence: Playwright (headless Chromium from frontend/node_modules/@playwright/test)
  against a scratch stack of this tree: `LITLOFT_PORT=3995 docker compose -p
  litloft-r5-homesc -f docker-compose.yml -f .r5/override.yml up -d --build backend
  frontend`, UI in English. One drive `scratch` mounted from .r5/drive (4 folders
  including the 76-character "A very long folder name that keeps going well past
  sixty characters in total" and Lectures/2026; 2 videos 25 s and 30 s, 2 audio
  files 22 s and 28 s, 6 Markdown notes). Passwords are `[]`, so no viewer login.
  Created through the UI: Smart Folder "Audio notes" (query audio, saved from the
  search overlay with Enter), collection "Study picks" with Audio-one and Audio-two
  (right-click a file card > Add to collection), pin Lectures/2026, pin the long
  folder. Screenshots in docs/process/reviews/feature-home-entry-shortcuts/shots/.
  Check 1 (01, 04, 08, 09, 14, 17, 18, 19, 20, 21, 22, 23, 24): PASS. Search page
  `More actions` menu before placing: Update, Rename, Put on Home, Delete, Selection
  mode; after: Update, Rename, Remove from Home, Delete, Selection mode (Put/Remove
  after Rename, before Delete). Collection `More actions for Study picks`: Put on
  Home, Delete collection -> Remove from Home, Delete collection (before Delete).
  Folder `More actions` while unpinned: Selection mode, Rescan, Pin this folder (no
  Home row); after Pin: Selection mode, Rescan, Unpin this folder, Put on Home
  (directly after Unpin); after placing: Remove from Home. Same for the long folder.
  Each choice sent `PUT /api/drives/scratch/home-shortcuts` and answered 204.
  Check 2 (25, 26, 27, 28): PASS. Placement order was Smart Folder, 2026, long
  folder, collection; GET returned exactly that order. At 1440 the row was Library,
  Video, Reading, Audio notes (lucide-search), 2026 (lucide-folder), long folder
  (lucide-folder), Study picks (lucide-library), all on one line at y=164, after
  the built-in apps; this stack ran no addon service, so there were no addon
  entries and no Inbox tile. Long-name tile measured 256 px (16rem) wide with a
  one-line 21 px label, scrollWidth 490 vs clientWidth 196, drawn with a trailing
  ellipsis; the other tiles were 95-138 px wide. documentElement.scrollWidth ==
  innerWidth (1440). At 390 with hasTouch/isMobile the row is a 4-column grid of
  83.5 px tiles, two rows (Library, Video, Reading, Audio notes / 2026, long
  folder, Study picks) at y=156 and y=236; the long label wrapped to exactly two
  15 px lines (30 px) and ended with an ellipsis, the other labels one line; no
  horizontal scroll (documentElement.scrollWidth 390 == innerWidth). Accessible
  names were the full labels (`getByRole('link', { name: <full label>, exact: true
  })` matched). Removing a tile left the order of the rest unchanged, and a target
  placed later was drawn last.
  Check 3 (30-dest-*): PASS. Clicking each tile, with `window.__r5marker = "kept"`
  set first, landed on /drive/scratch/search?q=audio&smart_folder_id=KxUg8jtQyT72,
  /drive/scratch/Lectures/2026, the percent-encoded long-folder path and
  /drive/scratch/collections/EXpvU1_pBGd4; the marker survived every click, so no
  full document reload.
  Check 4 (44, 45, 46, 47, 48, 49, 50): PASS. Remove from Home on the collection
  page flipped its menu back to Put on Home; after reloading Home the collection
  tile was gone and the other three kept their order. Unpin this folder on the
  long folder removed its tile from Home (menu became Selection mode, Rescan, Pin
  this folder); re-pinning showed Put on Home (not Remove from Home) and Home
  still had only the Smart Folder and 2026 tiles.
  Check 5 (32, 33, 34, 35b, 36, 37, 38, 39): PASS. Renaming the collection to
  Course picks and the Smart Folder to Audio recordings showed both new labels on
  the next Home load. Renaming Lectures to Courses from the root folder card's
  context menu (Pin, Rename, Move, Delete) rewrote the pin to Courses/2026; the
  shortcut stayed in position 2, still read "2026", linked to
  /drive/scratch/Courses/2026, and the click was still client-side.
  Check 6 (40, 41, 42, 43): PASS. Sidebar Collections before (Course picks on
  Home): Later picks 0, Course picks 2; after Remove from Home: the same; after
  Put on Home again: the same. `updated_at` for both collections was identical
  before, between and after the PUTs (Later picks 03:05:55, Course picks
  03:04:16), so the list order never moved.
  Check 7 (51, 52, 53, 54): PASS. With the collection page open and the menu
  showing Put on Home, `docker compose ... stop backend`, then choosing Put on
  Home: the PUT answered 500, a toast read "Couldn't change the Home entry", the
  page stayed on the collection, and the menu still showed Put on Home. After
  `start backend` and a reload the menu still showed Put on Home. GET failure was
  also produced by aborting only the home-shortcuts request (55, 56, 57): the
  entry row drew Library, Video, Reading with no shortcut tiles, Recently Added
  still drew, no home-unavailable page, and the next reload restored both
  shortcuts.
pending: none for the seven checks. A human may want to see the Japanese labels
  (ja ホームに置く / ホームから外す) because the stack rendered the English UI, and
  I6's cross-drive discard was not producible with the single drive the brief
  specified. The real iOS device, audio/video quality, LAN playback and
  third-party addon calls under PROJECT.md agent_cannot_verify are not on this
  path.

## R-5 report

### 1. Placing the four shortcuts — PASS

- Smart Folder: search overlay (`Search`), typed `audio`, Enter, then the results
  page's `More actions` > Save as Smart Folder > name `Audio notes` > Save. The URL
  gained `smart_folder_id=KxUg8jtQyT72`.
- Collection: sidebar `Create collection`, name `Study picks`, then on All Files
  right-click Audio-one and Audio-two > `Add to collection` > `Study picks`
  (`POST .../collections/EXpvU1_pBGd4/items` 200 twice). The collection page showed
  `2 items`.
- Pins: `/drive/scratch/Lectures/2026` and the long folder, each `More actions` >
  `Pin this folder` (`POST /pins` 201).
- Placement: each page's `More actions` menu, `Put on Home` (`PUT .../home-shortcuts`
  204 every time); the same menu then read `Remove from Home`.

### 2. Home at 1440 and 390 — PASS

- 1440 (`26-home-1440-fullpage.png`): one row at y=164 — Library, Video, Reading,
  Audio notes, 2026, long folder, Study picks. Icons lucide-search, lucide-folder,
  lucide-folder, lucide-library. Long tile 256 px, ellipsis on one line. No
  sideways scroll. No addon entries (no addon service on this stack) and no Inbox
  tile (no arrivals), so the shortcuts were the last tiles after the built-in apps.
- 390 with `hasTouch: true, isMobile: true` (`27-home-390-touch-fullpage.png`):
  grid of four 83.5 px columns, two rows 4+3 in the same order; long label two
  lines with an ellipsis, tile 82 px tall; no sideways scroll. `28` is the same
  width without touch, identical.

### 3. Where each tile lands — PASS

- Audio notes -> `/drive/scratch/search?q=audio&smart_folder_id=KxUg8jtQyT72`
  (`30-dest-Audio-notes.png`); 2026 -> `/drive/scratch/Lectures/2026`
  (`30-dest-2026.png`); long folder -> the encoded long path
  (`30-dest-A-very-long-folder-name-that-k.png`); Study picks ->
  `/drive/scratch/collections/EXpvU1_pBGd4` (`30-dest-Study-picks.png`). The
  `window.__r5marker` set before each click was still present afterwards.

### 4. Remove and unpin — PASS

- Collection page `Remove from Home` (`44`, `45`): Home reloaded without the
  collection tile (`46`).
- Long folder `Unpin this folder` (`47`): Home had no long-folder tile (`48`); the
  menu no longer offered a Home row. `Pin this folder` again gave `Put on Home`
  (`49`) and Home stayed without it (`50`).

### 5. Renames — PASS

- Collection -> `Course picks` (`32`); Smart Folder -> `Audio recordings` (`33`);
  Home showed both (`34`).
- `Lectures` -> `Courses` from its root card's context menu (`35b`, `36`):
  `GET .../home-shortcuts` then returned `id: "Courses/2026"` in the same second
  position, and the tile linked and landed at `/drive/scratch/Courses/2026`
  (`37`, `38`, `39`).

### 6. Sidebar Collections order — PASS

- See the evidence line: Later picks then Course picks in all three states; the
  collections' `updated_at` did not change.

### 7. PUT failure — PASS

- Backend stopped while the collection page was open; `Put on Home` produced a 500
  and the toast `Couldn't change the Home entry` (`51`, `52`, `53`); the menu kept
  `Put on Home`. After restarting the backend the menu still read `Put on Home`
  (`54`).
- GET failure on Home (`55`, `56`, `57`): with only that request aborted, the row
  drew the three built-in apps and no shortcuts, Recently Added still drew, no
  home-unavailable page; after unblocking and reloading, Audio recordings and 2026
  returned.
