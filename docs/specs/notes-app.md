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
  Notes today land on the matching place (I8).
- **SPEC-ADDON-131, Home.** Three sections: **Continue writing** (paper cards of the notes
  this viewer opened last), **Notes with sources** (notes that cite a video position or a
  document page, drawn with the source's thumbnail and position) and **Recently updated**
  (rows).
- **SPEC-ADDON-132, Library.** Three panes at desktop width: a rail that classifies by
  folder or by tag, the list of notes, and the selected note shown for reading. "Edit"
  turns the pane into the Knowledge editor in place; "Done" returns to reading. Under the
  note, its related files and its sources. Below 1024px the Library is the list alone and
  a note opens on its file page. To leave the editor safely, the Knowledge editor gains an
  optional handle that reports unsaved text and saves on demand; the file page does not
  pass it.
- **SPEC-CORE-130, folder counts under the listing's filters.** `folder-counts` accepts
  the file listing's filters and gains a `POST …/query` form that takes file ids, so the
  rail counts exactly the notes its list shows under any Target.

The whole-drive connections graph is no longer reached from Notes: on the production drive
the 1,434 recipe clips and their images make it unreadable. The graph stays reachable
centred on one note (`/connections?focus=<id>`), from the pane.

Clips keeps its own app (`clips-app.md`). Putting Clips on the same frame is a separate
spec; nothing on the Clips page changes here (I17).

Agreed design: https://claude.ai/artifact/4vifoHSVwqoHQWC85S91bp, saved in
`docs/process/reviews/feature-notes-app/design/`. The Notes artboards are `Main.dc.html`
(Home, 1440), `NotesLibrary.dc.html` (Library reading, 1440), `NotesLibraryEdit.dc.html`
(Library editing, 1440) and `NotesLibraryPhone.dc.html` (Library, 390). The two Clips
artboards belong to the later spec and are not checked against this change.

Visible decisions of the design, as checkable lines:

- Header, top to bottom: icon tile + "Notes" title + scope line on the left; on the right
  the Target button, then the red "New note" button (below the tabs on a phone, full
  width). Below it the tabs "Home" and "Library", the current one underlined in the
  accent colour.
- Home, top to bottom: "Continue writing": paper cards in a grid of columns at least
  220px wide, up to 4; each card a 132px paper area (a white sheet on the elevated
  surface showing the opening) above the title and "folder · time". "Notes with sources":
  rows of a 96×54 thumbnail with the position badge at its bottom right, the title, one
  line of opening, the source line, the date at the right. "Recently updated": rows of a
  36px file icon tile, title, one line of opening, folder, date; "See in Library ›" at the
  section's right.
- Library at 1280px and wider, left to right: rail (220px: a two-segment switch
  "Folders | Tags", then entries with icon, name and count, the selected one filled),
  list (340–380px between hairlines: search field and sort button on top; rows of title +
  date on one line and two lines of opening; the selected row filled), pane (the rest).
- Pane, reading: "Edit" (sand pill with a pen icon) and an icon-only "Open the file page"
  link at the top right; the title at 28px; a meta line (folder · updated time · tag
  chips); the body, at most 680px wide; a hairline, then "Connections" with "Related
  files N" and "Sources N" in columns, and "See this note in the graph ›" at the right.
- Pane, editing: a top row with the save state text, a dark "Done" button with a check
  icon and the "Open the file page" link; the editor fills the pane's width and height
  with padding and no border or frame.
- Phone (390): header and tabs, the full-width "New note", then a row with the rail
  menu button ("Folders: <name> ⌄") and the sort button, the search field, and the list
  rows edge to edge.

Declared differences between the design and this spec, accepted with it:

- **Notes with sources has no "See all ›".** The Library has no "has sources" filter to
  send it to.
- **The editing pane's formatting toolbar is a second row.** The Knowledge editor draws
  its toolbar itself, below the host's row, as it does on the file page.
- **States without an artboard** (the Tags rail, 1024–1279px with the rail as a menu,
  empty, error and loading) are built from the existing components named in item 9, and
  are accepted without a design.

## Required items

### 1. Normal flow

**Frame (SPEC-ADDON-130).**

1. The viewer opens `/drive/{drive}/addons/knowledge`. The page draws `AppHeader` with the
   NotebookPen icon, title "Notes", the Target menu, the "New note" action and the tabs.
   It does not call `useOverlaySidebar()`, so at 1200px and wider the sidebar is inline.
2. The Target follows the addon-app pattern in `docs/ADDON-DEVELOPMENT.md` with
   `APP = { addon: "knowledge" }` and `BASE_KINDS = ["text"]`: a Smart Collection
   resolves through `resolveAppTarget`, a collection through `resolveCollectionTarget`,
   and a Smart Collection with free text is a member target (`resolveMemberTarget` +
   `useMemberTarget`) whose ids go through the `POST …/query` routes instead of
   conditions. Its saved id is `litloft.addon.knowledge.target.<drive>`. Every request
   below that lists or counts notes carries the target, `type=text` and
   `exclude_origin=webclip`. A target that resolves to `empty` draws the empty state.
3. The scope line shows the drive and, once known, "N notes": the `total` of `files` with
   the target, `type=text` and `exclude_origin=webclip`.
4. "Home" is the URL without `view`; "Library" is `?view=all`. A tab is a link (history
   push). The Target lives in storage, so it survives tab switches.
5. "New note" opens the quick-note composer for the drive, preselecting the Library's
   selected folder when one is selected.
6. Entry URLs:
   - `?q=<query>` without `view` replaces its URL with `?view=all&q=<query>`.
   - `?edit=<id>` keeps `Page.tsx`'s rule: with the inline editor flag on and the file a
     Markdown or text file, it replaces the URL with the file page in edit mode;
     otherwise it draws Home.
   - `?prefill=…` replaces its URL with `/drive/{drive}/addons/knowledge/clips` and the
     same query string.
   - `?view=all&clips=1` opens the Library; `clips` is ignored.
   - `/connections` and `/connections?focus=<id>` are unchanged.
7. **Empty.** When the scope line's total is `0` (a drive with no notes, or an empty
   target), Home and Library draw the "No notes yet" state under the header and tabs,
   and nothing else, Continue writing included.

