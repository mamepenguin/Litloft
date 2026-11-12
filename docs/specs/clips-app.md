# Clips: an entrance for web clips, apart from Notes

SPEC-ID: SPEC-CORE-091
SPEC-ID: SPEC-CORE-092
SPEC-ID: SPEC-CORE-093
SPEC-ID: SPEC-ADDON-100
SPEC-ID: SPEC-ADDON-101

Approval:

## Summary

Web clips are Markdown files, so today they sit in the Notes app beside the notes the
viewer wrote. The two are read for different reasons: a note is the viewer's own writing,
a clip is something from outside, kept to read. This change separates them by where the
file came from, not by where it is stored. A clip keeps the frontmatter mark
`origin: webclip` that Knowledge already writes, wherever the viewer moves it.

- **SPEC-CORE-091**: the core copies a Markdown file's frontmatter `origin` into a new
  nullable column `files.md_origin`. It does this at the moments it already copies
  frontmatter `tags`, and on every scan, in the pass that already reads every active `.md`.
  The core stores the value as an opaque string and never compares it with any particular
  value.
- **SPEC-CORE-092**: the read endpoints Notes and Clips use gain `origin` and
  `exclude_origin` conditions. `shelves` also gains `opened`, which means "this viewer has
  a history row for the file", whatever the position.
- **SPEC-CORE-093**: an addon manifest's `navigation` may be a list, so one addon can show
  more than one entrance. Among addon rows, a sidebar row lights for the entry whose
  `href` matches the page most deeply.
- **SPEC-ADDON-100**: Knowledge adds a second `primary` entrance, **Clips**
  (`/drive/{drive}/addons/knowledge/clips`). It has three shelves: Unread, Recently
  opened and Unverified, plus a list of every clip.
- **SPEC-ADDON-101**: the Notes app leaves clips out by default. Its All notes view has a
  toggle that brings them back. The landing's search (`?q=`) still finds clips.

The boundary of "a clip", agreed with the user:

- a file whose frontmatter `origin` is `webclip` is a clip, even after the viewer has
  written in it or moved it;
- a note made from an Ask answer (`origin: ask_answer`), a note made from a file, and any
  file without the mark are notes;
- a clip whose mark the viewer deletes becomes a note:
  - an edit made in Litloft takes effect at once;
  - an edit made in an outside editor takes effect at the next scan (startup or
    rescan).

Agreed design: see section 9. Out of scope: a reading position inside a Markdown file;
marking a clip "read" by hand; filtering tags by origin; any change to Quick Note, the
capture basket or how a clip is made. The viewer is one person on a PC browser and a
phone. The iOS app is not changed.

## Required items

### 1. Normal flow

**Projection (091)**

1. A Markdown file is written through one of the paths that project frontmatter `tags`
   today:
   - text file create `POST /api/drives/{drive}/files` (`_project_created_markdown_tags`,
     including the branch that revives a missing row);
   - content write `PUT /api/files/{id}/content`;
   - the frontmatter tag write (`_write_md_tags` in `routers/files.py`);
   - upload (`services/upload.py`);
   - copy (`services/fileops.copy_file`);
   - the scanner registering a new `.md` (`_ensure_md_id_for_new_file`, in a scan and in
     `register_single_file`).
2. In that step, the core decides `md_origin` from the content it is projecting:
   - if `has_unreadable_frontmatter(content)` is true, `md_origin` is left unchanged (a new
     row keeps `NULL`), so an accidentally broken block never turns a clip into a note;
   - otherwise, if the parsed frontmatter's `origin` is a string that is not empty after
     stripping, the first 32 characters of the stripped string are written;
   - otherwise (no frontmatter, no `origin`, an empty or non-string value) `NULL` is
     written.

   It runs in its own savepoint, so a failure is logged and swallowed and never touches
   the tags, `md_id`, `md_aliases`, link sync or the content write.
3. **Every scan.** The scanner's Markdown pass already reads every active `.md` of the
   drive, up to `_MD_READ_MAX_BYTES` (1 MB), after the regular pass. That pass also
   applies the rule in step 2 to each file it reads, and writes only when the value
   differs. This catches:
   - files that existed before the column, so no separate backfill is needed;
   - edits made outside Litloft;
   - files restored from trash or recovered from missing since the last scan.

   A scan runs at startup and on a manual rescan, as today. Nothing else changes in the
   pass, and the identity and hash gate (`_refresh_file_identity`) is not touched.

**Read conditions (092)**

