# Edit `.txt` files in the app

SPEC-ID: SPEC-CORE-020
SPEC-ID: SPEC-ADDON-037

Approval:

## Summary

A viewer can edit a plain-text `.txt` file from its file detail page, the way a Markdown
note is edited today. The knowledge addon's editor gains a plain-text mode: no Markdown
language, live preview, formatting buttons, frontmatter, wiki links or upload-on-paste,
but the same autosave, conflict handling, version history and keyboard save. Core opens a
`.txt` in the document layout with a two-way Read / Edit switch (no Split), and the Read
view is the current text viewer (line numbers, search-term highlight) drawn from the
editor's buffer. A file whose bytes the editor cannot write back unchanged (not UTF-8,
mixed line endings) stays readable but is not offered for editing. Without the knowledge
addon, with its `editor` policy off for the drive, or with the inline editor flag off, a
`.txt` behaves as it does today.

SPEC-CORE-020 is core's half: which files take the document layout, the slot prop that
tells the addon so, the Read view, the two-way switch, and tag chips that stay on
`File.tags`. SPEC-ADDON-037 is the knowledge editor's plain-text mode: loading, saving,
and what it leaves out.

## Required items

### 1. Normal flow

1. A viewer opens a file whose name ends in `.txt` (case-insensitive), whose `mime_type`
   is `text/plain`, and whose `file_size` is at most 1,048,576 bytes (core's write cap
   `_TEXT_WRITE_MAX_BYTES`). Core decides it is a **plain-text document** when, in
   addition:
   - a `file-detail-sections` slot entry with id `knowledge-edit` is registered (the
     addon is installed; the same id `ShellLayout` already names in `includeIds`),
   - `usePolicy(drive, "knowledge", "editor").enabled` is true (the input `.md` uses), and
   - `isInlineKnowledgeEditorEnabled()` is true.
   This is the only place the decision is made. While the addon slot list for the
   file's drive has not arrived (`AddonSlotsProvider` still loading, or its catalogue
   belongs to another drive), core cannot decide and draws the existing file-detail
   skeleton in the canvas: no viewer, no editor, no write.
2. Core renders a plain-text document in `MarkdownDocumentLayout`, as it does a `.md`, on
   both the canonical and the collection surface (`/files/{id}?collection=` /
   `?folder_play=1`), exactly as `.md` already does. It mounts the `knowledge-edit` slot
   with `plainTextDocument: true` and the page's search `highlight` term added to the
   slot props. The title row shows `file.filename`, as for a `.md`.
3. The layout opens in Read, or in Edit when the URL carries `?edit=1`. The view switch
   offers Read and Edit only, on every viewport width.
4. `KnowledgeEditSection` renders the editor in plain-text mode only when its props carry
   `plainTextDocument: true`. For any `text/plain` file without that prop it renders
   nothing (so a `.txt` core keeps on the canvas shows no editor or editor link in the
   inspector). The `.md` gate is unchanged.
5. The editor loads the body with a new plain-text loader (the existing `getFileContent`
   and its callers, the capture basket among them, are unchanged): `GET
   /api/files/{id}/stream` as bytes, decoded as UTF-8 with `fatal: true`. It records the
   file's **form**: whether the bytes begin with a UTF-8 BOM, and its line ending — LF
   when the body has no CR, CRLF when every line break is CRLF, LF when the body has no
   line break at all. The BOM is removed and CRLF folded to LF before the text enters the
   editor.
6. Read shows the editor's current buffer through the same line-numbered rendering
   `TextPreview` uses, with its limits: above 512 K characters, 5,000 lines or any line
   over 5,000 characters it shows the text without numbers and with `TextPreview`'s
   too-large notice. Read is computed only while it is visible: it is rebuilt from the
   buffer each time the view switches to Read, and does no work while Edit is shown, so
   typing costs nothing for Read. A `highlight` term is highlighted, and the view
   scrolls to it the first time Read is shown after the file opens (also when the page
   opened in Edit with `?edit=1`), once per open. Copying leaves the line numbers out. Read publishes a document-capture controller as
   `TextPreview` does, and `KnowledgeEditSection` mounts its capture action for a `.txt`
   as for a `.md`.