**Home (SPEC-ADDON-131).**

1. **Continue writing.** With a profile: `watch-history?filter=all&type=text&exclude_origin=webclip&limit=4`,
   drawn as up to 4 paper cards with their opening (`note-openings`). A card opens the
   note's file page. Without a profile, with no rows, or on failure, the section is not
   drawn. It does not follow the Target (Checked, no action).
2. **Notes with sources.**
   - A new Knowledge route `GET /api/addons/knowledge/notes/with-sources` (drive from
     `X-Lit-Drive`) returns `{ ids }`: the `note_file_id` of every `note_origins` row of
     that drive with at least one `note_origin_sources` row, read from the Knowledge DB
     alone.
   - The page walks the target's notes newest `updated_at` first, through the same
     `files` request as Recently updated with `limit=60` (at most 3 pages), keeping those
     in `ids`, and stops at 5 candidates.
   - It asks `POST notes/sources` for those candidates. A candidate with no source in the
     answer is dropped. The rows left are drawn in walk order; with none, the section is
     not drawn.
   - Each row: the first source's thumbnail when its `has_thumbnail` is true, else a 96×54
     tile with the icon of its kind (the listing's `FileKind` from its `mime_type`); the
     locator badge at the thumbnail's bottom right; the note title; one line of opening;
     the source line "<source folder> · <locator>" (the folder alone when the locator is
     `null`; "Drive root" for the root); the note's `updated_at` date. The row opens the
     note's file page.
3. **Recently updated.** `files` with the target, `type=text`, `exclude_origin=webclip`,
   `sort=updated_at`, `order=desc`, `limit=5`, drawn as rows with their opening, folder
   and `updated_at` date. A row opens the note's file page. "See in Library ›" opens
   `?view=all`.

**Sources (`POST /api/addons/knowledge/notes/sources`, shared by Home and the pane).**

1. Body `{ file_ids }`. An empty list or more than 60 ids is 422.
2. For each id, the route first looks up a `note_origins` row with that `note_file_id`
   and the request's drive. An id without one is left out of the answer and its content
   is never read.
3. For a note it keeps, it reads the content through the Internal API's
   `GET /api/internal/files/{id}/content` and takes the frontmatter `source_file_ids`
   in order. When the read fails, it uses that note's `note_origin_sources` rows ordered
   by `source_file_id`, and logs a warning naming the note.
4. It asks the Internal API's `POST /files/bulk` for those source ids and keeps only the
   files it returns (active) whose `drive` is the request's drive.
5. Each kept source is `{ source_file_id, title, filename, folder_path, mime_type,
   has_thumbnail, locator }`, with `locator` from the first link in the body of the form
   `loft://<source id>?t=<seconds>` (`{ "t": <seconds> }`) or `?page=<n>`
   (`{ "page": <n> }`), else `null` (always `null` when the content read failed).
6. Answer `{ notes: { <note id>: [source, …] } }`, a note with no kept source mapping to
   `[]`. A failure of `/files/bulk` or of the Knowledge DB is 503.

The badge and the source line write a locator `t` as `m:ss` (under an hour) or `h:mm:ss`,
and `page` as "p. N" (ja "N ページ").

**Library (SPEC-ADDON-132).**

1. **Rail.** A switch "Folders | Tags". The segment shown: `tag` in the URL → Tags;
   `folder` → Folders; neither → the stored choice
   (`litloft.addon.knowledge.classification.<drive>`, `folder` or `tag`, read and written
   by the addon). Choosing a segment writes the choice and removes `folder`, `tag` and
   `note` from the URL (push). With both `folder` and `tag` in the URL, Tags is shown and
   `folder` is removed (replace).
   - Folders: "All" with the scope line's total, then each exact `folder_path` holding at
     least one note of the target, with its count, ordered by path, from SPEC-CORE-130's
     `folder-counts` (or `folder-counts/query`) with the target, `type=text` and
     `exclude_origin=webclip`. The root is "Drive root".
   - Tags: "All" with the scope line's total, then each tag with its count, from
     `shelves?by=tag` (or `shelves/query`) with the same conditions, paged at 24 shelves,
     in that endpoint's order. The untagged shelf is not an entry.
   - At most 200 entries are drawn. A selected entry that is not among them (beyond 200,
     or with no note under the current target) is drawn after them with its count, `0`
     when it has none.
   - A Target change keeps `folder` and `tag` and removes `note`.
2. **List.** `files` (or `files/query`) with the target, the selection (`path=` for a
   folder, `tag=` for a tag), `type=text`, `exclude_origin=webclip`, the sort (`sort=`:
   `updated` default, `title`, `created`) and the list search (`q=`, sent as `search`,
   matching title and folder), 60 per page, the next page on scrolling to the end. The
   search applies on submit. Selection, sort and search changes push history and remove
   `note`. Rows show the title, the date of the sort's field (`created_at` under
   `created`, else `updated_at`) and two lines of opening; a row whose opening failed to
   load has none. An empty answer shows "No notes here" and no pane.
