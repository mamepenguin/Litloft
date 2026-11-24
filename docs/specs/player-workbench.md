# Player workbench: deep-use panels under the player

SPEC-ID: SPEC-CORE-085
SPEC-ID: SPEC-CORE-086
SPEC-ID: SPEC-CORE-087
SPEC-ID: SPEC-CORE-088
SPEC-ID: SPEC-CORE-089
SPEC-ID: SPEC-CORE-090
SPEC-ID: SPEC-ADDON-099

Approval: sha256:ce54fa3c850c8a6716af16cc777c927c8e401b4727f48c783d6b8b30540cd58d Yuichi Senga 2026-11-12

## Summary

This change is for the household's one user, on the page of a file with a player
(video, audio, `.loft`).

What moves under the player: the things a viewer uses for a while as they watch, seeking
included. These are the transcript, the scenes, the detailed summary and the summary note.
The inspector beside the player keeps quick reference only.

How the panels behave:

- On a wide window, one row of toggles under the player turns each panel on or off.
- Up to two panels are shown together. Turning a third on closes one.
- With every panel off, nothing is drawn under the row.
- Where there is no room for that (the stacked inspector and the phone), each panel is an
  inspector or sheet tab, as the transcript is today.

Other changes:

- The description moves into the Info tab, cut to three lines.
- The panels come from the existing `player-side` addon slot, widened from "the
  transcript tab" to "a workbench panel", plus panels the core contributes through the
  same list. An addon or the core can add a panel without a layout change.
- The beside/below toggle and its stored preference are removed.
- The collection playback surface gets the same workbench.

The behaviors, one SPEC-ID each:

- SPEC-CORE-085: the workbench under the player: toggles, panels, two at most, the panel height and the player cap.
- SPEC-CORE-086: which panels are on is remembered per browser, and nothing is on by default.
- SPEC-CORE-087: in the stacked inspector and on the phone, panels are tabs in a fixed order.
- SPEC-CORE-088: the description sits in Info under the title, three lines, then **Show more**.
- SPEC-CORE-089: the extension contract: `player-side` entries and core panels, `active`,
  ids, and how an id in both `player-side` and `file-detail-sections` is drawn.
- SPEC-CORE-090: the collection playback surface uses the workbench. The beside/below
  toggle, its preference and its rail are removed.
- SPEC-ADDON-099: intelligence's Scenes and Detailed summary become `player-side` entries
  that report availability and follow `labelledByHost` and `active`.

Design (agreed): https://claude.ai/artifact/SMLPhPJSRZzLYhe21a4sJS, saved in
`docs/process/reviews/feature-player-workbench/design/`. The artboards:

- `Main.dc.html`: two panels on. It can be operated in Play.
- `AOne.dc.html`: one panel on.
- `AOff.dc.html`: no panel on.
- `Tablet.dc.html`: the stacked inspector.
- `Phone.dc.html`: the phone.
- `Current.dc.html`: today's page.

The collection surface was not drawn. Its layout is the human's answer recorded in
SPEC-CORE-090.

The design's visible decisions:

- D1. Page width 1440, inspector open: the canvas is to the left of a 384px inspector.
  From top to bottom, the canvas holds the player, one row under it, then the panels.
- D2. The row spans the canvas width.
  - It starts with one toggle per available panel, in the panels' order: here
    Transcript, Scenes, Detailed summary, Note.
  - A toggle is a rounded pill. It has an accent-coloured border when on, a neutral border
    when off, and no fill.
  - The player's existing `file-preview-actions` entries sit at the row's trailing end.
    The mock's "引用" chip stands for them and is not added by this change.
- D3. With two panels on, they sit side by side as equal columns.
  - Each panel is a card with a header row: the panel's name on the left, a close (×)
    button on the right.
  - The body scrolls inside the card.
- D4. With one panel on, it takes the full width of the canvas.
- D5. With none on, nothing is under the row, and the player is at its full size.
- D6. With a panel on, the player is smaller than with none (704×396 against 1024×576 in
  the mock), and the panels reach the bottom of the window.
- D7. The inspector's tabs are Info, Chapters, Related and Ask. Info starts with:
  - the title,
  - the duration,
  - the description cut to three lines with **Show more**,
  - the action row,
  - the tags,
  - then the sections.
- D8. Tablet portrait (stacked inspector): the player is on top and the inspector is under
  it. There is no toggle row. The tabs scroll sideways, in this order: Info, Chapters,
  Transcript, Scenes, Detailed summary, Note, Related, Ask.
- D9. Phone: the sheet's tab strip has the same order and holds the panels as tabs.

## Required items

### 1. Normal flow

**Terms.**

- The **panel list** of a file is every `player-side` slot entry, plus every core panel
  that applies to the file, sorted by `priority`. Core panels and slot entries share one
  priority scale.
- The **wide forms** are:
  - the canonical page (`/drive/{drive}/{path}?file={id}`) with the inspector `beside`;
  - the canonical page with the inspector closed, in any non-phone form;
  - the collection surface.