7. In Edit the viewer types into a CodeMirror editor with no Markdown language and no
   decorations; its edit area is labelled "Text editor" / 「テキストエディタ」. Above it
   is a toolbar with only Keep version and History. Ctrl/Cmd+S keeps the current
   version; Ctrl/Cmd+Shift+\ switches between Read and Edit. The editor registers no
   formatting shortcut (see §9). In plain-text mode the editor sends no request to any
   knowledge addon endpoint (no wiki-resolution fetch, no `resync-tags`); every call it
   makes is to core.
8. Every write of a plain-text document re-encodes the text in the file's form: line
   breaks are LF in the editor; on write they become CRLF if the form is CRLF, and the
   BOM is prepended if the form has one. This covers autosave (the existing 2 s
   debounce), explicit save, the unmount save, the dirty-draft save restore sends first,
   Overwrite, and restore itself. All of them use `PUT /api/files/{id}/content` with
   `If-Match`.
9. Version history (the `file-actions-menu` entry and the panel) lists, previews, diffs
   and restores versions of the `.txt` as it does for a note. A restored version's text
   is first normalised (one leading BOM removed; CRLF and bare CR folded to LF) and then
   re-encoded per step 8, so the restored file has the current form whatever form the
   version was stored in. In plain-text mode the panel shows a version's text raw, as
   stored: no Markdown link decoding (`decodeLinkTargets`).