3. **Choosing a note** (1024px and wider). Choosing a row sets `note=<file id>` (replace)
   and shows it in the pane. With no `note`, the pane shows the first row. A `note` not
   among the loaded rows is checked with `POST files/query` (`file_ids: [note]`,
   `type=text`, `exclude_origin=webclip`, no target):
   - total 1 → it is shown, even when the list is empty;
   - total 0 → the first row is shown and `note` is replaced with it (no pane when the
     list is empty);
   - the request fails → the pane's error state with a retry; the URL is kept.
4. **Reading.** The pane fetches the note's metadata and content and draws them as the
   file page does: `MarkdownPreview` for Markdown, `TextPreview` for a plain-text file. The
   meta line shows the folder, the updated time and the tags as read-only chips.
5. **Edit** is offered when all hold, as on the file page: the drive's `knowledge`
   `editor` policy is enabled, the inline editor flag (`isInlineKnowledgeEditorEnabled()`)
   is on, and the file is Markdown or a `text/plain` file `usePlainTextDocument` marks as
   a plain-text document. "Edit" mounts `KnowledgeEditSection` (the file page's mount of
   the Knowledge `Editor`, with its capture action) for the note, `fillHeight`, inside a
   `MarkdownChromeProvider` the pane supplies with the view mode fixed to `edit`, so the
   editor draws no header of its own and publishes its save state to the pane's row. The
   pane passes the editor's new optional handle (step 6).