4. `GET /api/drives/{drive}/files`, `GET /api/drives/{drive}/shelves`,
   `GET /api/drives/{drive}/watch-history` and `GET /api/drives/{drive}/folder-counts`
   accept:
   - `origin` (1 to 32 characters): keeps only files whose `md_origin` equals it;
   - `exclude_origin` (1 to 32 characters): drops files whose `md_origin` equals it, and
     keeps files whose `md_origin` is `NULL`.
   - Both may be given, and each applies on its own. An empty value or one over 32
     characters is a 422.
   - `files` and `shelves` apply them inside `filtered_drive_files`, so both answer the
     same set. `files`' `total` and a shelf's `count` are counted after the condition.
5. `GET /api/drives/{drive}/shelves` accepts `opened` (`true`|`false`):
   - `opened=true` keeps files for which the requesting viewer has a `watch_history`
     row. `opened=false` keeps files for which it has none. Position and duration do not
     matter.
   - `opened` together with `by=watch`, `watch=` or `sort=last_played` is a 422. This
     check runs before the viewer check, so it is a 422 even without a viewer.
   - Otherwise, `opened` without a viewer is a 400 `viewer_required`, as `watch` is.
   - The existing `watch` buckets are unchanged.

**Several entrances per addon (093)**

6. A manifest's `navigation` is either one object, as today, or a list of 1 to 4 objects.
   Each object has today's fields plus an optional `path`, one URL segment matching
   `^[a-z0-9-]{1,40}$`.
   - The registry validates each object with today's `_navigation_error` (same name and
     signature), plus the `path` check.
   - An invalid object is dropped with a warning naming the addon and its index.
   - An object whose `path` repeats an earlier object's `path` (both absent counts as a
     repeat) is dropped the same way.
   - If no object survives, or the list is empty, or it has more than 4 elements, or
     `navigation` is neither an object nor a list, the whole `navigation` block is
     dropped with a warning. The addon stays registered.
   - The catalogue passes the block through in the shape the manifest used: an object
     stays an object, and a list stays a list of the surviving objects.
7. The frontend's `AddonMeta.navigation` is `AddonNavigation | AddonNavigation[]`.
   `addonNavEntries` treats an object as a one-element list and returns one entry per
   element:
   - **href**: the addon's URL (`addonUrlFor`), plus `/{path}` when `path` is set;
   - **key**: the addon name, plus `/{path}` when set, unique among all entries;
   - **order**: `priority`, then addon name, then the element's place in the list.

   The sidebar rows (`AddonNavRows`), Home's entry row and page jump use `key` as the
   identity wherever they used the addon name.
8. Active state for addon rows: a row qualifies when the page path equals its `href` or
   lies under it.
   - Among all addon entries of every placement, only the qualifying row with the
     longest `href` is active.
   - So on `.../addons/knowledge/clips` only Clips is lit, and on `.../addons/knowledge`
     or `.../addons/knowledge/connections` only Notes is lit.
   - Built-in app rows (Video, Reading) keep today's rule. Their `href`s never lie under
     an addon's.

**Clips (ADDON-100)**

9. Knowledge's manifest `navigation` becomes a list:
   - the existing Notes object, unchanged;
   - `{label: "Clips", i18n_key: "knowledge.nav.clips", icon: "newspaper", placement:
     "primary", priority: 21, path: "clips"}`.

   The core's `ADDON_NAV_ICONS` gains `newspaper` (lucide `Newspaper`). Clips appears in
   the sidebar, Home's entry row and page jump right after Notes. Its label is クリップ
   in Japanese and Clips in English.
10. `addons/knowledge/frontend/pages/clips.tsx` renders the Clips page with the core's
    page header (DESIGN.md §6 Page Header):
    - the newspaper icon tile and the title クリップ / Clips;
    - the scope line: the drive and N 件 / N clips, where N is the `total` of
      `files?origin=webclip&limit=1`. While that count loads, or if it fails, the scope
      line shows the drive alone, never `0`;
    - the primary action **Web ページをクリップ** / **Clip a web page**, which opens and
      closes Notes' existing clip form (`ClipSection`) under the header, unchanged
      (destination folder, duplicate check, bookmarklet). On a phone the action is an
      icon-only button with that label as its accessible name;
    - a tabs row: **ホーム** / **Home** (the landing, no `view`) and **すべて** / **All**
      (`?view=all`).
