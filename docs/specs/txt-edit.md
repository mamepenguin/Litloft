# Edit `.txt` files in the app

SPEC-ID: SPEC-CORE-020
SPEC-ID: SPEC-ADDON-037

Approval:

## Summary

A viewer can edit a plain-text `.txt` file from its file detail page, the way a Markdown
note is edited today. The knowledge addon's editor gains a plain-text mode: no Markdown
language, live preview, toolbar, frontmatter, wiki links or upload-on-paste, but the same
autosave, conflict handling, version history and keyboard save. Core opens a `.txt` in the
document layout with a two-way Read / Edit switch (no Split), and the Read view is the
current text viewer (line numbers, search-term highlight) drawn from the editor's buffer.
A file whose bytes the editor cannot write back unchanged (not UTF-8, mixed line endings)
stays readable but is not offered for editing. Without the knowledge addon, or with its
`editor` policy off for the drive, a `.txt` behaves as it does today.

SPEC-CORE-020 is core's half: which files take the document layout, the Read view, the
two-way switch, and tag chips that stay on `File.tags`. SPEC-ADDON-037 is the knowledge
editor's plain-text mode: loading, saving, and what it leaves out.

## Required items

### 1. Normal flow

1. A viewer opens a file whose name ends in `.txt` (case-insensitive) and whose
   `mime_type` is `text/plain`, at most 1 MB (`file_size <= 1048576`, the core write cap
   `_TEXT_WRITE_MAX_BYTES`), on a drive where the knowledge addon is installed and its
   `editor` policy is on, with `NEXT_PUBLIC_INLINE_KNOWLEDGE_EDITOR` not turned off.
   Such a file is a "plain-text document" below.
2. Core renders it in `MarkdownDocumentLayout`, as it does a `.md`, and mounts the
   `knowledge-edit` slot with the page's search `highlight` term in its props.
3. The layout opens in Read, or in Edit when the URL carries `?edit=1`. The view switch
   offers Read and Edit only, on every viewport width.
4. The editor, in plain-text mode, loads the body from `GET /api/files/{id}/stream` as
   bytes, decodes them as UTF-8 with `fatal: true`, and records whether the bytes began
   with a UTF-8 BOM and which line ending the file uses (LF or CRLF).
5. Read shows the editor's current buffer with line numbers, as `TextPreview` shows a
   text file today; a `highlight` term is highlighted and scrolled to as `TextPreview`
   does. Copying leaves the line numbers out.
6. In Edit the viewer types into a CodeMirror editor with no Markdown language and no
   decorations. Ctrl/Cmd+S keeps the current version; Ctrl/Cmd+Shift+\ switches between
   Read and Edit.
7. Autosave (the existing 2 s debounce) and explicit save send `PUT
   /api/files/{id}/content` with `If-Match`. Before sending, the buffer is re-encoded: the
   BOM is put back if the file had one, and every line break is written as CRLF if the
   file used CRLF. An unchanged line therefore keeps its bytes.
8. Version history (the `file-actions-menu` entry and panel) lists, previews, diffs and
   restores versions of the `.txt` as it does for a note.

### 2. Failure cases

- **The bytes are not valid UTF-8.** Read shows the text as `TextPreview` does today (a
  replacement-character decode). Edit shows a notice in place of the editor and no editor;
  nothing is ever written.
- **The line endings are mixed or use bare CR** (the body has a CR not followed by LF, or
  has both CRLF and a bare LF). Same as above: readable, Edit shows a notice, nothing is
  written.
- **The file grows past 1 MB while being edited.** Core returns 413; the editor shows its
  existing save-error state and keeps the buffer. The next open puts the file outside
  step 1 and it is read-only.
- **The file changed on disk since it was loaded** (412). The existing conflict dialog
  (Reload / Overwrite) runs. Reload and Overwrite load the body through step 4, so a file
  that has meanwhile become non-UTF-8 or mixed-ending falls to the two cases above.
- **Restoring a version.** The restore flow writes the version's text through step 7, so
  the file's current BOM and line ending are applied to it.