6. **The editor handle.** `Editor` gains an optional prop `saveHandle`, filled with
   `{ dirty(): boolean; flush(): Promise<"saved" | "failed" | "conflict"> }`. `dirty`
   is true when the editor's text differs from what it last saved, including inside the
   autosave debounce. `flush` cancels a pending debounce and saves now, or awaits the save
   in flight, and resolves with its outcome; with nothing unsaved it resolves `"saved"`.
   A file whose save is blocked (the plain-text block) resolves `"failed"` only when it is
   dirty. Without the prop the editor behaves as it does today.
7. **Done**, and the gate. "Done" calls `flush()`. On `"saved"` the pane unmounts the
   editor and loads the note again (metadata, content, relations, sources), then shows it
   read, and the list and rail are requested again (rows already drawn stay until the
   answer). On `"failed"` or `"conflict"` the editor stays mounted and the pane's row shows
   the message. The same `flush()` gate runs, while the editor is mounted, before the pane
   shows another note, and before a tab, segment, selection, sort, search or Target change
   or "Open the file page" takes effect; on failure that change does not happen. Browser
   Back and Forward, a sidebar link, and closing the tab are guarded by the core's
   `DirtyBlocker`, as on the file page: the editor reports itself dirty to it.
8. **Connections.** Under the body: "Related files" from `GET /api/files/{id}/relations`
   (missing files greyed and not links, trashed files absent, as that endpoint returns
   them) and "Sources" from `POST notes/sources` with this note. A source opens its file
   page at its locator (`?t=` or `?page=`). A column with no entry is not drawn; with
   neither, the section is not drawn. "See this note in the graph ›" opens
   `/drive/{drive}/addons/knowledge/connections?focus=<id>`.
9. **Widths** (viewport width). At 1280px and wider: three panes. From 1024 to 1279px the
   rail is a menu button above the list ("Folders: <name> ⌄", "Tags: <name> ⌄") with the
   same switch and entries, and the list and pane are side by side. Below 1024px the pane
   is not drawn, a row is a link to the note's file page, and `note` is ignored. A
   viewport that narrows below 1024px while the editor is mounted keeps the pane until
   Done.

**Folder counts (SPEC-CORE-130).**

1. `GET /api/drives/{drive}/folder-counts` accepts every filtering query parameter of
   `GET /api/drives/{drive}/files` (`FileFiltersQuery`), applied through
   `filtered_drive_files` with the same meaning, `type` included in its list form.
2. `POST /api/drives/{drive}/folder-counts/query` takes the same parameters and a
   `FileIdsQuery` body, joining `collection` in the `in:` condition as `files/query` does.
3. Both answer `[{ path, count }]`: active files per exact `folder_path` over the set the
   files listing returns for the same parameters, ordered by path. Body ids and
   collections of another drive count nothing.
4. A request with only `type`, `origin` or `exclude_origin`, or none, answers as before.
5. Invalid parameters answer what `files` answers for them: 422 for a field that fails
   validation, 400 for a `folder`, `collection`, `size` or `duration` value that does not
   normalise. A locked or unknown drive is 404 on both forms.

### 2. Failure cases

- Smart Collections or collections fail to load: the default target is in force and the
  menu shows its retry, as `TargetMenu` does for every app.
- A saved target that is gone or cannot be resolved, or a member target whose evaluation
  fails: the default target is in force and the saved id stays.
- Header count fails: the scope line shows the drive alone; Home and Library still load.
- Continue writing fails or answers `viewer_required`: the section is not drawn.
- `note-openings` fails: cards and rows are drawn without their opening.
- Notes with sources: `with-sources`, the walk or `notes/sources` fails → the section is
  not drawn; the other sections are unaffected.
