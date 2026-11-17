# Notes: an app frame, a Home of what you are writing, and a Library you read in place

SPEC-ID: SPEC-ADDON-130
SPEC-ID: SPEC-ADDON-131
SPEC-ID: SPEC-ADDON-132
SPEC-ID: SPEC-CORE-130

Approval:

## Summary

The Notes page of the Knowledge addon (`/drive/{drive}/addons/knowledge`) was built before
the purpose-built apps (Video, Reading, Photo Diary). It has its own header, no Target, a
vertical stack of landing sections and tool tiles, and a separate "All notes" view. This
change puts Notes on the apps' frame and gives its two tabs content that fits notes, which
are text the viewer wrote: they are read, not chosen by a picture.

- **SPEC-ADDON-130, the frame.** The core `AppHeader` with the Notes icon and title, the
  scope line "<drive> · N notes", the shared Target menu, a primary "New note" action and
  two tabs, **Home** and **Library**. The sidebar behaves as on the other apps. The
  landing's search box, the Web clip tile and the Connections tile go. URLs that reach
  Notes today keep landing somewhere sensible (I8).
- **SPEC-ADDON-131, Home.** Three sections: **Continue writing** (paper cards of the
  notes this viewer opened last), **Notes with sources** (notes that cite a video
  position or a document page, drawn with the source's thumbnail and position), and
  **Recently updated** (rows).
- **SPEC-ADDON-132, Library.** Three panes at desktop width: a rail that classifies by
  folder or by tag, the list of notes, and the selected note shown for reading. "Edit"
  turns the pane into the Knowledge editor in place; "Done" returns to reading. Under
  the note, its related files and its sources. Below 1024px the Library is the list
  alone and a note opens on its file page.
- **SPEC-CORE-130, folder counts under the listing's filters.** `folder-counts` accepts
  the same filters as the file listing, and gains a `POST …/query` form that takes file
  ids, so a rail can count exactly the notes its list shows under any Target.

The whole-drive connections graph is no longer reached from Notes: on the production drive
the 1,434 recipe clips and their images make it unreadable. The graph stays reachable
centred on one note (`/connections?focus=<id>`), from the pane.

Clips keeps its own app (`clips-app.md`). Putting Clips on the same frame is a separate
spec; nothing on the Clips page changes here.

Agreed design: https://claude.ai/artifact/4vifoHSVwqoHQWC85S91bp, saved in
`docs/process/reviews/feature-notes-app/design/` (`canvas.json` and the `.dc.html`
artboards). The Notes artboards are `Main.dc.html` (Home), `NotesLibrary.dc.html`
(Library, reading) and `NotesLibraryEdit.dc.html` (Library, editing). The two Clips
artboards belong to the later spec and are not checked against this change.

Visible decisions of the design, as checkable lines:

- Header, top to bottom: icon tile + "Notes" title + scope line on the left; on the right
  the Target button, then the red "New note" button. Below it the tabs "Home" and
  "Library", the current one underlined in the accent colour.
- Home, top to bottom: "Continue writing" (paper cards in a grid of columns at least 220px
  wide, up to 4 cards), "Notes with sources" (rows: a 96×54 thumbnail with the position
  badge at its bottom right, the title, one line of excerpt, the source line, the date at
  the right), "Recently updated" (rows: file icon tile, title, one line of excerpt,
  folder, date; "See in Library ›" at the section's right).
- Library at 1280px and wider, left to right: rail (220px: a two-segment switch
  "Folders | Tags", then entries with icon, name and count, the selected one filled),
  list (340–380px between hairlines: search field and sort button on top, rows of title +
  date on one line and two lines of excerpt, the selected row filled), pane (the rest).
- Pane, reading: "Edit" (sand pill with a pen icon) and an icon-only "Open the file page"
  link at the top right; the title at 28px; a meta line (folder · updated time · tag
  chips); the body; a hairline, then "Connections" with "Related files N" and
  "Sources N" in columns, and "See this note in the graph ›" at the right.
- Pane, editing: a top row with the save state text ("Saved"), a dark "Done" button with
  a check icon and the "Open the file page" link; the editor fills the pane's width and
  height with padding and no border or frame.

Declared differences between the design and this spec, accepted with it:

- **Notes with sources has no "See all ›".** The Library has no "has sources" filter to
  send it to.
- **The editing pane's formatting toolbar is a second row.** The design puts the toolbar
  on the top row. The Knowledge editor draws its toolbar itself, below the host's row,
  as it does on the file page; moving it would change the editor (see SPEC-ADDON-132 I12).

## Required items

### 1. Normal flow

**Frame (SPEC-ADDON-130).**

1. The viewer opens `/drive/{drive}/addons/knowledge`. The page draws `AppHeader` with the
   NotebookPen icon, title "Notes", the Target menu, the "New note" action and the tabs.
   The page no longer calls `useOverlaySidebar()`, so at 1200px and wider the sidebar is
   inline, as on Video and Reading.
2. The Target follows the pattern `docs/ADDON-DEVELOPMENT.md` documents for an addon app,
   with `APP = { addon: "knowledge" }` and `BASE_KINDS = ["text"]`: a Smart Collection
   resolves through `resolveAppTarget`, a collection through `resolveCollectionTarget`,
   and a Smart Collection with free text is a member target (`resolveMemberTarget` +
   `useMemberTarget`) whose ids are sent through the `POST …/query` routes instead of
   conditions. The saved id lives under `litloft.addon.knowledge.target.<drive>`.
   Every request below that lists or counts notes carries the target (conditions, or ids
   for a member target), `type=text` and `exclude_origin=webclip`. A target that resolves
   to `empty` puts the empty state on Home and Library and the count `0` in the scope line.
3. The scope line shows the drive and, once known, "N notes": the `total` of `files` with
   the target, `type=text` and `exclude_origin=webclip`.
4. "Home" is the URL without `view`; "Library" is `?view=all`. A tab is a link (history
   push); the Target is kept in storage, not in the URL, so it survives tab switches.
5. "New note" opens the quick-note composer for the drive; on the Library with a folder
   selected, for that folder (today's behaviour).
6. Old entry URLs:
   - `?q=<query>` without `view` (global search "See all" for notes, and the old landing
     search) replaces its URL with `?view=all&q=<query>`.
   - `?edit=<id>` redirects as it does today (`Page.tsx`).
   - `?prefill=…` (with `title`, `autosubmit`) replaces its URL with
     `/drive/{drive}/addons/knowledge/clips` and the same query string.
   - `?view=all&clips=1` opens the Library; `clips` is ignored.
   - `/connections` and `/connections?focus=<id>` are unchanged.

**Home (SPEC-ADDON-131).**

1. **Continue writing.** With a profile: `watch-history?filter=all&type=text&exclude_origin=webclip&limit=4`,
   drawn as up to 4 paper cards (`ContinueCard`) with their opening (`note-openings`).
   Without a profile, or with no rows, the section is not drawn. It does not follow the
   Target (Checked, no action).
2. **Notes with sources.**
   - A new Knowledge route `GET /api/addons/knowledge/notes/with-sources` (drive from
     `X-Lit-Drive`) returns `{ ids: [...] }`: the `note_file_id` of every `note_origins`
     row of that drive that has at least one `note_origin_sources` row, read from the
     Knowledge DB alone, in no particular order, at most 5,000.
   - The page walks the notes of the Target, newest `updated_at` first, through the same
     `files` request as Recently updated (60 per page, at most 3 pages), keeps those whose
     id is in that set, and stops at 5.
   - A second new route `POST /api/addons/knowledge/notes/sources` with `{ file_ids }`
     returns `{ notes: { <note id>: [ { source_file_id, title, folder_path, kind, state,
     locator } ] } }` for those 5 (step "Sources" below).
   - A note left with no source is skipped; fewer than 5 rows are drawn as they are; with
     none, the section is not drawn.
   - Each row: the first source's thumbnail (`/api/files/{id}/thumbnail`), or the kind's
     icon tile when it has none, with the locator badge at its bottom right; the note
     title; one line of opening; the source line "<source folder> · <locator>" (folder
     alone when the locator is `null`; "Drive root" for the root); the note's `updated_at`
     date. The row opens the note's file page.
3. **Recently updated.** `files` with the target, `type=text`, `exclude_origin=webclip`,
   `sort=updated_at`, `order=desc`, `limit=5`, drawn as rows with their opening, folder and
   `updated_at` date. "See in Library ›" opens `?view=all`.

**Sources (shared by Home and the pane).** For each requested note of the request's
drive, `POST notes/sources`:

1. reads the note's frontmatter `source_file_ids` and body through the Internal API's
   `GET /api/internal/files/{id}/content`, and
   the states of those ids through the Internal API's `POST /files/bulk-state`;
2. lists the sources in `source_file_ids` order, keeping ids whose file is active or
   missing on the same drive; trashed, purged and other-drive ids are dropped;
3. sets each source's `locator` from the first link in the body of the form
   `loft://<source id>?t=<seconds>` (`{ "t": <seconds> }`) or `?page=<n>`
   (`{ "page": <n> }`), else `null`;
4. when the content read fails, uses the `note_origin_sources` rows of that note ordered
   by `source_file_id`, every `locator` `null`, and logs a warning;
5. answers 422 for an empty list or more than 60 ids; ids that are not notes of the drive
   are left out of `notes`.

The locator badge reads `m:ss` or `h:mm:ss` for `t`, and "p. N" (ja "N ページ") for `page`.

**Library (SPEC-ADDON-132).**

1. **Rail.** A switch "Folders | Tags". The segment shown is the URL's: `tag` present →
   Tags; `folder` present → Folders; neither → the stored choice
   (`litloft.addon.knowledge.classification.<drive>`, `folder` or `tag`, read and written
   by the addon itself). Switching segment writes the choice and clears both `folder` and
   `tag` (history push). With both `folder` and `tag` in the URL, Tags is shown and
   `folder` is dropped from the URL (replace).
   - Folders: "All" with the target's total, then each exact `folder_path` holding at
     least one note of the target, with its count, ordered by path, from SPEC-CORE-130's
     `folder-counts` with the target, `type=text`, `exclude_origin=webclip`. The root is
     labelled "Drive root".
   - Tags: "All", then each tag with its count, from `shelves?by=tag` (`POST
     shelves/query` for a member target) with the same conditions, paged at 24 shelves,
     in that endpoint's order. The untagged shelf is not an entry.
   - At most 200 entries are drawn. A selected entry beyond them is drawn after them.
2. **List.** `files` (or `POST files/query`) with the target, the selection (`path=` for
   a folder, `tag=` for a tag), `type=text`, `exclude_origin=webclip`, the sort (`sort=`:
   `updated` default, `title`, `created`) and the list search (`q=`, sent as `search`),
   60 per page, the next page on scrolling to the end (`useNearEnd`). The search applies
   on submit; sort, selection and search change the URL by history push. Rows show the
   title, the date of the sort's field (`created_at` under `created`, else `updated_at`)
   and two lines of opening.
3. **Choosing a note.** At 1024px and wider, choosing a row sets `note=<file id>` (history
   replace) and shows it in the pane. With no `note`, the pane shows the first row. A
   `note` that is not among the loaded rows is looked up with `/api/files/{id}`: if it is
   an active text file of the drive that is not a clip, it is shown though its row is not
   loaded; otherwise the first row is shown and `note` is replaced with it.
4. **Reading.** The pane fetches the note's metadata and content and draws them as the
   file page does: `MarkdownPreview` for Markdown, `TextPreview` for a plain-text file;
   the meta line from the metadata.
5. **Edit.** Offered on the same rule as the file page's editor: a Markdown file, or a
   `text/plain` file the core marks as a plain-text document. "Edit" mounts the Knowledge
   `Editor` in inline mode (plain-text mode for the latter) inside a
   `MarkdownChromeProvider` the pane supplies, with the view mode fixed to `edit`, so the
   editor draws no header of its own and publishes its save state to the pane's row.
6. **Done.** When the editor's latest text has been acknowledged by a save (status
   `saved`, or no change since the last save), the pane unmounts the editor and shows that
   text read. While a save is in flight it waits. On `error` or `conflict` it keeps the
   editor and the editor's message. The same rule runs before the pane shows another
   note, before a tab, Target, selection, sort or search change, and before "Open the
   file page"; if the save fails, that change does not happen.
7. **Connections.** Under the body: "Related files" from `GET /api/files/{id}/relations`
   (missing files greyed, trashed absent, as that endpoint returns them) and "Sources"
   from `POST notes/sources` with this note. An active source opens its file page at its
   locator (`?t=` or `?page=`); a missing one is drawn greyed and is not a link. A column
   with no entry is not drawn; with neither, the section is not drawn. "See this note in
   the graph ›" opens `/drive/{drive}/addons/knowledge/connections?focus=<id>`.
8. **After Done.** The list and the rail are requested again; rows already drawn stay
   until the answer.
9. **Narrow widths.** Below 1280px the rail is a menu button above the list ("Folders:
   All ⌄", "Tags: <tag> ⌄") with the same entries and switch. Below 1024px the pane is
   not drawn, a row is a link to the note's file page, and `note` is ignored. A viewport
   that narrows below 1024px while the editor is mounted keeps the pane until Done.

**Folder counts (SPEC-CORE-130).**

1. `GET /api/drives/{drive}/folder-counts` accepts every query parameter of `GET
   /api/drives/{drive}/files` that filters (`FileFiltersQuery`), applied through
   `filtered_drive_files` with the same meaning.
2. `POST /api/drives/{drive}/folder-counts/query` takes the same parameters and a
   `FileIdsQuery` body, joining `collection` in the `in:` condition as `files/query` does.
3. Both answer `[{ path, count }]`: active files per exact `folder_path` over the set the
   files listing returns for the same parameters, ordered by path.
4. A request with only `type`, `origin` or `exclude_origin` answers as before.
5. `docs/reference/api.md` and the addon surface table in `docs/ADDON-DEVELOPMENT.md` list
   the new parameters and route.

### 2. Failure cases

- Smart Collections or collections fail to load: the default target is in force and the
  menu offers a retry, as on the other apps.
- A saved target that is gone or cannot be resolved: the default target is in force; the
  saved id stays.
- A member target whose evaluation fails: as `useMemberTarget` does for the other apps
  (the default target, with the menu's unavailable label).
- Header count fails: the scope line shows the drive alone.
- Continue writing fails, or answers `viewer_required`: the section is not drawn.
- Notes with sources: `with-sources`, the walk or `notes/sources` fails → the section is
  not drawn. The other sections are unaffected.
- Recently updated fails: a retry button where its rows go.
- Rail counts fail: the entries it has are drawn without counts, with a retry; the list
  is unaffected.
- List fails: a retry button; rows already drawn stay.
- Pane metadata or content fails: an error with a retry; "Edit" is not offered.
- Editor save fails or conflicts: the editor's own message in the pane; Done and every
  change in Library step 6 wait or stay as stated there.
- Relations or sources fail: that column is not drawn.
- `POST notes/sources` with an empty list or more than 60 ids: 422. The Knowledge DB
  unavailable: 503, which the page treats as a failure above.
- `folder-counts` with an invalid parameter: 422, as `files` answers it.

### 3. States

- **Page.** Home | Library. Allowed: either to the other by a tab. A `?q=`, `?prefill=`
  or `?edit=` URL is not a state; it is replaced on arrival (frame step 6).
- **Target.** looking up → default | chosen | fallen back. Allowed: any → looking up when
  the viewer chooses; fallen back → chosen when the saved target becomes usable again.
  Not allowed: a request that lists notes while looking up.
- **Library layout** by viewport: three panes (≥1280) | menu + list + pane (1024–1279) |
  list only (<1024). Follows the viewport, except that an editing pane stays (step 9).
- **Rail.** Folders | Tags × All | one entry. Switching segment → All.
- **Pane.** none (the list is empty) | loading | reading | error | editing | waiting
  (Done or a change in step 6 asked, save in flight). Allowed: none → loading when rows
  arrive; loading → reading | error; error → loading (retry); reading → editing (Edit);
  reading → loading (another note); editing → waiting; waiting → reading | loading (save
  acknowledged) | editing (save failed or conflicted). Not allowed: loading, error or
  none → editing; editing → loading without passing waiting.

### 4. Data read and written

- Read: core `files` and `files/query`, `shelves` and `shelves/query` (`by=tag`),
  `folder-counts` and `folder-counts/query`, `watch-history`, `smart-folders`,
  collections and member evaluation, `/api/files/{id}`, `/content`, `/relations`,
  `/thumbnail`.
- Read: Knowledge `note-openings`; new `notes/with-sources` (Knowledge DB tables
  `note_origins` and `note_origin_sources` only) and `notes/sources` (those tables, plus
  file states and content through the Internal API).
- Written: the note's content, only through the Knowledge `Editor`'s save
  (`PUT /api/files/{id}/content` with its ETag), only after "Edit".
- Local storage: `litloft.addon.knowledge.target.<drive>`,
  `litloft.addon.knowledge.targets.<drive>`, `litloft.addon.knowledge.classification.<drive>`.
- No table or column is added; no migration.

### 5. External services

None. Every call is to the core or to the Knowledge container on the Docker network.

### 6. Authorization

Unchanged. Core routes check drive access (a locked drive is 404). `folder-counts` keeps
`_validate_drive`. The new Knowledge routes go through the addon proxy, which requires
`X-Lit-Drive` and checks it against the caller's accessible drives (scope=drive); they
filter `note_origins` and `note_origin_sources` by that drive, and `notes/sources` drops
any source the core does not report on the same drive.

### 7. Effect on existing features

- The Knowledge `Editor` is mounted in a second place, with a chrome provider, as
  `MarkdownDocumentLayout` mounts it on the file page. `Editor.tsx` is not edited.
- `/connections` is unchanged; only the Notes tile that led to it goes.
- Global search "See all" for notes lands on the Library search (Revises I15, I22).
- The bookmarklet's Notes landing forwards to Clips (Revises I26).
- The `clips=1` toggle goes (Revises I14).
- `folder-counts` callers that send no new parameter get the same answer.
- The drive Home and the sidebar keep listing Notes from the manifest's navigation.
- Core tests that inventory addon files name `AllNotes.tsx` and the e2e fixture
  `notesAllClipsToggle.tsx` imports it; they are updated with the addon change (Touch
  points).

### 8. Error behavior

As in item 2. The frontend logs nothing new. `notes/sources` logs a warning naming the
note id when its content read fails.

### 9. User-visible behavior

Texts (en / ja):

| Where | en | ja |
|---|---|---|
| Title | Notes | ノート |
| Scope | {drive} · {count} notes | {drive} · {count} 件 |
| Target default | All notes | すべてのノート |
| Action | New note | 新しいノート |
| Tabs | Home / Library | ホーム / ライブラリ |
| Home sections | Continue writing / Notes with sources / Recently updated | 続きを書く / 出典つきメモ / 最近更新したノート |
| Link | See in Library › | ライブラリで見る › |
| Rail | Folders / Tags / All / Drive root | フォルダ / タグ / すべて / ドライブ直下 |
| Rail menu (narrow) | Folders: {name} / Tags: {name} | フォルダ: {name} / タグ: {name} |
| List | Search {folder or "notes"} / Updated / Title / Created | {folder か「ノート」} を検索 / 更新順 / タイトル順 / 作成順 |
| Pane | Edit / Done / Open the file page / Saved / Saving… | 編集 / 完了 / ファイル画面で開く / 保存済み / 保存中… |
| Connections | Connections / Related files {n} / Sources {n} / See this note in the graph › | つながり / 関連ファイル {n} / 出典 {n} / このノートを中心にグラフで見る › |
| Badge | p. {n} | {n} ページ |
| Retry | Try again | 再試行 |
| Empty, drive | No notes yet | まだノートがありません |
| Empty, selection | No notes here | ここにはノートがありません |

- The empty drive or empty target replaces the tab content with the "No notes yet"
  state (`EmptyState`), header and tabs drawn. An empty Library selection shows "No notes
  here" in the list and no pane.
- Loading: each Home section and the list draw the skeleton rows the other apps draw;
  the pane draws a skeleton title and three lines.
- Ordering and dates as in item 1, in the viewer's locale (`formatNoteTime`).
- Defaults: Home; Folders; sort `updated`; the default target.

### 10. Non-functional

- `notes/with-sources` reads no content and returns at most 5,000 ids. `notes/sources`
  reads at most 60 notes' content per request, each capped by
  `CORE_INTERNAL_CONTENT_MAX_BYTES`; Home asks for 5, the pane for 1.
- Notes with sources walks at most 3 pages of 60.
- The rail pages `shelves` at 24 shelves and draws at most 200 entries.
- `folder-counts` with filters runs one grouped query over the filtered set.
- Privacy: no content leaves the Docker network.

## Touch points

- Knowledge frontend: `NotesPage.tsx`, `NotesLanding.tsx`, `AllNotes.tsx`,
  `AllNotesRail.tsx`, `allNotesParams.ts`, `NoteRow.tsx`, `ContinueCard.tsx`, `Page.tsx`,
  `ClipSection.tsx`'s use on the Notes page, `NoteSearchScope.tsx` (its `seeAllHref`),
  new frame, Home, rail, list and pane components (Container/Presenter), and
  `messages/{en,ja}.json`.
- Knowledge frontend, mounted not edited: `Editor.tsx`, `MediaCaptureAction.tsx`.
- Knowledge backend: a new router with `GET /notes/with-sources` and
  `POST /notes/sources`, using `app/internal_client.py` (content read, `bulk-state`).
- `addons/knowledge/manifest.json`: two `proxy.routes` entries, `/notes/with-sources`
  (GET) and `/notes/sources` (POST), neither `drive_optional`.
- Knowledge tests retired or rewritten under the Revises lines: `notesLeaveClipsOut.test.tsx`
  (I14, I15), `NotesPage.test.tsx` (the tool tiles), `NoteSearchScope.test.tsx` (I22).
- Core backend: `backend/app/routers/drives.py` (`folder-counts` filters and
  `folder-counts/query`), its tests.
- Core frontend: `frontend/src/lib/api.ts` (`getFolderCounts` with filters, and a
  `…WithFileIds` form), read-only use of `components/appshell/*`, `TargetMenu`,
  `lib/appTarget`, `lib/memberTarget`, `lib/appPrefs` (`readAppTarget`/`writeAppTarget`),
  `useLoad`, `useNearEnd`, `PageTabs`, `MarkdownPreview`, `TextPreview`,
  `lib/markdownChromeContext`, `EmptyState`.
- Core tests that inventory addon frontend files: `components/__tests__/toolbarMenuHome.test.ts`,
  `__tests__/escape-listeners.test.ts`, `__tests__/line-clamp-display.test.ts`,
  `__tests__/page-container-width.test.ts`, and the e2e fixture
  `e2e-components/fixtures/notesAllClipsToggle.tsx` with `notes-all-clips-toggle.spec.ts`,
  `fixtures/app.tsx`, `spec-viewport.spec.ts`, `componentFixtureParity.test.tsx`. Merge
  order: the Knowledge PR first, then the core PR with the submodule bump and these lists.
- Rules: `.claude/rules/design-decisions.md` (drive boundary; tag editing through the
  editor's save; no core-to-addon dependency), `.claude/rules/frontend-conventions.md`,
  `.claude/rules/backend-conventions.md`, `.claude/rules/internal-api-policy.md` (no new
  Internal API endpoint).
- Docs: `docs/user-guide/notes.md`, `docs/addons/knowledge.md`, `docs/user-guide/search.md`,
  `docs/user-guide/quick-note.md` if it names the old landing, `docs/reference/api.md`,
  `docs/ADDON-DEVELOPMENT.md` (surface table: `folder-counts` filters,
  `MarkdownPreview`, `TextPreview`, `useNearEnd`, `markdownChromeContext`).
- The `addons/knowledge` submodule pointer in the core.

## Invariants

I1. No list, section, rail count or header count on Notes Home or Library contains a file whose `md_origin` is `webclip`, whatever the Target, selection, sort or URL parameters, `clips=1` included.
I2. Every note the Library list, Recently updated and Notes with sources show, and every note counted by the header and the rail, is one the `files` listing returns for the same Target with `type=text` and `exclude_origin=webclip`; under the default Target the header count equals that listing's `total` for every active text file of the drive that is not a clip.
I3. For every rail entry, its count equals the number of rows the list shows over all its pages, with the list search empty, when that entry is selected under the same Target, member targets included.
I4. Before the pane shows the note read after Done, shows another note, or lets a tab, Target, selection, sort, search or "Open the file page" change take effect, the editor's latest text has been acknowledged by a save; reading the note's content afterwards returns that text. On a failed or conflicting save none of those happen and the editor stays mounted.
I5. The editor is never mounted for a note whose metadata or content failed to load or has not loaded.
I6. Below 1024px choosing a row opens the note's file page, and the Library offers no "Edit".
I7. Notes with sources and the pane's Sources show only source files of the current drive that are active or missing, and only notes of the current drive; a missing source is not a link.
I8. `?view=all` with `folder`, `tag`, `sort` and `q` opens the Library with that selection, sort and search; `?q=<x>` without `view` lands on `?view=all&q=<x>`; `?edit=<id>` redirects as it does today; `?prefill=…` lands on the Clips page with the same query string; `/connections?focus=<id>` draws the graph centred on that note.
I9. Choosing a Target writes `litloft.addon.knowledge.target.<drive>` and no other app's key; a saved Target that is gone or cannot be resolved puts the default Target in force and leaves the saved id stored.
I10. The scope line never shows `0` while its count loads or after its request fails; it shows `0` only for an empty target or a drive with no notes.
I11. A source's locator badge comes from the first `loft://<source id>?t=` or `?page=` link in the note's body; a source with no such link has no badge, and a note whose content cannot be read lists its sources with no badge.
I12. The file page's editor draws, saves and behaves as before this change: `Editor.tsx` is not edited, and the pane mounts it the way `MarkdownDocumentLayout` does.
I13. At 1200px and wider the sidebar is inline on every Notes page, as on Video and Reading.
I14. `folder-counts` with only `type`, `origin` or `exclude_origin`, or none, answers the same paths and counts as before; with any filter, each `count` equals the number of files the `files` listing returns for the same parameters plus `path=<that path>`.

## Revises

SPEC-ADDON-101 I14. `clips=1` in a Notes URL is ignored: the Library lists and counts no file whose `md_origin` is `webclip` with or without it.
SPEC-ADDON-101 I15. The Notes Library search (`?view=all&q=`) lists notes whose title or folder matches the query, and no file whose `md_origin` is `webclip`.
SPEC-ADDON-101 I21. Rows on Notes Home and in the Library show the note's `updated_at` date, or `created_at` when the Library is sorted by creation; they are not grouped by age.
SPEC-ADDON-101 I22. The global search's "See all" for notes opens the Notes Library with `q` set to the query; it lists the notes matching it, clips excluded.
SPEC-ADDON-101 I26. The bookmarklet snippet opens `/drive/{drive}/addons/knowledge/clips` with `prefill`, `title` and `autosubmit=1`, and the Clips page opened that way has the clip form open and submits it. Notes opened with those parameters replaces its URL with the Clips page and the same query string, which then behaves the same way.

## Checked, no action

- **Continue writing ignores the Target.** It is the viewer's own recent activity, read
  from `watch-history`, which takes no target conditions. Following the Target would need
  a new core parameter or a client-side intersection of a 50-row window that silently
  drops notes.
- **Wiki links (`[[...]]`) as "Links to this note".** Not recorded in any table; a link
  index is its own feature.
- **The whole-drive graph.** Kept at `/connections` without a Notes entry; hiding recipe
  clips from it is a separate decision.
- **Clips on the app frame.** A separate spec, with its own app key (Notes takes
  `{ addon: "knowledge" }`).
- **A "has sources" filter in the Library.** Not needed; the Home section has no "See all".
- **Leaving the page or closing the tab while editing.** The editor's own unmount write
  covers navigation, as on the file page; a closed tab is not covered there either.
- **WebSocket refresh.** The other apps do not refresh lists on `files.*` events; nor
  does Notes. The list refreshes after Done (Library step 8).
- **Body search in the Library.** The list search matches title and folder, as All notes
  does; body search is the global search's.
- **`folder-counts` for subtrees.** The rail counts exact folders, as All notes does
  (F-9); a subtree view is Video's Library and not needed here.