11. The landing draws its shelves in this order.

    With a profile:
    - **Unread** (未読): `shelves?by=all&key=all&origin=webclip&opened=false&sort=created_at&order=desc&per_shelf=12`;
    - **Recently opened** (最近開いた): `watch-history?filter=all&origin=webclip&limit=12`,
      latest opening first;
    - **Unverified** (未確認): `shelves?by=all&key=all&origin=webclip&trust=unverified&sort=created_at&order=desc&per_shelf=12`.

    Without a profile:
    - **New clips** (新しいクリップ), the Unread request without `opened`, in Unread's
      place;
    - Recently opened is not drawn;
    - Unverified, as with a profile.
12. Shelf drawing:
    - A shelf with no files is not drawn.
    - A shelf is not drawn while it loads.
    - Each shelf lists its clips as rows: title, folder, the opening excerpt (as Notes
      rows show it), and the clip date from the file's `created_at`.
    - Notes' `NoteRows` and `groupNotesByAge` gain a date-field choice. The default stays
      `updated_at`, so Notes is unchanged, and Clips passes `created_at`.
    - Opening a row opens the core file page, which records the opening as for any file.
      So a clip leaves Unread and enters Recently opened the next time the landing loads.
13. If a request answers 400 `viewer_required`, or the profile is cleared or set while the
    page is open, the landing re-runs in the matching mode:
    - without a profile, it requests New clips and removes Recently opened;
    - with a profile, it requests Unread and Recently opened.
14. `?view=all` lists every clip (`files?origin=webclip`), newest first (`created_at
    desc`), 60 per page. It groups by the age of `created_at` and has Notes' "load more".
    Folder, tag and sort controls are not part of this view.
15. If the count is 0, the page draws one empty state instead of the tabs and shelves: an
    icon, まだクリップがありません / No clips yet, and one line saying clipped web pages
    gather here and can also be clipped from a folder's menu or the bookmarklet. The
    header and its primary action stay.

**Notes leaves clips out (ADDON-101)**

16. On the Notes landing, Recent notes (`getDriveFiles`, with its "All (N)" total and its
    empty state) and Continue writing (`getWatchHistory(..., "text")`) send
    `exclude_origin=webclip`.
17. The All notes view (`?view=all`) sends `exclude_origin=webclip` on its file request
    (including its `q` search) and on its `folder-counts` request, unless the URL carries
    `clips=1`.
    - The toolbar gains a toggle, **Include clips** (クリップを含める). Turning it on sets
      `clips=1`, turning it off removes it, and the list re-fetches from page 1.
    - `allNotesHref` keeps `clips=1` across the view's folder, tag, sort and query links.
    - The default is left out of the URL.
18. The landing's search (`?q=`, `NoteResults`, which calls core `getDriveFiles` with
    `type=text` and `search`) sends no `exclude_origin` and still returns clips. The
    parameter is added only at the call sites in 16 and 17, never as a default inside
    `getDriveFiles` or `appendListingFilters`, which `NoteResults`, `FileLinkModal` and
    core screens share.

### 2. Failure cases

- Projection on a write (step 2):
  - the frontmatter is unreadable: `md_origin` is unchanged;
  - it raises: logged and swallowed inside its savepoint, and the write is still
    committed.
- Scan pass (step 3):
  - a file is over 1 MB, cannot be read, or is not UTF-8: it is skipped, and
    `md_origin` is unchanged;
  - the projection for one file raises: logged, and the pass goes on.
- A content write lands between the scan reading a file and committing: the scan may
  write the value it read. The next scan or write corrects it. See *Checked, no action*.
- `opened` combined with `by=watch`, `watch=` or `sort=last_played`: 422. `opened`
  without a viewer otherwise: 400 `viewer_required`.
- `navigation` problems: as in step 6. One bad element costs only that element; a block
  with nothing left is dropped.
- Clips page:
  - a shelf request fails: that shelf shows Notes' "could not load" line, and the other
    shelves still draw;
  - a 400 `viewer_required`: step 13;
  - the count request fails: the scope line shows the drive alone, no empty state is
    drawn, and the tabs and shelves still draw.
- Notes: a request with `exclude_origin` fails: the existing "could not load" line.

### 3. States

- A file's `md_origin`: `NULL` | a string of 1 to 32 characters.
  - It is set or cleared at the write paths in step 1 and by the scan pass in step 3.
  - An unreadable frontmatter block never changes it.
  - Trash, restore, missing and recovery do not change it themselves. The next scan
    re-reads restored and recovered files.
- A clip for one viewer: unopened (no history row) → opened (a row exists). It goes back
  only when the viewer removes it from history.