- The **narrow forms** are the stacked inspector (a player file whose row is too narrow
  for the inspector beside it, inspector open) and the phone sheet.
- A panel is **shown** when it is on and its entry has not answered `false`.
- **Priority** is a number, ordered ascending, as `sortSlotEntries` orders it. When a core
  panel and a slot entry have equal priority, the core panel comes first. Two slot entries
  with equal priority keep the catalogue's order.
- **Before the first measurement:** until the row is measured (today's `awaitingForm`), a
  player file off the phone draws its player but no toggle row, no panel and no tab of the
  panel list, and the player is not capped. Once the first form is measured, the panel
  items mount in that form's place. This is the same rule that today holds back the
  companion.

**Workbench (SPEC-CORE-085).** On a player file in a wide form:

1. The core builds the panel list. The core panels in this change are:
   - `active-summary`, label "Note", on every player file on both surfaces. It wraps
     today's `ActiveSummaryHost` and answers `true` once that host has an active summary
     note to draw, and `false` before then.
   - `chapters`, label "Chapters", on the collection surface only (SPEC-CORE-090),
     priority 50. It answers `false` until chapters are known to exist.
2. Every item in the list is mounted once and receives the props of SPEC-CORE-089.
   - The items that are not shown are mounted inside a `hidden` container in the
     workbench.
   - An item that answered `false` has no toggle.
   - An addon entry that has not answered is treated as available, as today.
3. Directly under the player block (after the `.loft` metadata aside, when there is
   one), one row spans the canvas width.
   - It starts with a group whose accessible name is "Panels" (`aria-label`; no visible
     text). The group holds one toggle per available item, in list order.
   - A toggle is a button whose `aria-pressed` is `true` exactly when its id is in the
     stored list.
   - The player's `file-preview-actions` entries move out of the player box onto this
     row's trailing end.
   - When the row has no toggle and no action, it is not drawn and takes no height.
   - When the row does not fit on one line, it wraps onto more lines, with either kind
     of pointer. It never scrolls sideways.
4. Pressing a toggle whose `aria-pressed` is `false` turns that panel on. Pressing one
   whose `aria-pressed` is `true`, or pressing the panel's close button, turns it off.
5. The shown panels are drawn under the row in list order, not in the order they were
   turned on.
   - When the workbench is at least 41rem wide, they sit side by side as equal columns.
     When it is narrower, they sit one above the other.
   - Each is a `<section>` labelled by its heading. The heading is an `h2` with the
     item's label, plus a close button named "Close {label}".
   - A slot entry receives `labelledByHost: true` and drops its own title.
   - A core panel draws its body as it chooses. `active-summary` passes its slot nothing
     new, so the knowledge section keeps its own note title and **Edit in Knowledge**
     link under the card heading.
6. When the stored list would hold three ids, one is dropped:
   - the earliest-turned-on id that is not shown on this file, if there is one;
   - otherwise the earliest-turned-on id.
7. The height of the panels:
   - The panels start under the row and end at the bottom of the scroll container's
     visible area.
   - They are at least 18rem tall. If 18rem does not fit, they are 18rem and the page
     scrolls.
   - Each panel's body scrolls inside itself. When two sit one above the other, they
     share that height equally.
   - This applies on the canonical page to every player. The collection surface sizes its
     panels differently (SPEC-CORE-090).
8. While at least one panel is shown under a framed player on the canonical page, the
   player is capped: the 16:9 frame is at most half the scroll container's visible
   height. An unframed player (audio) is not capped. Pseudo full screen, system full
   screen and the mini player are not capped either; the panels stay mounted under them.
9. With no panel shown, the area under the row has zero height and the player is the size
   it is today.
10. On the canonical page, chapters stay an inspector tab in every form, and are never a
    toggle or drawn under the player.

**Remembered panels (SPEC-CORE-086).**

1. Which panels are on is one list of panel ids, at most two, in the order they were
   turned on. It is stored in `localStorage` under `workbench-panels`.
2. It is read synchronously (`useSyncExternalStore`). The first frame after the first
   measurement already reflects it. The file page draws no player before hydration, so no
   init script is needed.
   - The store listens for the `storage` event. A toggle in one window of the browser
     updates every other open window.
3. With nothing stored, or with a value that is not a JSON array of strings, the list is
   empty: no panel is on.
4. Turning a panel on appends its id and applies step 6 of SPEC-CORE-085. Turning it off
   removes the id. Only these two actions write the list.
5. The list is shared by every player file and both surfaces. A stored id that is not
   available on this file stays in the list and takes no space.

**Narrow forms (SPEC-CORE-087).** In the stacked inspector and on the phone sheet:

1. No toggle row is drawn, and nothing is drawn under the player except the
   `file-preview-actions` entries, which stay in the player box as today.
2. Every available panel is an inspector or sheet tab, labelled with the panel label. Its
   content is the same entry with `labelledByHost: true`.
3. On every file page the tab order is:
   1. Info
   2. Find (while open)
   3. Pages
   4. Chapters
   5. the panels, in list order
   6. Related
   7. the `inspector-tabs` entries (Ask)

   On a wide page no panel is a tab, so the order there is Info, Find, Pages, Chapters,
   Related, Ask.
4. The stored list does not decide which panels are tabs: every available panel is a tab.
   Selecting a tab does not write the list.
5. Moving between a wide form and a narrow form moves each panel between the workbench
   and the tabs, and remounts it (the human accepted this). The transcript restores its
   place from its per-file store. Such a move happens:
   - when a window drag crosses the threshold;
   - when the inspector is opened or closed in a narrow row;
   - when find opens the inspector.
6. On the phone, the sheet mounts its tabs only while it is raised (half or full), as
   today. At the resting strip no panel is mounted, so raising and lowering the sheet
   mounts and unmounts the panels. For the mounting rules, a resting sheet and a raised
   sheet count as two forms.
7. When a narrow form loses the selected tab (because a wide form took the panel), the
   selection falls to the first listed tab (Info), as `InspectorShell` does today. A
   narrow → wide → narrow round trip therefore ends on Info.

**Description (SPEC-CORE-088).**

1. Wherever `FileMetaBlock` draws a description, on every surface and for every file
   kind, the description shows at most three lines until expanded.
   - Overflow is measured whenever the description box is laid out or resized.
   - When the text needs more than three lines, a **Show more** button follows it.
     Pressing the button shows the whole text, and the button becomes **Show less**.
2. The expanded state lives in `FileMetaBlock`, above its swap to `MetadataEditor`.
   - Every mount of `FileMetaBlock` starts collapsed. This includes the inspector
     reopening, the phone sheet rising, and a phone/desktop crossing.
   - A file change collapses it.
   - Editing the title and description and saving keeps the state it had.
3. On the canonical page, the description is drawn only by `FileMetaBlock`, inside
   `#inspector-panel-info`, under the title and the meta line, for every file kind and in
   every form. It is never drawn under the player.
4. On a player file, a timestamp in it is a link that seeks the player, as today.

**Extension contract (SPEC-CORE-089).**

1. A `player-side` entry is one panel. Besides the file props, it receives:
   - `fillHeight: true`;
   - `labelledByHost: true` wherever the host draws its label;
   - `onAvailability`;
   - `active: boolean`.

   `active` is `true` exactly while the entry is shown under the player, or while its tab
   is the selected tab of a shown inspector, and `false` otherwise. A shown inspector is:
   - the desktop pane while it is open (`beside`, `stacked` or `overlay`);
   - the phone sheet while it is raised.

   An entry that reads none of the new props keeps working: it is mounted, listed when
   silent, and shown when on.
2. An entry that gets no `active` prop behaves as it does today: visible, expanded, keys
   bound. This is so, for example, in `file-detail-sections` on a file without a player.
3. A core panel is a list item `{ id, labelKey, priority, applies(file), render(props) }`.
   - It is merged with the slot entries by `priority`.
   - The toggle row, the panel cards and the tabs treat the two kinds the same way.
4. A `player-side` entry whose id equals a core panel id (`active-summary`, `chapters`) or
   a core tab id (`info`, `find`, `pages`, `chapters`, `related`) is not mounted. The core
   item is kept.
5. On a player file, on either surface, a `file-detail-sections` entry whose id is also a
   `player-side` entry id is not drawn by `file-detail-sections`. It is drawn only as the
   panel. On a file without a player, `player-side` is not mounted and
   `file-detail-sections` draws as today. The rule names no id.
6. On a player file, on either surface, `ActiveSummaryHost` is drawn only through the
   `active-summary` panel: not in the canvas, not at the end of Info, not in the sheet,
   and not in the collection surface's sections. On a file without a player, it and the
   `detailed-summary` section stay where they are today:
   - the canvas on a wide page;
   - the end of Info in the stacked inspector;
   - the sheet on the phone;
   - the Markdown layout's footer.

**Collection surface (SPEC-CORE-090).** These pages are `/files/{id}` with
`?collection=`, `?playlist=` or `?folder_play=1`. This surface has no inspector.

1. It draws the toggle row and the panels of SPEC-CORE-085, from the same list and the same
   stored ids.
   - Its list also holds the core panel `chapters` (priority 50, the last).
   - For a video, the order down the page is the player, the row, the panels, the file
     information and sections, then the queue.
   - For audio, the queue stays beside the player, as today. The left column holds the
     player, the row, the panels, then the file information and sections.
2. The panels together are 60% of the scroll container's visible height, and at least
   18rem. Two panels one above the other share that height equally. The page scrolls past
   them to the information and the queue. The player is not capped.
3. It has no tab form at any width, the phone included.
4. The description and the other sections stay where they are today, except as
   SPEC-CORE-089 steps 5 and 6 say.
5. Removed on every surface:
   - `MediaLayoutToggle`;
   - `useMediaLayoutPreference` and `readMediaLayout`;
   - the `data-media-layout` attribute and its part of the init script;
   - `RAIL_MIN_REM`;
   - `[data-media-width]`;
   - `--companion-box-h`;
   - the `.media-detail-grid` rail columns and its companion areas;
   - the `.media-detail-layout-toggle`, `.media-detail-companion*` and
     `.media-detail-below*` rules.

   The stored `media-layout-preference` key is no longer read or written, and it is not
   deleted.

**Intelligence entries (SPEC-ADDON-099).** In the intelligence addon:

1. The manifest:
   - moves `scenes` from `file-detail-sections` to `player-side`;
   - adds `detailed-summary` to `player-side` and keeps it in `file-detail-sections` (for
     files without a player);
   - gives both `player-side` entries an `i18n_key`.

   The priorities are transcript 10, scenes 20, detailed-summary 30. The core's
   `active-summary` panel is 40.
2. Scenes:
   - It reports `false` on mount and on every `fileId` change, before the browser paints.
   - A `.loft` reports `true` once its `clip-timestamps` response has a row.
   - A native video sends one `clip-timestamps` request per mount and per `fileId`. It
     reports `true` only when the response has at least one row. It stays `false` on zero
     rows, on a failed request, and on a 404 (the policy off).
   - It sends no `visual-index` or picture request until it is first `active`.
   - With `labelledByHost` it draws no header button and no collapse, and its body shows
     whenever it is `active`.
   - It applies no response for another file.
3. Detailed summary:
   - It reports `false` on mount and on every `fileId` change, before the browser paints.
   - It also reports `false` while there is nothing to show: an unsupported type, never
     generated, or `insufficient_content`. The "not enough content" line says only that
     there is nothing.
   - It reports `true` when it draws the generating row, the `failed` row with **Retry**,
     the dormant line, or a body.
   - With `labelledByHost` it draws no collapsible header and is shown expanded.
   - Its window-level keys (`v`, ↑/↓/Enter, Escape) are bound only while `active` is
     `true`, or while `active` is absent.
4. Transcript is unchanged, except that it treats `active: false` as hidden, as it treats
   a `[hidden]` ancestor today.

### 2. Failure cases

- **Storage unavailable** (private mode, quota): reading gives the empty list, and a write
  is dropped. Toggles work in memory for the session.
- **Stored value is not a JSON array of strings:** it is read as empty and overwritten on
  the next toggle.
- **An addon entry never reports:** it is available by silence, as today. It gets a
  toggle, and turning it on shows whatever it draws.
- **An addon module fails to load:** `SlotEntryRenderer` renders nothing, as today.
- **The scenes `clip-timestamps` request fails:** Scenes stays `false` for that file.
- **`useActiveSummary` fails or returns 404:** `active-summary` stays `false`.
- **The scroll container is not measured yet:** the panels are 18rem tall and the player is
  not capped until the first measurement.
- **An entry id collides with a core id:** the entry is not mounted (SPEC-CORE-089 step 4).

### 3. States

Per player-file page:

- The stored list `L`: ids, at most two, in the order they were turned on.
- Availability per item:
  - an addon entry is `unanswered` (counts as available), `true` or `false`;
  - a core panel is `false` or `true`.
- Form: `beside`, closed, `stacked`, phone, or the collection surface.
- Shown, in a wide form: the ids of `L` that are available, drawn in list order, in a row
  at 41rem and wider and one above the other below that.
- In a narrow form, nothing is shown under the player and every available item is a tab.

Transitions:

- Toggle on: append the id, then drop one as SPEC-CORE-085 step 6 says.
- Toggle off or close: remove the id.
- A file change: availability resets, `L` stays, and the description collapses.
- A form change: the panels are re-derived and remounted between the workbench and the
  tabs. Nothing is written.
- The description is `collapsed` or `expanded`. It goes from `collapsed` to `expanded` on
  **Show more**, and back on **Show less** or a file change.

### 4. Data read and written

- `localStorage["workbench-panels"]` (new): read and written. It holds a JSON array of at
  most two strings.
- `localStorage["media-layout-preference"]`: no longer read or written, and left in place.
- `localStorage["inspector-open:{drive}"]` and `tree:enabled:{drive}`: unchanged. This
  change does not write them.
- The addon slot catalogue: read. The intelligence manifest changes.
- The intelligence `clip-timestamps` endpoint:
  - a native video now reads it once per Scenes mount and `fileId`;
  - a `.loft` reads it as it does today.
- The knowledge active-summary endpoint: read by `ActiveSummaryHost`, mounted once as a
  panel on player files.
- No database table, server file or API shape changes.

### 5. External services

None. Every call goes to the core or to a first-party addon on the LAN.

### 6. Authorization

Unchanged.

- Panels are drawn only for a file the viewer can already open.
- Addon requests keep `X-Lit-Drive` and the proxy's policy check.
- A drive with the intelligence policy off answers 404, and the entries report `false`.

### 7. Effect on existing features

- **The transcript:**
  - It becomes a workbench panel in the wide forms and stays a tab in the narrow forms.
  - Today, with the default `beside`, it stays a tab across a window drag. Now a drag that
    crosses the threshold remounts it (accepted, SPEC-CORE-087 step 5).
- **Chapters on the canonical page:** always an inspector tab. The "below" index column
  is gone.
- **Scenes:**
  - It leaves Info and becomes a panel.
  - Its column count still follows its measured width (SPEC-ADDON-093 I1); the width is
    now the panel's.
  - A native video now makes one `clip-timestamps` request when its page opens.
- **Detailed summary and the summary note on player files:** they leave the canvas, the
  end of Info, the sheet and the collection sections. On other files they are unchanged.
- **The description:** it is three lines wherever it is drawn, PDFs, images and the
  collection surface included. On the canonical page it is no longer under the player, so
  it is out of sight while the inspector is closed or the phone sheet is at rest.
- **`canvasSlotIds` / `heavySummaries`:** they keep serving files without a player.
- **`FileDetailShell`:** the stacked cap measures `[data-preview-actions]`, which stays in
  the player box in the narrow forms. In the wide forms the row is outside the player
  box, and the canonical cap of SPEC-CORE-085 step 8 applies there.
- **Find:** unaffected. It searches the document body, not the panels. When it opens the
  inspector in a narrow row, the panels move (SPEC-CORE-087 step 5).
- **SPEC-CORE-036 I10 and I12:**
  - `inspector-tabs` entries stay after every other tab.
  - `player-side` keeps silence-means-available, and its entries keep their relative
    order.
  - Related now comes after the panel tabs in the narrow forms.
- **The iOS shell:** it renders the web page, so no native change.
- **Tests that pin today's placement**, rewritten or deleted as Touch points says.

### 8. Error behavior

Nothing new is shown or logged. A panel whose content fails to load shows the entry's own
error state, as it does today.

### 9. User-visible behavior

- New labels (en / ja):

  | | en | ja |
  |---|---|---|
  | Toggle group | Panels | パネル |
  | Note | Note | ノート |
  | Chapters | Chapters | チャプター |
  | Close button | Close {label} | {label}を閉じる |
  | Expand | Show more | もっと見る |
  | Collapse | Show less | 折りたたむ |

  The addon labels come from their `i18n_key`: Transcript, Scenes, Detailed summary.
- The toggles follow the `DESIGN.md` rule for selected-state controls: the accent border
  marks on, there is no fill, and nothing shifts between the states. They are 44px on a
  coarse pointer.
- Defaults: no panel is on, and the description is collapsed.
- The beside/below button in the page row is gone.
- `docs/user-guide/viewers-and-players.md`:
  - "Chapters and the transcript, beside or below" becomes "Panels under the player".
  - The Info bullet gains the description.
  - The link to the old heading from `docs/addons/intelligence.md` is updated.
- `docs/user-guide/video.md` and `docs/user-guide/keyboard-shortcuts.md`: "the
  **Scenes** section" becomes "the **Scenes** panel".
- `docs/addons/intelligence.md`, `docs/addons/knowledge.md` and `docs/addons/overview.md`:
  where the transcript, scenes, detailed summary and summary note now appear.
- `docs/ADDON-DEVELOPMENT.md`:
  - the `player-side` row and "Occupying the `player-side` slot": one entry is one panel,
    `active`, placement chosen by the core, and colliding ids;
  - the `file-detail-sections` row: the id-in-both rule;
  - the "UI slots provided" table;
  - the `file-preview-actions` row: in the wide forms of a player file, it moves to the
    trailing end of the toggle row, which spans the canvas width;
  - two rows under **Extension-point changes**, because two slots changed where they are
    placed: `player-side` and `file-preview-actions`.
- `DESIGN.md`:
  - "Companion region" becomes "Workbench", with its tokens: 41rem, 18rem, a half-height
    cap, and 60% on the collection surface.
  - The media layout entry of §8 is removed.
- `docs/developer-guide/frontend-dev.md`: the init script no longer sets
  `data-media-layout`.

### 10. Non-functional

- **Mounting:** within one form, each panel item is mounted exactly once on the page.
  Turning panels on or off, closing one, and switching tabs never remount it. A form
  change, as SPEC-CORE-087 step 5 lists, remounts it once.
- **Requests:** the only new request is the native-video Scenes `clip-timestamps`, one
  per mount and file. Panels that are mounted but not shown keep the fetches they have
  today, because they must report availability, as inspector tabs do now.
- **Layout shift:** the entries in this change report `false` before the browser paints,
  and the core panels start `false`. A stored panel that has nothing for the file
  therefore never appears and then vanishes. An addon entry that stays silent is shown,
  as today.
- **Privacy:** nothing leaves the LAN, and the stored list holds panel ids only.

## Touch points

- `frontend/src/components/FileDetail/ShellLayout.tsx`:
  - the panel list and the workbench;
  - the tab order;
  - `canvasSlotIds` / `heavySummaries` on player files;
  - removing `MediaLayoutToggle`.
- `frontend/src/components/FileDetail/MediaCanvas.tsx`: the workbench under the player,
  replacing `companion`, `showDescription` and `heavySummaries` on player files.
- `frontend/src/components/FileDetail/MediaPlayerBlock.tsx`: `layoutToggle` is removed,
  and `[data-preview-actions]` moves to the row in the wide forms.
- `frontend/src/components/FileDetail/FileDetailCanvas.tsx`,
  `frontend/src/components/FileDetail/FileDetailPresenter.tsx` and
  `frontend/src/components/FileDetailFullScreen.tsx`:
  - the collection surface's workbench and order;
  - its rail and toggle are removed;
  - `ActiveSummaryHost` and the id-in-both sections leave `rest` on player files.
- `frontend/src/components/FileDetail/FileDetailContainer.tsx`:
  - `descriptionInCanvas`, `hoistDescription`;
  - `companionMountable`, `companionOccupied`, `companionKind`, `railEligible`.
- `frontend/src/components/FileDetail/FileMetaBlock.tsx` and `FileDescription.tsx`: the
  clamp.
- `frontend/src/components/FileDetail/inspector/tabs.ts` and `InspectorShell.tsx`: the tab
  order, and `active` for the selected panel tab.
- `frontend/src/components/FileDetail/hooks/useSlotAvailability.ts`: reused, and core
  panels report through it.
- `frontend/src/components/FileDetail/hooks/useCompanionMetrics.ts`, `mediaHostStyle.ts`
  and `frontend/src/components/FileDetailShell.tsx`: the canonical cap, the panel height
  and the stacked measurement.
- `frontend/src/lib/layoutSizes.ts`: `RAIL_MIN_REM` out; the 41rem, 18rem, half and 60%
  values in.
- New files: the workbench component (row and cards), the panel-list builder, and the
  `workbench-panels` store.
- Removed: `frontend/src/components/MediaLayoutToggle.tsx` and
  `frontend/src/lib/mediaLayout.ts`.
- `frontend/src/lib/preferenceInitScript.ts`, `frontend/src/app/layout.tsx` and
  `frontend/src/test/setup.ts`: the media layout part is removed.
- `frontend/src/app/globals.css`: the rules listed in SPEC-CORE-090 step 5 come out, and
  the workbench rules go in.
- `frontend/src/components/ActiveSummaryHost.tsx` and `ChaptersPanel.tsx`: wrapped as core
  panels.
- `frontend/src/messages-core/{en,ja}.json`: the new labels go in, and the beside/below
  strings come out.
- Tests rewritten for the new placement:
  - `frontend/src/__tests__/i18n-keys.test.ts` (now covers scenes and detailed-summary);
  - in `frontend/src/components/FileDetail/__tests__/`: `MediaShell`, `StackedInspector`,
    `InspectorTabsSlot`, `FileDetailCanvas`, `LowerInspector`, `ViewerShell`,
    `MediaPlayerBlock`, `DocumentController`, `FilePageClosedEvent`, and the 083.9 block
    of `FindInFile` (asserting `workbench-panels` instead of `media-layout-preference`);
  - `frontend/src/lib/__tests__/preferenceInitScript.test.ts` (the theme part stays);
  - `frontend/src/app/__tests__/mediaDetailTheaterCss.test.ts` (asserts the workbench
    rules).
- Tests deleted with the code they test: `frontend/src/lib/__tests__/mediaLayout.test.ts`.
- e2e:
  - `frontend/e2e-components/fixtures/app.tsx` and
    `fixtures/inspectorResponsive.tsx`;
  - `frontend/e2e-components/inspector-responsive-layout-desktop.spec.ts`;
  - `frontend/e2e-layout/fixtures/mobile-inspector-sheet.html`;
  - `frontend/e2e-components/scenes-section*.spec.ts` and `fixtures/scenesSection.tsx`;
  - `frontend/e2e-components/stubs/addons.ts` and `stubs/transcriptSlot.tsx`: `active`;
  - new real-browser cases for:
    - the cap, the panel height and the columns, on both surfaces;
    - the three-line clamp, and **Show more** appearing only on overflow and after a
      resize.
- Test scaffolding:
  - `frontend/src/components/FileDetail/__tests__/harness.tsx`: the `player-side` stub
    takes `active`;
  - `frontend/src/test/setup.ts`: resets the `workbench-panels` store;
  - the tests that mock `ActiveSummaryHost` through the harness and may assert where it
    sits: `FileDetailContent`, `FileDetailPageRow`, `FileNavInPageRow`,
    `FileDetailInboxNav`, `PlainTextDocument`, `FindInFile.epub`, and
    `folder/__tests__/TreeYield*`. They are rewritten wherever they pin the canvas
    placement on a player file.
- `addons/intelligence` (its own repository and PR):
  - `manifest.json`;
  - `frontend/ScenesSection/*`;
  - `frontend/DetailedSummarySection.tsx`;
  - `frontend/TranscriptSection.tsx` (`active`);
  - messages;
  - the `ScenesSectionManifest` test.

  The core PR carries the gitlink bump.
- Docs, all as §9 lists:
  - `docs/user-guide/viewers-and-players.md`;
  - `docs/user-guide/video.md`;
  - `docs/user-guide/keyboard-shortcuts.md`;
  - `docs/addons/intelligence.md`;
  - `docs/addons/knowledge.md`;
  - `docs/addons/overview.md`;
  - `docs/ADDON-DEVELOPMENT.md`;
  - `docs/developer-guide/frontend-dev.md`;
  - `DESIGN.md`.
- Rules passed through:
  - `.claude/rules/design-decisions.md`: no core-to-addon dependencies; UI through slots.
  - `.claude/rules/frontend-conventions.md`: DESIGN.md, values in code, i18n in
    `messages-core/`.
  - `.claude/rules/internal-api-policy.md`: not engaged.
- No protected path. No backend, database or migration change.

## Invariants

I1. On a player file in a wide form, after the first measurement:
- The row under the player holds exactly one toggle per panel-list item that has not
  answered `false`, in `priority` order, and no other toggle.
- The `file-preview-actions` entries are at the row's trailing end. In the narrow forms
  they stay in the player box.
- Each toggle's `aria-pressed` is `true` exactly when its id is in `workbench-panels`.
- The row is not drawn when it has no toggle and no action.
- On the canonical page, chapters is never a toggle and is never drawn under the player.
- On the collection surface, chapters is a toggle whenever the file has chapters.

I2. In a wide form, the panels drawn under the row are the available ids of
`workbench-panels`, in `priority` order: side by side at a workbench width of 41rem or
more, one above the other below that. With none of them available, the area under the row
has zero height.

I3. `workbench-panels` (the stored list):
- Turning a third panel on drops the earliest-turned-on id that is not shown on this file,
  or the earliest-turned-on id when both are shown.
- The list holds at most two ids.
- With nothing stored, or with a value that is not a JSON array of strings, it is empty.
- Only a toggle or a close button writes it.
- No code reads or writes `media-layout-preference`, and no page sets `data-media-layout`.

I4. Within one form, each panel-list item is mounted exactly once on the page whether it
is shown, hidden or a tab. Turning panels on or off, closing one, or switching tabs never
remounts it or replaces the `<video>` element or `.loft` iframe, and never changes its
playback position or play state.

I5. Panel height and the player cap:
- On the canonical page, while at least one panel is shown under a framed player in a
  wide form, the 16:9 frame is at most half of the scroll container's visible height.
- On the canonical page, when the room under the row is at least 18rem, each shown panel
  ends within the visible area and the scroll container does not scroll.
- On the collection surface, the panels together are 60% of the visible height (at least
  18rem), the player is not capped, and for a video the order down the page is the
  player, the row, the panels, the information, then the queue.
- On either surface, each panel's body scrolls inside itself.

I6. In the stacked inspector and on the phone, no toggle row is drawn and no panel is under
the player. Every available panel is a tab. The tab order is Info, Find, Pages, Chapters,
the panels in `priority` order, Related, then the `inspector-tabs` entries, each when
present.

I7. Wherever `FileMetaBlock` draws a description:
- It occupies at most three lines until **Show more** is pressed.
- **Show more** appears only when the text needs more than three lines at the current
  width.
- A new mount or a file change collapses it, and saving an edit keeps its state.
- On the canonical page it is inside `#inspector-panel-info` and never under the player.
- On a player file, a timestamp link in it seeks the player.

I8. An entry's `active` is `true` exactly while it is shown under the player, or while its
tab is the selected tab of an open desktop inspector or a raised phone sheet. An entry
given no `active` prop behaves as it does today.

I9. On a player file on either surface, an id that is both a `player-side` entry and a
`file-detail-sections` entry is drawn only as a panel, and `ActiveSummaryHost` is drawn
only as the `active-summary` panel. On a file without a player, both are drawn where they
are today. A `player-side` entry whose id equals a core panel or core tab id is not
mounted.

I10. Intelligence entries:
- Scenes, for a native video, sends one `clip-timestamps` request per mount and file before
  it is first `active`, and no `visual-index` or picture request before then.
- Scenes and Detailed summary answer `false` before paint on mount and on each file
  change. Each has a toggle only when it has something to show.
- With `labelledByHost`, neither draws its own header or collapse.
- Detailed summary's window keys are bound only while `active` is not `false`.
- Transcript treats `active: false` as hidden.

## Revises

SPEC-CORE-083 I3. In the stacked layout (not phone, player file, narrow row, inspector open): no part of the inspector overlaps the player block, the player's controls bar is inside the viewport, a framed player's 16:9 frame is at most half the row's height, the inspector is at least 40% of the row's height, and neither the panel toggle row nor the description is under the player. The inspector button is `PanelBottomClose` there and `PanelBottom` in `stacked` with the inspector closed; in every other form it is `PanelRight` / `PanelRightClose`.
SPEC-CORE-083 I4. In the stacked layout every panel-list item and `ChaptersPanel` is mounted exactly once, as an inspector tab; in `stacked` with the inspector closed the panels are drawn under the player as in the wide forms and the description stays in Info; no form change, inspector toggle or yield writes `workbench-panels`.
SPEC-CORE-083 I5. Opening a player file — first load, after the skeleton, or by `selectFile` from any file — mounts the description, `ChaptersPanel` and each panel-list item (`active-summary` and `detailed-summary` among them) once, in the place the first measured form gives; none of them is ever mounted in two places at once.
SPEC-ADDON-080 I6. The Scenes section of a `.loft` requests `clip-timestamps` on mount and on every `fileId` change, and never applies a response for an earlier `fileId`. It renders nothing until the current file's request returns at least one row, and stays hidden when that request fails. It then shows its body when it is `active`, without its own header when `labelledByHost` is true, and its collapsed header otherwise. It takes every picture from the scene-tile route and never requests the frame route. For a tile that fails, it shows a blank block of the picture's size with no visible alt text, keeping the tile's time label and click-to-seek. For a native video, the section requests one `clip-timestamps` per mount and file to report availability, nothing else from the intelligence addon before it is first `active`, and takes its pictures from the frame route, as before.
SPEC-ADDON-093 I7. The ruler, the grid, the scene card and the action row each span the section's full width, and so does the header wherever it is drawn.
SPEC-ADDON-089 I3. For a `touch` or `pen` pointer event the ruler never seeks. A tap or a horizontal drag of at least 8 px sets the browse point. A touch handed to vertical scrolling leaves it as it was. The browse point stays until a tile or the scene card is tapped, the playback position jumps (§9), the section stops being `active` or the file changes.
SPEC-ADDON-089 I5. The file page draws at most one Scenes panel for a video, and only in the states §3 does not hide, and nothing for any other file type. The intelligence manifest has exactly one `scenes` entry, in `player-side`, and no `visual-index` or `clip-frames` entry. No element inside the section scrolls on either axis, with either pointer; the panel body that holds it may. While the section is shown at a fixed width, its height does not change when the window moves or the browse point changes. The section is as wide as its host's content box.
SPEC-ADDON-089 I6. A native video requests one `clip-timestamps` per mount and file, to report availability, and no `visual-index` or picture before the section is first `active`. Each time it becomes `active` it requests `clip-timestamps`, and also `visual-index` unless the policy is off. No response, WS-triggered reload or action result is applied for a `fileId` other than the current one, and none but the availability answer is applied while it is not `active`. WS events reload the section only while it is `active`, and only for the current file.

## Checked, no action

- **The quote chip in the mock.** `Main.dc.html` draws "引用" at the end of the row. The
  quote action stays in the inspector's action row. The chip stands for whatever
  `file-preview-actions` holds, and this change adds nothing for it.
- **Per-account storage instead of per-browser.** Litloft keeps no per-viewer
  preferences on the server, and the media layout preference was per browser.
  `workbench-panels` is per browser too.
- **Drawing panels in the order they were turned on.** Rejected. A panel keeps its place
  in `priority` order, so turning one on never moves another.
- **Unmounting panels that are off.** Rejected. Availability comes from the mounted entry,
  so an unmounted one would never get its toggle. Inspector tabs stay mounted for the same
  reason.
- **Keeping one mount across forms (portals or CSS moves).** The human accepted a remount
  on form change. A single mount moved by portal would remount anyway when its container
  changes.
- **Showing only one panel below 41rem.** Rejected for stacking them one above the other.
  A toggle then never says "on" for a panel that cannot be seen.
- **A cheaper probe for Scenes.** No endpoint is cheaper than `clip-timestamps`. The human
  chose one probe per page over a toggle on every video.
- **The detailed summary's tables at half width.** `.markdown-body table` squeezes to the
  panel. A sideways-scrolling wrapper is a separate change to the addon.
- **The knowledge note's own header.** `ActiveSummarySection` keeps its title and its
  **Edit in Knowledge** link inside the panel. The knowledge addon needs no change.
- **Chapters as a panel on the canonical page.** The human placed chapters with quick
  reference, as an inspector tab. Only the collection surface makes chapters a panel,
  because it has no inspector.
- **Theater mode.** The canonical page has none. The collection surface's queue layout is
  unchanged apart from the order in SPEC-CORE-090.
- **Deleting `media-layout-preference` from storage.** It is left in place, so an older
  build after a rollback still reads it.
- **Adopting the fork's `file-detail-reading` slot.** The fork draws an addon-owned tab
  row there, and here the core owns the row. The 2026-11-11 decision stands. A fork addon
  in `player-side` appears here as a panel unchanged.
- **The order of the merges across repositories.** The intelligence PR merges first, in
  its own repository, and reaches the core's `develop` only through the gitlink. The core
  PR carries the code change and the gitlink bump together. `develop` therefore never
  pairs the new core with the old manifest, or the old core with the new manifest.
- **I8 of the first draft repeating I1** (silence means available). It was merged into
  I1's "has not answered `false`".
- **Decided by the author (the human can overrule at approval):**
  - An empty row is not drawn. This follows the "no holes in the UI" rule in
    `design-decisions.md`.
  - A row that does not fit wraps. This matches the mouse rule for the inspector strip.
    The row is short, so the touch exception buys nothing.
  - On the collection surface, two stacked panels share the 60% equally.
  - For Detailed summary, `failed` keeps a toggle, so **Retry** stays reachable, and
    `insufficient_content` has none.