- **The knowledge addon is absent, its `editor` policy is off for the drive, or the inline
  editor flag is off.** The `.txt` opens on the canvas in `TextPreview` exactly as today.
- **Load fails** (network, 404): the editor's existing load-error state.

### 3. States

Per open plain-text document:

- `loading` → `editable` (decode and line-ending check pass) or `not-editable` (either
  fails) or `load-error`.
- `editable`: Read ⇄ Edit by the switch or the shortcut; within Edit the existing save
  states (`idle`, `dirty`, `saving`, `saved`, `error`, `conflict`).
- `not-editable` has no transition to `editable` without reopening the file. Read ⇄ Edit
  still switches, and Edit shows the notice.
- Reload / Overwrite / restore return to `loading`'s checks.

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

None. Nothing leaves the LAN; the only calls are to core's existing endpoints.

### 6. Authorization

Unchanged. `/stream`, `PUT /content`, `PUT /tags` and the versions endpoints already
apply drive access (`_get_file_or_404` with the viewer's unlocked groups). The editor's
availability per drive is the existing `knowledge` / `editor` policy read by
`usePolicy`, the same gate a `.md` uses.

### 7. Effect on existing features

- **Markdown notes.** Unchanged: the `.md` path (Markdown mode, Split, frontmatter, tag
  projection, wiki links, upload-on-paste) behaves as before. A row whose mime is
  `text/plain` but whose name ends in `.md` stays a Markdown note (core's `isMarkdown` and
  `_is_markdown_file` already match on the suffix).
- **Other `text/plain` files** (`.bat`, `.c`, `.h`, `.ksh`, `.pl`) and every other text
  kind stay in `TextPreview`, read-only, with syntax colour.
- **`.txt` over 1 MB** stays in `TextPreview`, including its "load anyway" prompt.
- **`TextPreview`** keeps its behaviour for every file it shows today; the line-number
  rendering it shares with the Read view is the same markup.
- **Tag chips on a `.txt`** keep writing `File.tags`, which is canonical for non-`.md`
  files (`design-decisions.md`, Tag editing).
- **The page chrome for a `.txt`** becomes the document layout's: the title row with
  rename, the save dot and the view switch, the inspector and mobile sheet as a `.md` has
  them. Rename does not add or strip any extension.
- **Knowledge features keyed on `.md`** (Notes lists, connections graph, capture basket,
  create note, clips) do not change; a `.txt` does not become a note.
- **Knowledge search and wiki-link autocomplete** already include `text/plain`; unchanged.
- **The legacy `?edit=<id>` route** on the knowledge page already redirects `text/plain`
  to the canonical URL with `?edit=1`; for a plain-text document that now lands in Edit.

### 8. Error behavior

- Not UTF-8 — the notice reads (en) "This file can't be edited here: it is not UTF-8
  text." / (ja) 「このファイルは UTF-8 のテキストではないため、ここでは編集できません。」
- Mixed or bare-CR line endings — (en) "This file can't be edited here: its line endings
  are mixed." / (ja) 「改行コードが混在しているため、ここでは編集できません。」
- 413 / 412 / load failure: the editor's existing messages. Nothing new is logged; core's
  existing write-path logging is unchanged.

### 9. User-visible behavior

- A `.txt` opens in the document layout, in Read by default, with a Read / Edit switch and
  no Split. The switch's labels are the existing ones (the "preview" label names Read).
- Read looks like today's text viewer (line numbers, no colour, highlight from search).
- Edit is a plain editor: no toolbar, no Markdown styling, no `[[` autocomplete; pasting
  or dropping a file inserts nothing and uploads nothing. Ctrl/Cmd+B, I, K, E and
  Shift+K insert nothing.
- The editor's accessible label reads "Text editor" / 「テキストエディタ」.
- Save timing, the save dot and the conflict dialog are those of the Markdown editor.
- Version history is available from the file's actions menu.
- An edited file keeps its encoding, BOM and line endings.

### 10. Non-functional

- Size: only files up to 1 MB take this path, matching core's write cap.
- Concurrency: the existing per-file write lock in core and the editor's per-file save
  queue; nothing new.
- Privacy and cost: no new data leaves the device or the LAN.

### Project questions (PROJECT.md)

- **Risk zones.** None of the HIGH or CRITICAL paths are edited; no backend change. The
  change is frontend in core and in the knowledge addon (a submodule: knowledge PR first,
  then a pointer bump in core).
- **What the agent cannot verify.** Nothing in `agent_cannot_verify` applies. IME input
  in the plain-text editor runs through the same CodeMirror view the Markdown editor uses.
- **Layout.** The Read view and the document layout with a `.txt` are checked in a real
  browser (Playwright), not in jsdom.

## Touch points

- `frontend/src/lib/fileDetailShell.ts`: `usesDocumentShell` (and so
  `ridesFileDetailShell`) takes a plain-text document; it needs the filename and size.
- `frontend/src/components/FileDetail/FileDetailContainer.tsx`,
  `frontend/src/components/FileDetailFullScreen.tsx`: the callers of the two functions
  above.
- `frontend/src/components/FileDetail/ShellLayout.tsx`: passes `highlight` into the
  `knowledge-edit` slot props; tells the layout the document is plain text.
- `frontend/src/components/markdown/MarkdownDocumentLayout.tsx`,
  `frontend/src/components/MarkdownViewModeToggle.tsx`,
  `frontend/src/lib/markdownChromeContext.tsx`: a plain-text document never enters Split.
- `frontend/src/components/TextPreview.tsx`: the line-numbered rendering is taken out as
  a component that takes text, so the Read view and `TextPreview` draw the same markup.
- `frontend/src/components/MarkdownAwareTagChips.tsx`: stays on `File.tags` for a `.txt`.
- `frontend/src/lib/textKind.ts` (or a sibling): one predicate for "plain-text document".
- `frontend/src/messages-core/{en,ja}.json`: only if a core string is added.
- `frontend/e2e-layout/` or `frontend/e2e-components/`: a `.txt` in the document layout.
- `addons/knowledge/frontend/KnowledgeEditSection.tsx`: `EDITABLE_MIMES` gate.
- `addons/knowledge/frontend/Editor.tsx`: plain-text mode (load, save, view modes,
  shortcuts, toolbar, wiki links, frontmatter, registry, resync-tags, upload, restore,
  conflict reload/overwrite).
- `addons/knowledge/frontend/MarkdownEditor.tsx`: language and live-preview extensions
  and paste/drop handlers by mode.
- `addons/knowledge/frontend/api.ts`: byte load with fatal UTF-8 decode, BOM and
  line-ending detection, re-encoding on save.
- `addons/knowledge/frontend/VersionHistoryPanel.tsx`,
  `addons/knowledge/frontend/VersionHistoryMenuItem.tsx`: available for a `.txt`.
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

I1. Opening a plain-text document in Edit and saving it after changing one line leaves every other line's bytes identical, including a leading UTF-8 BOM and CRLF line endings.
I2. A `.txt` whose bytes are not valid UTF-8, or whose line endings are mixed or bare CR, is never written by the editor: no `PUT /content` is sent for it on any path (autosave, explicit save, unmount save, Overwrite, restore).
I3. Saving a `.txt` from the editor never changes its `File.tags`; tag chips on a `.txt` write `File.tags` and never write the file's bytes.
I4. Nothing typed, pasted or dropped into the plain-text editor inserts Markdown syntax or uploads a file; the only text inserted is what the viewer typed or pasted as text.
I5. A plain-text document never shows Split, on any viewport width, by the switch or by the shortcut.
I6. The Read view shows the editor's current buffer, with line numbers that copying leaves out, and highlights a search `highlight` term as `TextPreview` does.
I7. A `.md` file (including one recorded with `mime_type` `text/plain`) keeps the Markdown editor, Split, frontmatter tag handling and wiki links exactly as before.
I8. A `text/plain` file not named `.txt`, a `.txt` over 1 MB, and any `.txt` on a drive without the knowledge editor (addon absent, policy off, inline flag off) render in `TextPreview` read-only as before.
I9. Core imports nothing from the knowledge addon; the plain-text decision reaches the addon only through the slot props and the existing chrome context.

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