- A clip's trust: unverified → verified when the viewer rules on it in the existing
  control. It leaves the Unverified shelf then.
- Clips page: landing | `view=all`; with a profile | without. Each shelf: loading |
  failed | empty (not drawn) | drawn.
- All notes: `clips` absent (own notes) | `clips=1` (every text file).

### 4. Data read and written

- `files.md_origin`: new nullable `VARCHAR(32)` column with an index on
  `(drive, md_origin)`, both added by `_migrate`. It is written at the projection points
  and read by the new conditions.
- `watch_history`: read by `opened`. Not written by anything new.
- `.md` files on disk: read at the projection points and in the scan pass. Never written
  by this change.
- Knowledge DB: not touched.
- No table or column is dropped or renamed. An older build ignores `md_origin`.

### 5. External services

None. Nothing leaves the host.

### 6. Authorization

Unchanged:

- every new condition sits inside endpoints that already check drive access with
  `_validate_drive`, and a locked drive still answers 404;
- `opened` reads only the requesting viewer's history rows;
- the Clips page is a Knowledge page under the drive's addon route, so the proxy's
  drive-scope checks apply as they do to Notes.

### 7. Effect on existing features

- Every `files`, `shelves`, `watch-history` and `folder-counts` request without the new
  parameters returns what it returns today. `FileResponse` does not carry `md_origin`.
- The tags projection and the scan pass's thumbnail projection keep their behaviour.
- The sidebar, Home's entry row and page jump draw one row per navigation entry, so
  Knowledge shows two. An addon with a single `navigation` object is drawn and lit as
  today. `addons/media_import/backend/tests/test_addon_navigation.py` still imports
  `_navigation_error` with today's signature.
- Notes:
  - its landing drops clips, including the "All (N)" count and the empty state, so a
    drive holding only clips shows the Notes empty state;
  - a clip that used to appear under Recent notes is now under Clips, or under All notes
    with the toggle on.
- `NoteRows` and `groupNotesByAge` default to `updated_at`, so Notes keeps its dates and
  groups.
- Not changed:
  - Ask, semantic search, the Reading app and `FileLinkModal`;
  - the Inbox, which still lists new clips as arrivals;
  - MCP tools, which send no new parameter.

### 8. Error behavior

- The user sees what section 2 states.
- Logged at warning:
  - a projection failure, with the file path;
  - a dropped navigation element or block, with the addon and index.

### 9. User-visible behavior

- Sidebar, Home entry row and page jump: **Clips** (クリップ, newspaper icon) right after
  Notes. On the Clips page only Clips is lit.
- Clips page:
  - header with the title, the scope line (drive · N), **Clip a web page**, and the Home /
    All tabs;
  - Home: Unread, Recently opened and Unverified, at most 12 rows each, newest first
    (Recently opened by latest opening);
  - without a profile, New clips and Unverified;
  - an empty state when the drive has no clips.
- All: every clip newest first, grouped by age, 60 per page.
- Notes:
  - Recent notes and Continue writing no longer show clips, and the "All (N)" count
    counts own notes;
  - All notes shows own notes, with an **Include clips** toggle;
  - the landing's search still finds clips.
- **Agreed design**: https://claude.ai/artifact/XRKpNK6xnC8qshD69gpM4g, saved in
  `docs/process/reviews/feature-clips-app/design/` (`canvas.json` and five `.dc.html`
  artboards). The design governs spacing and visual hierarchy; this spec governs content,
  order and behaviour. Row contents, sample titles and the sidebar drawn beside the page
  are illustrative. Its visible decisions:
  - D1. Clips page regions, top to bottom: page header (icon tile, title, scope line,
    primary action in one row), tabs row (Home, All), then the shelves. Single column at
    the Notes list width.
  - D2. The primary action is a filled accent pill with a plus icon and the label at PC
    width, and a 44px round icon-only button on a 390px phone.
  - D3. Each shelf is an H2 heading (§3.2 H2) over rows; no shelf has a See all link or a
    count.
  - D4. A row: a 36px rounded icon tile, then title (one line, truncated) over the excerpt
    (one line, truncated); at PC width the date and folder sit right-aligned on the
    right, and on a phone they join one muted line under the excerpt (`folder · date`).
  - D5. All: rows grouped under small muted age labels (今日 / 今週 / 先月 ...), and a
    secondary **さらに表示** / **Load more** button centred under the list.
  - D6. Empty state: centred under the header, an icon tile, a bold line and one muted
    line; no tabs.
  - D7. Notes All notes: **クリップを含める** sits at the end of the toolbar after the
    search field, Tag and Sort, as a pill toggle with the clip icon. Off is outlined, on
    is filled dark, and `aria-pressed` follows it. The scope line count and the folder
    rail counts change with it.