- Recently updated fails: a "Try again" button where its rows go.
- Folders counts fail: the rail shows "All" and the selected entry, without counts, and a
  "Try again" button. Tags: the first page fails → "All" and the selected entry and "Try
  again"; a later page fails → the entries drawn stay and "Try again" follows them. The
  list is unaffected.
- List fails: "Try again"; rows already drawn stay.
- Pane metadata or content fails: "Couldn't load this note" and "Try again"; no "Edit".
- `flush()` resolves `"failed"`: the row shows "Couldn't save"; `"conflict"`: the
  editor's conflict dialog, as on the file page, and the row shows "Changed elsewhere".
  A save that never settles keeps the gate waiting with "Saving…" shown; the change asked
  for happens when it settles.
- Relations or sources fail: that column is not drawn.
- `notes/sources`: 422 and 503 as in its steps; the page treats both as a failure above.
- `folder-counts`: as in its step 5.

### 3. States

- **Page.** Home | Library. Allowed: each to the other by a tab. Not allowed: a third
  page; `?q=`, `?prefill=` and `?edit=` URLs are replaced on arrival.
- **Target.** looking up → default | chosen | fallen back. Allowed: any → looking up when
  the viewer chooses. Not allowed: a request that lists or counts notes while looking up.
- **Section** (each Home section, the list, the rail). loading → loaded | empty | failed;
  failed → loading (Try again). Not allowed: failed or empty drawn as `0` rows of a count.
- **Library layout.** three panes (≥1280) | menu + list + pane (1024–1279) | list only
  (<1024), following the viewport. Not allowed: unmounting a mounted editor because the
  viewport narrowed.
- **Rail.** Folders | Tags × All | one entry. Allowed: segment change → All of the other
  segment; entry change within a segment. Not allowed: a folder and a tag selected
  together.
- **Pane.** none | loading | reading | error | editing | waiting.
  Allowed: none → loading (a note to show appears); loading → reading | error;
  reading → loading | none (another note, or the list empties); error → loading (Try
  again, or another note); reading → editing (Edit); editing → waiting (Done or a gated
  change); waiting → loading (`"saved"`, then the note or change asked for) | editing
  (`"failed"`, `"conflict"`). Not allowed: none, loading or error → editing; editing →
  loading or none without passing waiting. While waiting, the editor accepts no input
  and the pane accepts no other change.

### 4. Data read and written

- Read: core `files` and `files/query`, `shelves` and `shelves/query` (`by=tag`),
  `folder-counts` and `folder-counts/query`, `watch-history`, `smart-folders`,
  collections and member evaluation, `/api/files/{id}`, `/content`, `/relations`,
  `/thumbnail`.
- Read: Knowledge `note-openings`; new `notes/with-sources` (tables `note_origins`,
  `note_origin_sources`) and `notes/sources` (those tables; content and file metadata
  through the Internal API).
