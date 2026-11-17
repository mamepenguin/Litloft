# Notes: an app frame, a Home of what you are writing, and a Library you read in place

SPEC-ID: SPEC-ADDON-130
SPEC-ID: SPEC-ADDON-131
SPEC-ID: SPEC-ADDON-132

Approval:

## Summary

The Notes page of the Knowledge addon (`/drive/{drive}/addons/knowledge`) was built before
the purpose-built apps (Video, Reading, Photo Diary). It has its own header, no Target, a
vertical stack of landing sections and tool tiles, and a separate "All notes" view. This
change puts Notes on the apps' frame and gives its two tabs content that fits notes, which
are text the viewer wrote: they are read, not chosen by a picture.

- **SPEC-ADDON-130, the frame.** The core `AppHeader` with the Notes icon and title, the
  scope line "<drive> · N notes", the shared Target menu, a primary "New note" action, and
  two tabs, **Home** and **Library**. The sidebar behaves as on the other apps. The
  landing's search box, the Web clip tile and the Connections tile go. Every URL that
  reaches Notes today keeps working (I8).
- **SPEC-ADDON-131, Home.** Three sections: **Continue writing** (paper cards of the
  notes this viewer opened last), **Notes with sources** (notes that cite a video
  position or a document page, drawn with the source's thumbnail and position), and
  **Recently updated** (rows).
- **SPEC-ADDON-132, Library.** Three panes at desktop width: a rail that classifies by
  folder or by tag, the list of notes, and the selected note rendered for reading. "Edit"
  turns the pane into the Knowledge editor in place; "Done" returns to reading. Under
  the note, its related files and its sources. Below 1024px the Library is the list
  alone, and a note opens on its file page.

The whole-drive connections graph is no longer reached from Notes: on the production drive
the 1,434 recipe clips and their images make it unreadable. The graph stays reachable
centred on one note (`/connections?focus=<id>`), from the pane.

Clips keeps its own app (`clips-app.md`). Putting Clips on the same frame is a separate
spec; nothing on the Clips page changes here.

Agreed design: https://claude.ai/artifact/4vifoHSVwqoHQWC85S91bp, saved in
`docs/process/reviews/feature-notes-app/design/` (`canvas.json` and the `.dc.html`
artboards). The Notes artboards are `Main.dc.html` (Home), `NotesLibrary.dc.html`
(Library, reading) and `NotesLibraryEdit.dc.html` (Library, editing). The two Clips
artboards are for the later spec and are not checked against this change.

Visible decisions of the design, as checkable lines:

- Header, top to bottom: icon tile + "Notes" title + scope line on the left; on the right
  the Target button, then the red "New note" button. Below it the tabs "Home" and
  "Library", the current one underlined in the accent colour.
- Home, top to bottom: "Continue writing" (paper cards in a grid of columns at least 220px
  wide, 4 cards), "Notes with sources" (rows: a 96×54 thumbnail with the position badge at
  its bottom right, the title, one line of excerpt, the source line, the date at the
  right), "Recently updated" (rows: file icon tile, title, one line of excerpt, folder,
  date; a "See in Library ›" link at the section's right).
- Library at 1280px and wider, left to right: rail (220px: a two-segment switch
  "Folders | Tags", then entries with icon, name and count, the selected one filled),
  list (340–380px between hairlines: search field and sort button on top, rows of title +
  date on one line and two lines of excerpt, the selected row filled), pane (the rest).
- Pane, reading: "Edit" (sand pill with a pen icon) and an icon-only "Open the file page"
  link at the top right; the title at 28px; a meta line (folder · updated time · tag
  chips); the rendered body; a hairline, then "Connections" with "Related files N" and
  "Sources N" in columns, and "See this note in the graph ›" at the right.
- Pane, editing: the formatting toolbar on the left of the top row, "Saved" state text,
  a dark "Done" button with a check icon, the "Open the file page" link. The editor fills
  the pane's width and height with padding and no border or frame.

Declared differences between the design and this spec, accepted with it:

- The design's "Notes with sources" has a "See all ›" link. There is no list to send it to
  (the Library has no "has sources" filter), so the section has no such link.
- The design draws the selected note's "Related files" heading; the earlier draft's
  "Links to this note" is not drawn because wiki links are not recorded anywhere.

## Required items

### 1. Normal flow

**Frame (SPEC-ADDON-130).**

1. The viewer opens `/drive/{drive}/addons/knowledge`. The page draws `AppHeader` with
   `icon` NotebookPen, title "Notes", the Target menu, the "New note" action and the tabs.
2. The Target is read from local storage under the app key `{ addon: "knowledge" }`
   (`litloft.addon.knowledge.target.<drive>`). The smart collections and collections of
   the drive are listed in the menu as on the other apps. The chosen target is resolved
   with `resolveAppTarget(folder, ["text"])` (a collection target through the member
   helpers SPEC-CORE-119 opened to addons), and every request below that lists notes
   carries the resolved conditions plus `exclude_origin=webclip`.
3. The scope line shows the drive and, once known, the number of notes in the target:
   the `total` of `files` with the target's conditions, `type=text` and
   `exclude_origin=webclip`.
4. "Home" is the URL without `view`; "Library" is `?view=all`. A tab is a link; switching
   tabs keeps the Target.
5. "New note" opens the quick-note composer for the drive; on the Library with a folder
   selected, for that folder (today's behaviour).

**Home (SPEC-ADDON-131).**

1. **Continue writing.** With a profile: `watch-history?filter=all&type=text&exclude_origin=webclip&limit=4`,
   drawn as up to 4 paper cards (`ContinueCard`). Without a profile the section is not
   drawn. This section does not follow the Target (see Checked, no action).
2. **Notes with sources.** A new Knowledge route, `GET /api/addons/knowledge/notes/with-sources`
   (drive from `X-Lit-Drive`), returns the ids of the notes of that drive that have at
   least one `note_origin_sources` row (at most 500, read from the Knowledge DB alone).
   The page lists those notes that the Target keeps, newest `updated_at` first, through
   the core listing restricted to those ids and the Target's conditions, `type=text` and
   `exclude_origin=webclip`, and takes the first 5. (The listing's `file_ids` widens a
   collection condition rather than narrowing it, so under a collection Target the
   intersection is taken on the ids, not by sending both.) A second new route,
   `POST /api/addons/knowledge/notes/sources` with `{ file_ids }` (at most 60), returns
   for each note its sources in frontmatter `source_file_ids` order, each
   `{ source_file_id, locator }`, keeping only files the core reports active or missing
   on the same drive. The locator comes from the first `loft://<source_file_id>?t=<seconds>`
   or `?page=<n>` link in the note's body, or is `null`. A note with no source left is
   skipped. Each row: the first source's thumbnail with the locator badge (`mm:ss`,
   `h:mm:ss` or `p.N`; no badge when `null`), the note title, one line of its opening
   (`note-openings`), the source line "<source folder> · <locator>" (folder alone when
   `null`), and the note's `updated_at` date. A row opens the note's file page.
3. **Recently updated.** `files` with the target's conditions, `type=text`,
   `exclude_origin=webclip`, `sort=updated_at`, `order=desc`, `limit=5`, drawn as rows
   with their opening, folder and `updated_at` date. "See in Library ›" opens `?view=all`.

**Library (SPEC-ADDON-132).**

1. The rail's switch picks Folders or Tags; the choice is kept in local storage as the
   app's `classification` (`folder` or `tag`). Folders: "All" with the target's total,
   then every folder that directly holds at least one note of the target, with that
   count, in the order of `shelves?by=folder` under the same conditions. Tags: "All",
   then each tag with at least one note of the target, with its count, in the order of
   `shelves?by=tag`. The selection is the URL's `folder` or `tag` (as today).
2. The list shows the notes of the selection: `files` with the target's conditions, the
   selection, `type=text`, `exclude_origin=webclip`, the sort (`sort=` in the URL:
   updated, title, created; default updated) and the list search (`q=` in the URL,
   matched as `search`), 60 per page, more on scrolling to the end. Rows show the title,
   the date of the sort's field (`created_at` under "created", else `updated_at`) and two
   lines of opening.
3. Choosing a row at 1024px and wider sets `note=<file id>` in the URL (replace, not
   push) and shows the note in the pane. With no `note`, the pane shows the first row.
4. The pane fetches the note's content and draws it with the core `MarkdownPreview`, as
   the file page's reading view does, with the meta line from the file's metadata.
5. "Edit" mounts the Knowledge `Editor` (inline mode) for the note in the pane, focused.
   The editor saves as it does on the file page. "Done" unmounts it and the pane fetches
   the content again and shows it read.
6. Under the body: "Related files" from `GET /api/files/{id}/relations` (both directions,
   missing files greyed, trashed ones absent, as that endpoint returns them) and
   "Sources" from `POST /api/addons/knowledge/notes/sources` with the one note's id, as
   in Home step 2. Each entry opens the file (at the locator's `t` or `page`). A column
   with no entry is not drawn; with neither, the section is not drawn.
   "See this note in the graph ›" opens `/drive/{drive}/addons/knowledge/connections?focus=<id>`.
7. Below 1280px the rail becomes a menu button above the list ("Folders: All ⌄" or
   "Tags: <tag> ⌄") offering the same entries. Below 1024px the pane is not drawn: a row
   is a link to the note's file page, and `note=` in the URL is ignored.

### 2. Failure cases

- Target list fails to load: the default target is in force and the menu offers a retry,
  as on the other apps.
- A saved target that is gone or cannot be resolved (unsupported part): the default
  target is in force, the saved id stays (as on the other apps).
- Header count request fails: the scope line shows the drive alone, never `0`.
- Continue writing: `viewer_required` or any failure hides the section.
- `notes/with-sources` fails, or the `files` request after it fails: the section is not
  drawn. Its failure never hides the other two sections.
- A source file is missing (not trashed): the row uses its thumbnail if served, else the
  icon tile; the row is still drawn. A source in trash or on another drive is never used
  as "first source"; a note with no usable source is skipped.
- Recently updated fails: the section shows a retry button.
- Rail count request fails: the rail shows the entries it has without counts and a retry;
  the list is unaffected.
- List request fails: a retry button in the list; rows already drawn stay.
- `note=<id>` names a file that is not in the current list (another drive, trashed, a
  clip, or outside the selection): the pane shows the first row instead and the URL is
  replaced with it.
- Pane content fails to load: the pane shows an error with a retry, and "Edit" is
  disabled. The editor is never mounted for a note whose content is not loaded.
- Editor save fails: the editor's own error state, as on the file page. "Done" while a
  save is failing keeps the editor mounted and shows the error.
- Relations or sources request fails: that column is not drawn.

### 3. States

- Tab: Home | Library. Result view (`?q=` without `view`) is a third page state, not a tab.
- Target: looking up | default | chosen (usable) | chosen but fallen back to default.
- Library layout by viewport: three panes (≥1280) | menu + list + pane (1024–1279) |
  list only (<1024).
- Pane: empty list (nothing to show) | loading | reading | error | editing.
  Transitions: loading → reading | error; reading → editing ("Edit"); editing → loading
  ("Done", after the editor has flushed); any → loading (another note chosen).
- Rail: Folders | Tags; selection All | one folder | one tag.

### 4. Data read and written

- Read: core `files`, `shelves` (`by=folder`, `by=tag`), `watch-history`, `smart-folders`
  and collections, `/api/files/{id}`, `/api/files/{id}/content`,
  `/api/files/{id}/relations`, `/api/files/{id}/thumbnail`.
- Read: Knowledge `note-openings`; new `notes/with-sources` (Knowledge DB tables
  `note_origins` and `note_origin_sources` only) and `notes/sources` (those tables, the
  file states through the Internal API's `files/bulk-state`, and the note's content
  through its existing content read).
- Written: the note's content, only through the existing Knowledge `Editor` save path
  (`PUT /api/files/{id}/content` with its ETag), only after "Edit".
- Local storage: `litloft.addon.knowledge.target.<drive>`,
  `litloft.addon.knowledge.targets.<drive>` (shown targets) and
  `litloft.addon.knowledge.classification.<drive>`.
- No core table or column is added; no migration.

### 5. External services

None. Every call is to the core or to the Knowledge container on the Docker network.

### 6. Authorization

Unchanged. Core routes check drive access (locked drive → 404). The new Knowledge routes
are reached through the addon proxy, which requires `X-Lit-Drive` and checks it against
the caller's accessible drives (scope=drive), and they filter `note_origins` and
`note_origin_sources` by that drive. A source id is returned only when the core reports
the file on the same drive and not in trash.

### 7. Effect on existing features

- The Knowledge `Editor` is mounted in a second place. Its file-page use is unchanged.
- `/connections` stays as it is; only the entry tile on the Notes page goes.
- Global search "See all" for notes (`?q=`) keeps today's results view.
- The bookmarklet's Notes landing (`prefill`) moves to the Clips page (Revises I26).
- The Notes `?view=all&clips=1` toggle goes (Revises I14).
- Home of the drive and the sidebar keep listing Notes from the manifest's navigation.
- `useOverlaySidebar()` is no longer called by the Notes page, so at 1200px and wider the
  sidebar is inline, as on Video and Reading.

### 8. Error behavior

As in item 2. Nothing new is logged in the frontend. The two new Knowledge routes log a
warning when the content read for a note fails and return that entry with `locator: null`
rather than failing the request.

### 9. User-visible behavior

- Texts (en / ja): tabs "Home" / "ホーム", "Library" / "ライブラリ"; sections "Continue
  writing" / "続きを書く", "Notes with sources" / "出典つきメモ", "Recently updated" /
  "最近更新したノート", "See in Library ›" / "ライブラリで見る ›"; rail "Folders" /
  "フォルダ", "Tags" / "タグ", "All" / "すべて"; pane "Edit" / "編集", "Done" / "完了",
  "Connections" / "つながり", "Related files" / "関連ファイル", "Sources" / "出典",
  "See this note in the graph ›" / "このノートを中心にグラフで見る ›"; Target default
  "All notes" / "すべてのノート".
- Ordering as in item 1. Dates in the user's locale as today (`formatNoteTime`).
- Defaults: Home tab; Folders; sort updated; default target.

### 10. Non-functional

- `notes/with-sources` reads no content and returns at most 500 ids. `notes/sources`
  reads at most 60 notes' content per request, each capped by the Internal API's
  `CORE_INTERNAL_CONTENT_MAX_BYTES`; Home asks for 5 at a time, the pane for 1.
- The rail's count requests page `shelves` at its cap (24 shelves per request) and stop at
  200 entries.
- Privacy: no content leaves the Docker network.

## Touch points

- `addons/knowledge/frontend/NotesPage.tsx`, `NotesLanding.tsx`, `AllNotes.tsx`,
  `AllNotesRail.tsx`, `allNotesParams.ts`, `NoteRow.tsx`, `ContinueCard.tsx`, `Page.tsx`,
  and new components for the frame, Home sections, the rail, the list and the pane.
- `addons/knowledge/frontend/Editor.tsx` (mounted in the pane; its flush on file switch and
  unmount is relied on).
- `addons/knowledge/frontend/messages/{en,ja}.json`.
- `addons/knowledge/app/routers/` — two new routes (`GET notes/with-sources`,
  `POST notes/sources`), reading `note_origins`, `note_origin_sources`, file states and
  content through `app/internal_client.py`.
- Core, read only, used as documented addon surface: `components/appshell/AppHeader`,
  `TargetMenu`, `lib/appTarget` (`resolveAppTarget`), `lib/appPrefs`, `useLoad`,
  `useNearEnd`, `PageTabs`, `MarkdownPreview`. No core file is edited.
- Core endpoints read: `files`, `shelves`, `watch-history`, `/api/files/{id}`,
  `/content`, `/relations`, `/thumbnail`.
- Rules: `.claude/rules/design-decisions.md` (drive boundary; tag editing goes through the
  editor's own save; addon discipline: no core-to-addon dependency),
  `.claude/rules/frontend-conventions.md` (DESIGN.md, i18n in the addon's messages,
  Container/Presenter for the new large components), `.claude/rules/internal-api-policy.md`
  (no new Internal API endpoint).
- Docs: `docs/user-guide/notes.md`, `docs/addons/knowledge.md`, `docs/user-guide/search.md`
  (the "See all" target), `docs/user-guide/quick-note.md` if it names the old landing.
- The submodule pointer bump of `addons/knowledge` in the core.

## Invariants

I1. No list, section, rail count or header count on the Notes Home or Library contains a file whose `md_origin` is `webclip`, whatever the Target, selection, sort or URL parameters (`clips=1` included).
I2. With a Target in force, the Library list, its rail counts, the header count, Notes with sources and Recently updated contain only notes that the same Target's resolved conditions with `type=text` return from `files`; with the default Target, every active text file of the drive that is not a clip.
I3. For every rail entry, its count equals the number of rows the list shows, over all its pages and with the list search empty, when that entry is selected under the same Target.
I4. Text typed in the pane's editor is written to the note before the pane shows another note, before "Done" shows the note read, and before the page is left; reading the note afterwards returns that text.
I5. The editor is never mounted for a note whose content failed to load or has not loaded, so no save can write empty or stale content over the note.
I6. Below 1024px the Library never mounts the editor and draws no pane; a row opens the note's file page.
I7. Notes with sources and the pane's Sources list only source files of the current drive that are not in trash, and only notes of the current drive.
I8. `?view=all` with `folder`, `tag`, `sort` and `q` opens the Library with that selection, sort and search; `?q=` without `view` lists every text file matching the query, clips included; `?edit=<id>` redirects as it does today; `/connections?focus=<id>` draws the graph centred on that note.
I9. A saved Target that is gone or cannot be resolved puts the default Target in force and leaves the saved id in storage; choosing a Target writes it under `litloft.addon.knowledge.target.<drive>` and no other app's key.
I10. The header's scope line never shows `0` while its count loads or after its request fails.

## Revises

SPEC-ADDON-101 I14. `clips=1` in a Notes URL is ignored: the Library lists and counts no file whose `md_origin` is `webclip` with or without it.
SPEC-ADDON-101 I21. Rows on the Notes Home and in the Library show the note's `updated_at` date (`created_at` when the Library is sorted by creation); they are not grouped by age.
SPEC-ADDON-101 I26. The bookmarklet snippet opens `/drive/{drive}/addons/knowledge/clips` with `prefill`, `title` and `autosubmit=1`, and the Clips page opened that way has the clip form open and submits it. Notes opened with those parameters replaces its URL with the Clips page and the same parameters, which then behaves the same way.

## Checked, no action

- **Continue writing ignores the Target.** It is the viewer's own recent activity, read
  from `watch-history`, which has no target conditions. Following the Target would need
  either a new core parameter on `watch-history` or a client-side intersection of a
  50-row window, which drops notes silently. Left out; a viewer narrowing to a smart
  collection still sees what they were last writing.
- **Wiki links (`[[...]]`) as "Links to this note".** Not recorded in any table; adding a
  link index is its own feature.
- **The whole-drive graph.** Kept at `/connections` without a Notes entry. Hiding recipe
  clips from it is a separate decision.
- **Clips on the app frame.** A separate spec. It will need its own app key; with
  `{ addon: "knowledge" }` taken by Notes, it uses a distinct key decided there.
- **A "has sources" filter in the Library.** Not needed for the Home section; no "See all"
  on it.
- **Age groups in lists.** Dropped with the agreed design (Revises I21).
- **The phone file page as the editor.** Unchanged: the file page opens in reading and
  "Edit" there is today's behaviour, so the soft keyboard appears only when asked for.
- **Search inside note bodies from the Library list.** The list search matches title and
  folder, as All notes does today; body search is the global search's job.
- **Core changes.** None needed: every core piece used is already on the documented addon
  surface (SPEC-CORE-099, SPEC-CORE-119).