- `docs/user-guide/notes.md` gets the sentence that clips live under Clips and how to show
  them in All notes. `docs/addons/knowledge.md` describes the Clips page.

### 10. Non-functional

- The scan pass adds one frontmatter parse per `.md` it already reads, and a write only
  when the value changes. No extra file read.
- The `(drive, md_origin)` index keeps the conditions cheap on a large drive.
- `opened` is one outer join on `watch_history` filtered by viewer, the same join `watch`
  uses.
- Privacy: nothing new leaves the host. `md_origin` holds no content.

## Touch points

- `backend/app/models.py` (`File.md_origin`); `backend/app/database.py` (`_migrate`:
  column and index)
- `backend/app/services/tagops.py`, or a sibling helper: origin projection
- Projection call sites:
  - `backend/app/routers/drives.py` (`_project_created_markdown_tags` and the
    revive-missing branch);
  - `backend/app/routers/files.py` (content PUT, `_write_md_tags`);
  - `backend/app/services/upload.py`;
  - `backend/app/services/fileops.py` (`copy_file`);
  - `backend/app/services/scanner.py` (`_ensure_md_id_for_new_file`, and the Markdown
    pass after the regular pass)
- `backend/app/routers/drives.py`: `filtered_drive_files`, `list_drive_files`,
  `get_watch_history`, `list_folder_counts`
- `backend/app/routers/shelves.py`: `origin`, `exclude_origin`, `opened`
- `backend/app/services/addon_registry.py` (navigation list validation; `_navigation_error`
  kept)
- `frontend/src/lib/addonNavigation.ts`, `frontend/src/lib/addons.ts` (`AddonMeta`),
  `frontend/src/lib/addonNavIcons.ts` (`newspaper`), `frontend/src/lib/api.ts`
  (parameters of `getDriveFiles`, `getShelves`, `getWatchHistory`, `getFolderCounts`)
- `frontend/src/components/Sidebar.tsx`,
  `frontend/src/components/sidebar/SidebarLibrarySection.tsx`,
  `frontend/src/components/sidebar/AddonNavRows.tsx`,
  `frontend/src/components/sidebar/isSidebarLinkActive.ts`,
  `frontend/src/components/home/HomeAppEntries.tsx`, `frontend/src/components/DriveHome.tsx`,
  `frontend/src/components/search/useJumpDestinations.ts`
- Knowledge (addon repository):
  - `addons/knowledge/manifest.json`;
  - `addons/knowledge/frontend/pages/clips.tsx` and its components (reusing
    `ClipSection.tsx` unchanged);
  - `addons/knowledge/frontend/NotesLanding.tsx`, `AllNotes.tsx`, `allNotesParams.ts`,
    `NoteRow.tsx`, `noteDates.ts`;
  - `addons/knowledge/frontend/messages/{ja,en}.json`
- Submodule gitlink `addons/knowledge`, bumped after the addon PR merges (core PR first)
- Docs:
  - `docs/reference/api.md` (new query parameters);
  - `docs/ADDON-DEVELOPMENT.md` (`navigation` as a list, `path`, the `newspaper` icon,
    under *Extension-point changes*);
  - `docs/user-guide/notes.md`;
  - `docs/addons/knowledge.md`
- `docs/process/reviews/feature-clips-app/design/` (the agreed design)
- Rules passed through:
  - `.claude/rules/design-decisions.md`: drive boundary, file state
    (`active_file_filter`), watch history, "No core-to-addon dependencies";
  - `.claude/rules/backend-conventions.md`: migrations only add;
  - `.claude/rules/frontend-conventions.md`: DESIGN.md, translation files.
- Risk zones: `backend/app/services/scanner.py` and `backend/app/database.py`. No
  protected path is edited.

## Invariants