- Written, only from the pane's editor and only as the file page's inline editor writes
  them: the note's content (`PUT /api/files/{id}/content` with its ETag, including an
  overwrite the viewer confirms in the conflict dialog), images dropped or pasted into it
  (upload into the note's folder), `POST resync-tags`, a kept or restored version from
  the editor's version controls, and source captures through `KnowledgeEditSection`'s
  capture action.
- Local storage: `litloft.addon.knowledge.target.<drive>`,
  `litloft.addon.knowledge.targets.<drive>`, `litloft.addon.knowledge.classification.<drive>`.
- No table or column is added; no migration.

### 5. External services

None. Every call is to the core or to the Knowledge container on the Docker network.

### 6. Authorization

Unchanged. Core routes check drive access (a locked or unknown drive is 404),
`folder-counts` included. The new Knowledge routes go through the addon proxy, which
requires `X-Lit-Drive` and checks it against the caller's accessible drives (scope=drive).
`notes/sources` reads a note's content only after finding the note on that drive in
`note_origins`, and keeps only sources `/files/bulk` reports on that drive.

### 7. Effect on existing features

- `Editor.tsx` gains the optional `saveHandle` prop and nothing else; the file page does
  not pass it (I12).
- `KnowledgeEditSection` is mounted in a second place, inside a chrome provider, as
  `MarkdownDocumentLayout` mounts it on the file page.
- `/connections` is unchanged; only the Notes tile that led to it goes.
- Global search "See all" for notes lands on the Library search (Revises I15, I22).
- The bookmarklet's Notes landing forwards to Clips (Revises I26).
- The `clips=1` toggle goes (Revises I14).
- The Clips page shares `NoteRow.tsx` (`NoteRows`) and `NotesLanding.tsx`
  (`SectionHeading`). The Notes Library's rows are a new component; the shared ones are
  not changed (I17).
- `folder-counts` callers that send no new parameter get the same answer.
- The drive Home and the sidebar keep listing Notes from the manifest's navigation.
- `NoteResults.tsx`, `FindNote` (in `NotesLanding.tsx`), `ClipSection`'s use on the Notes
  page and the tool tiles are deleted with their tests.

### 8. Error behavior

As in item 2. The frontend logs nothing new. `notes/sources` logs a warning naming the
note id when its content read fails.

### 9. User-visible behavior

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
| Rail menu | Folders: {name} / Tags: {name} | フォルダ: {name} / タグ: {name} |
| List | Search {folder} / Search notes / Updated / Title / Created | {folder} を検索 / ノートを検索 / 更新順 / タイトル順 / 作成順 |
| Pane | Edit / Done / Open the file page | 編集 / 完了 / ファイル画面で開く |
| Save state | Saved / Saving… / Couldn't save / Changed elsewhere | 保存済み / 保存中… / 保存できませんでした / 別の場所で変更されました |
| Pane error | Couldn't load this note | このノートを読み込めませんでした |
| Connections | Connections / Related files {n} / Sources {n} / See this note in the graph › | つながり / 関連ファイル {n} / 出典 {n} / このノートを中心にグラフで見る › |
| Badge | p. {n} | {n} ページ |
| Retry | Try again | 再試行 |
| Empty | No notes yet / No notes here | まだノートがありません / ここにはノートがありません |

- Empty states use the core `EmptyState`. Loading: Home sections and the list draw
  skeleton rows of their own row height (`animate-pulse` blocks in `bg-elevated`), the
  cards a skeleton card; the pane a skeleton title and three lines; the rail three
  skeleton entries.
- Dates in the viewer's locale (`formatNoteTime`).
- Defaults: Home; Folders; sort `updated`; the default target.

### 10. Non-functional

- `notes/with-sources` reads no content; its answer has one id per note with sources.
- `notes/sources` reads at most 60 notes' content per request, each capped by
  `CORE_INTERNAL_CONTENT_MAX_BYTES`; Home asks for at most 5, the pane for 1.
- Notes with sources walks at most 3 pages of 60.
- The rail pages `shelves` at 24 shelves and draws at most 200 entries plus the selected.
- `folder-counts` with filters runs one grouped query over the filtered set.
- Layout is measured in a real browser (`frontend/e2e-layout/` or `e2e-components/`) at
  1440, 1280, 1100 and 390px (I16).
- Privacy: no content leaves the Docker network.

## Touch points

- Knowledge frontend, changed: `NotesPage.tsx`, `NotesLanding.tsx` (`FindNote`,
  `ContinueWriting`, `RecentNotes`; `SectionHeading` kept as is), `AllNotes.tsx`,
  `AllNotesRail.tsx`, `allNotesParams.ts`, `ContinueCard.tsx`, `Page.tsx`,
  `NoteSearchScope.tsx` (`seeAllHref` → `?view=all&q=`), `Editor.tsx` (the optional
  `saveHandle`), `KnowledgeEditSection.tsx` (passes `saveHandle` through), new frame, Home,
  rail, list and pane components (Container/Presenter), `messages/{en,ja}.json`.
- Knowledge frontend, deleted: `NoteResults.tsx`, `FindNote`, the tool tiles and the
  Notes page's `ClipSection` mount.
- Knowledge frontend, unchanged and protected: `NoteRow.tsx`, `SectionHeading`, `clips/*`.
- Knowledge backend: a new router with `GET /notes/with-sources` and `POST /notes/sources`,
  using `app/internal_client.py` (content read, `/files/bulk`).
- `addons/knowledge/manifest.json`: two `proxy.routes` entries, `/notes/with-sources`
  (GET) and `/notes/sources` (POST), neither `drive_optional`.
- Knowledge tests rewritten or retired: `notesLeaveClipsOut.test.tsx` (Revises I14, I15),
  `NotesPage.test.tsx` (tool tiles, deleted with them), `NoteSearchScope.test.tsx`
  (Revises I22), `__tests__/AllNotes.test.tsx` (rail and `getFolderCounts` wire),
  `c3-chrome.test.tsx` (header and frame), `page.test.tsx` (`useOverlaySidebar`),
  `reachability.test.ts` (the entry files).
- Core backend: `backend/app/routers/drives.py` (`folder-counts` filters and
  `folder-counts/query`), `backend/tests/test_drive_folder_counts.py`,
  `backend/tests/test_origin_conditions.py`.
- Core frontend: `frontend/src/lib/api.ts` (`getFolderCounts` with filters and a
  `…WithFileIds` form). Used without edits: `components/appshell/*`, `TargetMenu`,
  `lib/appTarget`, `lib/memberTarget`, `lib/appPrefs` (`readAppTarget`/`writeAppTarget`),
  `useLoad`, `useNearEnd`, `PageTabs`, `MarkdownPreview`, `TextPreview`,
  `usePlainTextDocument`, `lib/featureFlags` (`isInlineKnowledgeEditorEnabled`),
  `lib/markdownChromeContext`, `DirtyBlocker`/`dirtyRegistry`, `EmptyState`,
  `GlobalSearch` (its existing `?view=all&q=` expectations).
- Core tests that inventory addon frontend files: `components/__tests__/toolbarMenuHome.test.ts`,
  `__tests__/escape-listeners.test.ts`, `__tests__/line-clamp-display.test.ts`,
  `__tests__/page-container-width.test.ts`, `__tests__/ime-enter-guard.test.ts`, and the
  e2e fixture `e2e-components/fixtures/notesAllClipsToggle.tsx` with
  `notes-all-clips-toggle.spec.ts`, `fixtures/app.tsx`, `spec-viewport.spec.ts`,
  `componentFixtureParity.test.tsx`. Merge order: the Knowledge PR first, then the core
  PR with the submodule bump and these lists.
- Rules: `.claude/rules/design-decisions.md` (drive boundary; tag editing through the
  editor's save; no core-to-addon dependency), `frontend-conventions.md`,
  `backend-conventions.md`, `internal-api-policy.md` (no new Internal API endpoint).
- Docs: `docs/user-guide/notes.md`, `docs/addons/knowledge.md`,
  `docs/user-guide/search.md`, `docs/user-guide/quick-note.md` if it names the old
  landing, `docs/reference/api.md` (`folder-counts`), `docs/ADDON-DEVELOPMENT.md` (surface
  table: `folder-counts` filters and `/query`, `MarkdownPreview`, `TextPreview`,
  `useNearEnd`, `markdownChromeContext`, `usePlainTextDocument`).
- The `addons/knowledge` submodule pointer in the core.

## Invariants

I1. No list, section, rail count or header count on Notes Home or Library contains a file whose `md_origin` is `webclip`, whatever the Target, selection, sort or URL parameters, `clips=1` included.
I2. Every note the Library list, Recently updated and Notes with sources show, and every note counted by the header and the rail, is one the `files` listing returns for the same Target with `type=text` and `exclude_origin=webclip`; the header count equals that listing's `total`.
I3. For every rail entry, Folders and Tags, its count equals the number of rows the list shows over all its pages, with the list search empty, when that entry is selected under the same Target, member and collection targets included.
I4. While the pane's editor is mounted, the pane shows the note read, shows another note, or lets a tab, segment, selection, sort, search, Target or "Open the file page" change take effect only after the server holds the editor's latest text, text typed within the autosave debounce included; reading the note afterwards returns that text. When the save fails or conflicts, none of these happen and the editor stays mounted.
I5. The editor is never mounted for a note whose metadata or content failed to load or has not loaded.
I6. Below 1024px viewport width, choosing a row opens the note's file page and the Library offers no "Edit".
I7. `notes/sources` never reads the content of, or answers for, a note not on the request's drive, and never returns a source that `/files/bulk` does not report active on that drive; Notes with sources and the pane show nothing else.
I8. `?view=all` with `folder`, `tag`, `sort` and `q` opens the Library with that selection, sort and search; `?q=<x>` without `view` lands on `?view=all&q=<x>`; `?edit=<id>` reaches the file page in edit mode exactly when the inline editor flag is on and the file is Markdown or text, else Home; `?prefill=…` lands on the Clips page with the same query string; `/connections?focus=<id>` draws the graph centred on that note.
I9. Choosing a Target writes `litloft.addon.knowledge.target.<drive>` and no other app's key; a saved Target that is gone or cannot be resolved puts the default Target in force and leaves the saved id stored. Choosing a rail segment writes `litloft.addon.knowledge.classification.<drive>`, and with neither `folder` nor `tag` in the URL the stored segment is shown.
I10. The scope line never shows `0` while its count loads or after its request fails; it shows `0` only when the listing's `total` is `0`.
I11. A source's badge and source line show the first `loft://<source id>?t=` or `?page=` link in the note's body, as `m:ss`, `h:mm:ss` or "p. N"; a source with no such link, or of a note whose content cannot be read, shows no position.
I12. On the file page the editor shows its own save indicator and view-mode toggle, autosaves after its debounce, writes on unmount and handles conflicts as before; an `Editor` given no `saveHandle` makes the same requests in the same order as before this change.
I13. At 1200px viewport width and wider the sidebar is inline on every Notes page.
I14. `folder-counts` with only `type`, `origin` or `exclude_origin`, or none, answers the same paths and counts as before; with any filter, on GET or POST, each `count` equals the `total` the `files` listing (or `files/query` with the same body) returns for the same parameters plus `path=<that path>`.
I15. `folder-counts` and `folder-counts/query` answer 404 for a locked or unknown drive, and never count a file of another drive, whatever ids or collections the request names.
I16. At 1440 and 1280px viewport width the Library shows rail, list and pane side by side with the rail 220px and the list between 340 and 380px; at 1100px the rail is a menu above the list and list and pane are side by side; at 390px only the list is shown; at none of these widths does the page scroll horizontally.
I17. The Clips page's rows and section headings render the same markup as before this change.
I18. After Done, the pane's meta line, Related files and Sources show what the server holds after the save, and the list and rail are requested again.

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
- **Notes with sources reads the Knowledge index.** `note_origin_sources` is filled by
  the note scanner, so a note whose frontmatter gained sources since the last scan is
  absent until the next one. The walk is bounded at 3 pages of the target's newest notes,
  so a note with sources older than the newest 180 is not offered. Both accepted: the
  section is a shortcut, the Library holds every note.
- **Missing sources.** Dropped from Sources: `/files/bulk` returns active files only, and
  a missing file's file page is 404. Showing them would need a new Internal API endpoint.
- **Wiki links (`[[...]]`) as "Links to this note".** Not recorded in any table; a link
  index is its own feature.
- **The whole-drive graph.** Kept at `/connections` without a Notes entry.
- **Clips on the app frame.** A separate spec, with its own app key (Notes takes
  `{ addon: "knowledge" }`).
- **A "has sources" filter in the Library.** Not needed; the Home section has no "See all".
- **WebSocket refresh.** The other apps do not refresh lists on `files.*` events; nor
  does Notes. The list refreshes after Done.
- **Body search in the Library.** The list search matches title and folder, as All notes
  does; body search is the global search's.
- **`folder-counts` for subtrees.** The rail counts exact folders, as All notes does
  (F-9).