10. Renaming a plain-text document from the title row first saves any unsaved buffer
    (step 8) and makes the editor read-only until the rename settles. If that save
    fails (412, 413, network), the rename is not sent. After a successful rename the
    editor sends no further write; core re-decides step 1 with the new name, so a name
    still ending in `.txt` keeps the document open, and any other name moves the page to
    whatever that name gets (for a `.md` with `mime_type` `text/plain`, today's canvas).

### 2. Failure cases

- **The bytes are not valid UTF-8.** The document is **not editable**. Read shows the
  text decoded with replacement characters (as `TextPreview` shows it today). Edit shows
  a notice in place of the editor. No write is ever sent.
- **The line endings are mixed or use bare CR** (a CR not followed by LF, or both CRLF and
  a bare LF). Not editable, as above.
- **The file grows past 1 MB while being edited.** Core returns 413; the editor shows its
  existing save-error state and keeps the buffer. The next open puts the file outside
  step 1 and it is read-only.
- **The file changed on disk since it was loaded** (412). The existing conflict dialog:
  - **Reload** loads the body through step 5. If it is now not editable, the document
    becomes not editable, and the viewer's unsaved text is discarded as Reload already
    discards it for a note.
  - **Overwrite** loads the current bytes through step 5 to get the ETag and the form.
    If they are editable, it writes the buffer in the form found now. If they are not
    editable, nothing is written: the editor keeps the viewer's text visible and
    selectable (read-only), shows the notice beside it, and sends no further write,
    autosave or unmount save included.
- **Restoring a version** of a document that is editable follows step 9. A not-editable
  document offers no version history (below).
- **The knowledge addon is absent, its `editor` policy is off for the drive, or the inline
  editor flag is off.** The `.txt` opens on the canvas in `TextPreview` exactly as today,
  and the inspector shows no editor.
- **Policy first load.** `usePolicy` is fail-open while loading, so a `.txt` on a
  policy-off drive may mount the editor for that moment. The editor writes only when the
  buffer is dirty, and no input reaches it in that window.
- **Load fails** (network, 404, or `/stream` answers without an ETag because the file on
  disk grew past 1 MB before a rescan): `load-error`, shown with the editor's existing
  load-error display. It is left by reopening the file, as today.
- **Reload fails** (network): the buffer is kept and the conflict stays, with the
  editor's existing save-error message, as today.

### 3. States

Per open plain-text document:

- `loading` → `editable` (decode and line-ending check pass), `not-editable` (either
  fails) or `load-error`.
- `editable`: Read ⇄ Edit by the switch or the shortcut; within Edit the existing save
  states (`idle`, `dirty`, `saving`, `saved`, `unchanged`, `error`, `conflict`).
- `conflict` → Reload → `loading` (or stays `conflict` if Reload fails); → Overwrite →
  `saving` (current bytes editable) or `held` (current bytes not editable).
- `renaming` (from `editable`, step 10): the buffer is saved, then the rename is sent;
  read-only throughout. A failed save returns to `editable` with its error; a successful
  rename ends the editor's writes.
- `held`: the viewer's text shown read-only with the notice; no write leaves this state.
  Read ⇄ Edit still switches, and Read draws the retained text. The buffer stays dirty,
  so leaving the page shows the existing unsaved-changes prompt. It ends when the file is
  closed or reopened.
- `not-editable`: Read ⇄ Edit still switches, and Edit shows the notice. The version
  history entry and panel are not offered. Nothing leads to `editable` without reopening
  the file.

### 4. Data read and written

- The `.txt` file on disk: read via `/stream`; written via `PUT /content` (core's
  existing write path, unchanged).
- `file_versions` (core): written by `PUT /content` and read by the versions endpoints,
  unchanged.
- `File.tags`: never written by a content save of a `.txt`. Tag chips write it through the
  existing flat `PUT /api/files/{id}/tags`.
- Knowledge addon DB: nothing. The plain-text mode does not call `resync-tags`, does not
  touch `note_origins`, and does not register in `markdownContentRegistry`.
- No new table, column, endpoint or event.

### 5. External services

None. Nothing leaves the LAN; the plain-text editor's only calls are to core's existing
endpoints (step 7).

### 6. Authorization

Unchanged. `/stream`, `PUT /content`, `PUT /tags` and the versions endpoints already
apply drive access (`_get_file_or_404` with the viewer's unlocked groups). The editor's
availability per drive is the existing `knowledge` / `editor` policy, the same gate a
`.md` uses.

### 7. Effect on existing features

- **Markdown notes.** Unchanged: the `.md` path (Markdown mode, Split and its rotation and
  mobile snap, frontmatter, tag projection, wiki links, upload-on-paste, formatting
  shortcuts and their help entries, the full toolbar, title-row rename) behaves as
  before. A row whose mime is `text/plain` but whose name ends in `.md` is not a
  plain-text document and keeps today's behaviour: the canvas, with no editor.
- **Other `text/plain` files** (`.bat`, `.c`, `.h`, `.ksh`, `.pl`) and every other text
  kind stay in `TextPreview`, read-only, with syntax colour.
- **`.txt` over 1 MB** stays in `TextPreview`, including its "load anyway" prompt.
- **`TextPreview`** and the other viewers that draw text through it (the ZIP archive
  viewer among them) keep their behaviour: syntax colour, decoration limits, bare-CR
  folding, copy without numbers, the large-file prompt. The extracted rendering is the
  same markup.
- **Tag chips on a `.txt`** keep writing `File.tags`, which is canonical for non-`.md`
  files (`design-decisions.md`, Tag editing).
- **The page chrome for a `.txt`**, on the canonical and the collection surface, becomes
  the document layout's: the title row (showing `file.filename`, not `file.title`) with
  rename, the save dot and the view switch, the inspector and mobile sheet as a `.md` has
  them, with exactly one page row on the collection surface. Rename does not add or
  strip any extension (step 10).
- **First open of any `.txt`** waits on the addon slot list (step 1) and shows the
  skeleton until it arrives, where today the text appears without waiting for it.
- **Document capture from a `.txt`** keeps working in Read (step 6).
- **Global search (Ctrl/Cmd+K)** behaves on a `.txt` as with any text field: it opens
  from Read and when the editor does not have focus, and does nothing while typing in
  Edit. The shared shortcut layer is not changed.
- **Knowledge features keyed on `.md`** (Notes lists, connections graph, capture basket,
  create note, clips) do not change; a `.txt` does not become a note.
- **Knowledge search and wiki-link autocomplete** already include `text/plain`; unchanged.
- **Addon re-indexing.** Each save emits `files.updated` as a note's save does, so
  intelligence and knowledge search re-index an edited `.txt` as they do an edited note.
- **The legacy `?edit=<id>` route** on the knowledge page already redirects `text/plain`
  to the canonical URL with `?edit=1`; for a plain-text document that lands in Edit.

### 8. Error behavior

- Not UTF-8 — the notice reads (en) "This file can't be edited here: it is not UTF-8
  text." / (ja) 「このファイルは UTF-8 のテキストではないため、ここでは編集できません。」
- Mixed or bare-CR line endings — (en) "This file can't be edited here: its line endings
  are mixed." / (ja) 「改行コードが混在しているため、ここでは編集できません。」
- Overwrite finding the file not editable (`held`) — the matching notice above, shown
  beside the viewer's retained text.
- 413 / 412 / load failure: the editor's existing messages. Nothing new is logged; core's
  existing write-path logging is unchanged.

### 9. User-visible behavior

- A `.txt` opens in the document layout, in Read by default, with a Read / Edit switch and
  no Split. The switch's labels are the existing ones (the "preview" label names Read).
- Read looks like today's text viewer (line numbers, no colour, highlight from search,
  the same too-large handling).
- Edit is a plain editor with a toolbar holding only Keep version and History: no
  formatting buttons, no file-link button, no Markdown styling, no `[[` autocomplete.
  Pasting or dropping a file inserts nothing and uploads nothing.
- Ctrl/Cmd+B, I, K, E and Shift+K are not taken by the editor; they do what they do in
  any text field of the app. The shortcut help lists no formatting entries while a
  `.txt` is open.
- The editor's edit area is labelled "Text editor" / 「テキストエディタ」. The view
  switch group keeps its existing label.
- Save timing, the save dot and the conflict dialog are those of the Markdown editor.
- An edited file keeps its encoding, BOM and line endings; a file with no line break
  gets LF.

### 10. Non-functional

- Size: only files up to 1 MB take this path, matching core's write cap.
- Concurrency: the existing per-file write lock in core and the editor's per-file save
  queue; nothing new.
- Privacy and cost: no new data leaves the device or the LAN.

### Project questions (PROJECT.md)

- **Risk zones.** None of the HIGH or CRITICAL paths are edited; no backend change. The
  change is frontend in core and in the knowledge addon (a submodule). Order:
  1. Core PR 1: extract the line-numbered renderer from `TextPreview` as an exported
     component, behaviour-preserving for every current viewer; merged to develop.
  2. Knowledge PR: plain-text mode, built and tested against core develop with PR 1.
  3. Core PR 2: the predicate, slot props, Split rule, rename flush and docs, together
     with the pointer bump to the merged knowledge commit, so no core commit sends a
     `.txt` to the document layout without the addon commit that fills it.
- **What the agent cannot verify.** Nothing in `agent_cannot_verify` applies. IME input
  in the plain-text editor runs through the same CodeMirror view the Markdown editor uses.
- **Layout.** The Read view and the document layout with a `.txt` are checked in a real
  browser (Playwright), not in jsdom.

## Touch points

- `frontend/src/lib/fileDetailShell.ts`: `usesDocumentShell` / `ridesFileDetailShell`
  take a plain-text document; their inputs grow to the filename, size, the
  `knowledge-edit` slot's presence and the inline flag.
- `frontend/src/lib/textKind.ts` (or a sibling): the "plain-text document" predicate.
- `frontend/src/components/FileDetail/FileDetailContainer.tsx`,
  `frontend/src/components/FileDetailFullScreen.tsx`: the callers, canonical and
  collection surface.
- `frontend/src/components/FileDetail/ShellLayout.tsx`: adds `plainTextDocument` and
  `highlight` to the `knowledge-edit` slot props; tells the layout the document is plain
  text.
- `frontend/src/components/markdown/MarkdownDocumentLayout.tsx`,
  `frontend/src/components/MarkdownViewModeToggle.tsx`,
  `frontend/src/lib/markdownChromeContext.tsx`: a plain-text document never enters
  Split; the chrome context carries the editor's save-before-rename hook (step 10), and
  the title-row rename awaits it for a plain-text document.
- `frontend/src/components/AddonSlotsProvider.tsx` (read only): whether the slot list for
  the file's drive has arrived.
- `frontend/src/components/TextPreview.tsx`: the line-numbered rendering (with its limits,
  highlight and capture publishing) is taken out as a component that takes text.
- `frontend/src/components/MarkdownAwareTagChips.tsx`: stays on `File.tags` for a `.txt`.
- `frontend/src/messages-core/{en,ja}.json`: only if a core string is added.
- `frontend/e2e-layout/` or `frontend/e2e-components/`: a `.txt` in the document layout.
- `addons/knowledge/frontend/KnowledgeEditSection.tsx`: the gate reads
  `plainTextDocument`; capture action mounted for a `.txt`.
- `addons/knowledge/frontend/Editor.tsx`: plain-text mode (load, form, save re-encoding,
  view modes, shortcuts, wiki links, frontmatter, registry, resync-tags, upload, restore,
  Reload / Overwrite, `held`, version history availability).
- `addons/knowledge/frontend/EditorToolbar.tsx`: the version-only toolbar.
- `addons/knowledge/frontend/MarkdownEditor.tsx`: language, live preview and paste/drop
  handlers by mode.
- `addons/knowledge/frontend/api.ts`: a new plain-text loader and encoder;
  `getFileContent` unchanged.
- `addons/knowledge/frontend/VersionHistoryPanel.tsx`,
  `addons/knowledge/frontend/VersionHistoryMenuItem.tsx`: available for an editable
  `.txt`, raw text preview in plain-text mode.
- `addons/knowledge/frontend/messages/{en,ja}.json`: the two notices and the editor label.
- The `addons/knowledge` gitlink in core.
- Rules passed through: `.claude/rules/design-decisions.md` (Tag editing; Addons:
  implementation discipline — no core-to-addon dependency),
  `.claude/rules/frontend-conventions.md` (DESIGN.md, i18n files), `DESIGN.md`.
- Docs: `docs/user-guide/viewers-and-players.md` (Text files),
  `docs/user-guide/keyboard-shortcuts.md` (the view switch shortcut on a `.txt`),
  `docs/addons/knowledge.md` (The editor; Version history).
- No protected path is edited.

## Invariants

I1. Every write of a plain-text document (autosave, explicit save, unmount save, restore's draft save, Overwrite, restore, the save before a rename) leaves the file with exactly one leading UTF-8 BOM if its form has one and none otherwise, and with every line break in the form's ending; a line the viewer did not change keeps its bytes.
I2. A `.txt` whose bytes are not valid UTF-8, or whose line endings are mixed or bare CR, at load, Reload or Overwrite time, is never written by the editor: no `PUT /content` is sent for it on any path.
I3. Saving a `.txt` from the editor never changes its `File.tags`, including across a title-row rename: no write from the plain-text editor reaches the file after the rename is sent. Tag chips on a `.txt` write `File.tags` and never write the file's bytes.
I4. Nothing typed, pasted or dropped into the plain-text editor inserts Markdown syntax or uploads a file; the only text inserted is what the viewer typed or pasted as text.
I5. A plain-text document renders in the document layout with exactly one page row on both the canonical and the collection surface, and never shows Split, on any viewport width, by the switch or by the shortcut.
I6. The Read view draws the editor's current buffer with the same rendering and limits as `TextPreview` (line numbers that copying leaves out, the too-large fallback), highlights a search `highlight` term, and publishes a document-capture controller.
I7. A `.md` file keeps the Markdown editor, Split, frontmatter tag handling, wiki links, formatting shortcuts, toolbar and rename exactly as before; a `.md` recorded with `mime_type` `text/plain` keeps today's canvas with no editor.
I8. A `text/plain` file not named `.txt`, a `.txt` over 1,048,576 bytes, and any `.txt` without the knowledge editor (addon absent, policy off, inline flag off) render in `TextPreview` read-only as before, with no editor and no editor link anywhere on the page; every file `TextPreview` shows today keeps its syntax colour, decoration limits, bare-CR folding, copy without numbers and over-1 MB prompt.
I9. Core imports nothing from the knowledge addon, and the addon renders a `text/plain` file in the editor only when core passes `plainTextDocument: true` in the slot props.
I10. In plain-text mode the editor sends no request to a knowledge addon endpoint, its version-history panel shows a version's text exactly as stored, and a not-editable document offers no version-history entry or panel.

## Checked, no action

- **Other `text/plain` suffixes and source code.** Only `.bat .c .h .ksh .pl` share the
  mime, while `.cpp .py .js .ts .go .yaml` carry `application/octet-stream`; enabling the
  first set would look arbitrary, and widening the mime of the second is a security
  decision (`filetype.py`: the mime keys the addon read allowlist). Source-code editing
  (colour, indentation, tabs) is a later spec. The user chose `.txt` only.
- **A core-owned editor without the knowledge addon.** Rejected by the user: it would
  duplicate save, conflict and version handling and have no version-history UI.
- **Split for `.txt`.** There is no rendering that differs from the source; the user
  chose Read / Edit only.
- **Syntax colour in Read.** A `.txt` has no language in `codeLanguageFor`, so today's
  viewer draws it uncoloured too.
- **Renaming the switch's "preview" label to "Read" for `.txt`.** Kept as the existing
  labels to keep the shared toggle unchanged.
- **The view switch group's "Markdown view mode" label on a `.txt`.** Kept, with the
  existing button labels, to leave the shared toggle unchanged.
- **Ctrl/Cmd+K opening global search while typing in a `.txt`.** The user chose the
  app-wide text-field behaviour; the shared shortcut layer stays as it is.
- **Showing `file.title` in the document layout's title row.** The layout shows and
  renames `file.filename` for a `.md`; a `.txt` follows it.
- **CRLF and BOM preservation for `.md`.** The Markdown editor folds CRLF to LF today; that
  is an existing behaviour of a different path and not changed here.
- **Re-decoding a non-UTF-8 file (Shift_JIS etc.) for editing.** Out of scope; such files
  are read-only (personal-tool premise: legacy encodings are not chased).
- **The non-inline full-page knowledge editor** (`NEXT_PUBLIC_INLINE_KNOWLEDGE_EDITOR`
  off). Its title field appends `.md` on rename; a `.txt` gets no edit entry in that
  configuration instead of a second path to fix.
- **Backend changes.** None needed: `PUT /content`, ETag on `/stream` and the versions
  endpoints already accept `text/plain`, and `_is_markdown_file` already keeps
  frontmatter work to `.md`.
- **Knowledge `resync-tags` on a `.txt`.** It would parse frontmatter out of plain text and
  replace `File.tags` (canonical for non-`.md`) with the result, usually `[]`. The plain
  mode does not call it (I3).
- **Version history for a not-editable `.txt`.** Not offered: restore would have to write,
  which I2 forbids, and a read-only history without restore is not worth a separate path.
- **Re-indexing on every autosave of a `.txt`.** The same as an edited note; the addons
  already handle a stream of `files.updated` while a note is typed.