I1. A Markdown file written through any path in step 1 with a readable frontmatter `origin` string has `files.md_origin` equal to that string (stripped, at most 32 characters). The same file written again with readable frontmatter and no `origin`, or with no frontmatter, has `md_origin` `NULL`.
I2. A write, upload, copy or scan of a file whose frontmatter `has_unreadable_frontmatter` reports never changes its `md_origin`.
I3. After a scan, every active `.md` file of up to 1 MB that the scanner could read has the `md_origin` its on-disk frontmatter gives under I1 and I2, including a file edited outside Litloft since the last scan.
I4. A failure to project `origin` never fails or rolls back the write, upload, copy or scan that triggered it, and never changes the file's content, tags, `md_id` or `md_aliases`.
I5. For `files`, `shelves`, `watch-history` and `folder-counts`, `origin=X` returns only files whose `md_origin` is `X`, and `exclude_origin=X` returns exactly the files the same request without it returns, minus those whose `md_origin` is `X`.
I6. For the same conditions, `files`' `total` equals the `count` of `shelves?by=all&key=all`.
I7. `shelves?opened=false` returns only files for which the requesting viewer has no `watch_history` row, and `opened=true` only files for which it has one, whatever the position or duration. Another viewer's rows never change either answer.
I8. A request to `files`, `shelves`, `watch-history` or `folder-counts` without `origin`, `exclude_origin` or `opened` returns the same files, order and counts as before this change.
I9. An addon whose `navigation` is a single valid object yields exactly one entry, with the same `href`, label, icon, order and active state as before this change.
I10. A `navigation` list yields one entry per surviving element, each with a key unique among all entries. An invalid or repeated element is dropped without dropping the others.
I11. On any page, at most one addon sidebar row is active: the one whose `href` is the longest that equals the page path or lies above it.
I12. The Clips page lists only files of the current drive whose `md_origin` is `webclip`. Without a profile it draws New clips and Unverified, and no Recently opened.
I13. With `clips` absent, the Notes landing (Recent notes, its total, Continue writing) and All notes (list, total, folder counts) list and count no file whose `md_origin` is `webclip`.
I14. With `clips=1`, All notes lists the same files as before this change, and every link inside the view keeps `clips=1`.
I15. The Notes landing search returns files whose `md_origin` is `webclip` that match the query.
I16. The core never compares `md_origin` with a literal value; only a request parameter decides which value is kept or dropped.

## Checked, no action

- **Separating by folder or smart folder**: rejected with the user. Moving a clip into a
  topic folder would break a folder rule, and a smart folder cannot read frontmatter.
- **Knowledge's `clip_jobs` as the source of truth**: rejected with the user. Counts and
  paging would be off, a removed mark would not turn a clip back into a note, and a
  copied clip would count as a note.
- **No core-to-addon dependency**: the core reads a generic frontmatter key and stores it
  opaquely. Only Knowledge, in its own requests, names the value `webclip` (I16). This
  matches the core's existing projection of frontmatter `id`, `aliases` and `tags`.
- **A separate one-time backfill**: not needed. The scan pass in step 3 reads every active
  `.md` on each scan, which covers existing files, outside edits, and restored and
  recovered files. Until the first scan after the upgrade finishes, an old clip may still
  show in Notes.
- **Detecting outside edits through `_refresh_file_identity`**: it skips non-media files
  whose hash is known, and changing its gate would re-hash every file on every scan. The
  Markdown pass already reads the files, so it is used instead.
- **A scan racing a content write**: the scan can write the value it read just before a
  write landed. The next scan or write corrects it, and the same window already exists
  for the Markdown thumbnail projection. Not worth a lock.
- **Reusing `watch=unwatched` for Unread**: a Markdown opening writes a history row with
  `duration=0`, which `_watch_bucket` counts as `unwatched`. So an opened clip would stay
  "unread". The new `opened` condition avoids this, and `_watch_bucket` is left alone
  because Video and Reading depend on it.
- **Re-projecting tags and `md_id` on an outside edit**: Knowledge's note scanner handles
  tags today, and changing that is a separate decision. Only `md_origin` is added to the
  scan pass.
- **Filtering `getDriveTags` by origin**: a tag carried only by clips still shows in All
  notes' tag menu, and choosing it with clips hidden shows an empty list. This is visible,
  not silent, and rare. Left as is.
- **A reading position or a "mark as read" for clips**: Markdown has no position, and the
  user chose not to make clips a task list.
- **`FileResponse.md_origin`**: no consumer needs it, and leaving it out keeps responses
  unchanged.
- **Longest-match for built-in app rows**: their `href`s (`/drive/{d}/apps/...`) never lie
  under an addon `href`, so they keep today's rule.
- **MCP and the iOS app**: they send no new parameter and see no change.
- **Clips without Knowledge**: the entrance and the page are Knowledge's. Without the
  addon the column still fills, and nothing reads it.
