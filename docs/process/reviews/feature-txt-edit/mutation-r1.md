# Mutation review r1: feature/txt-edit (knowledge plain-text editor)

- Core: `72ef6b1ee`; knowledge submodule: `ea54ceb` (change `798f898..ea54ceb`).
- Worked in a separate worktree (`/Users/libre/Sources/video_share-mutate`), knowledge at `ea54ceb`.
- Baseline: `cd frontend && npx vitest run src/addons/knowledge` → 47 files, 592 tests, all pass.
- Method: one mutation at a time, `want` declared before running, whole addon suite run for every
  mutation, file restored with `git checkout -- <file>` in the submodule afterwards.
- Line numbers are those of `ea54ceb` under `addons/knowledge/frontend/`.

## Mutations

| # | file:line | change | want | result |
|---|---|---|---|---|
| M01 | `api.ts:260` | non-fatal UTF-8 decode | kill | killed by `SPEC-ADDON-037 a file the editor cannot write back unchanged (I2) > Read shows the text decoded with replaceme`; `SPEC-ADDON-037 a file the editor cannot write back unchanged (I2) > Reload that finds the file no longer edita` (+3 more) |
| M02 | `api.ts:260` | decoder strips the BOM (ignoreBOM false) | kill | killed by `SPEC-ADDON-037 every write keeps the file's form (I1) > Overwrite writes the buffer in the form the file has n`; `SPEC-ADDON-037 every write keeps the file's form (I1) > autosave of a BOM and CRLF file` (+4 more) |
| M03 | `api.ts:271` | BOM never detected | kill | killed by `SPEC-ADDON-037 every write keeps the file's form (I1) > Overwrite writes the buffer in the form the file has n`; `SPEC-ADDON-037 every write keeps the file's form (I1) > autosave of a BOM and CRLF file` (+4 more) |
| M04 | `api.ts:276` | bare CR not blocked | kill | killed by `SPEC-ADDON-037 a file the editor cannot write back unchanged (I2) > CRLF and bare CR: Edit shows the notice an`; `SPEC-ADDON-037 a file the editor cannot write back unchanged (I2) > bare CR: Edit shows the notice and no edit` (+1 more) |
| M05 | `api.ts:276` | CRLF+LF mix not blocked | kill | killed by `SPEC-ADDON-037 a file the editor cannot write back unchanged (I2) > Overwrite that finds the file not editable`; `SPEC-ADDON-037 a file the editor cannot write back unchanged (I2) > mixed CRLF and LF: Edit shows the notice a` |
| M06 | `api.ts:276` | any line break blocks | kill | killed by `SPEC-ADDON-037 every write keeps the file's form (I1) > Overwrite writes the buffer in the form the file has n`; `SPEC-ADDON-037 every write keeps the file's form (I1) > autosave of a BOM and CRLF file` (+4 more) |
| M07 | `api.ts:274` | CR inside CRLF counted as bare CR | kill | killed by `SPEC-ADDON-037 every write keeps the file's form (I1) > Overwrite writes the buffer in the form the file has n`; `SPEC-ADDON-037 every write keeps the file's form (I1) > autosave of a BOM and CRLF file` (+4 more) |
| M08 | `api.ts:283` | CRLF form never recorded | kill | killed by `SPEC-ADDON-037 every write keeps the file's form (I1) > Overwrite writes the buffer in the form the file has n`; `SPEC-ADDON-037 every write keeps the file's form (I1) > autosave of a BOM and CRLF file` (+4 more) |
| M09 | `api.ts:281` | CRLF not folded into buffer | kill | killed by `SPEC-ADDON-037 version history of a .txt (I10) > restores a version in the file's own form, after saving the d` |
| M10 | `api.ts:281` | BOM left in buffer | kill | killed by `SPEC-ADDON-037 loading and the file's form > shows the text without the BOM and with CRLF folded to LF`; `SPEC-ADDON-037 version history of a .txt (I10) > restores a version in the file's own form, after saving the d` |
| M11 | `api.ts:293` | restored version keeps its BOM (double BOM on write) | kill | killed by `SPEC-ADDON-037 version history of a .txt (I10) > restores a version in the file's own form, after saving the d` |
| M12 | `api.ts:293` | restored version's CRLF not folded | kill | killed by `SPEC-ADDON-037 version history of a .txt (I10) > restores a version in the file's own form, after saving the d` |
| M13 | `api.ts:288` | fold leaves bare CR (display of blocked text / restored bare-CR version only) | live | killed by `SPEC-ADDON-037 version history of a .txt (I10) > restores a version in the file's own form, after saving the d` |
| M14 | `api.ts:300` | CRLF not re-encoded | kill | killed by `SPEC-ADDON-037 every write keeps the file's form (I1) > Overwrite writes the buffer in the form the file has n`; `SPEC-ADDON-037 every write keeps the file's form (I1) > autosave of a BOM and CRLF file` (+4 more) |
| M15 | `api.ts:303` | BOM not re-encoded | kill | killed by `SPEC-ADDON-037 every write keeps the file's form (I1) > Overwrite writes the buffer in the form the file has n`; `SPEC-ADDON-037 every write keeps the file's form (I1) > autosave of a BOM and CRLF file` (+4 more) |
| M16 | `api.ts:264` | not-UTF-8 display text empty | kill | killed by `SPEC-ADDON-037 a file the editor cannot write back unchanged (I2) > Read shows the text decoded with replaceme` |
| M17 | `api.ts:254` | stream error status not an error | kill | killed by `SPEC-ADDON-037 failure cases that keep the buffer > a failed Overwrite probe writes nothing and keeps the buff`; `SPEC-ADDON-037 failure cases that keep the buffer > a failed Reload closes the conflict dialog, shows the save` (+1 more) |
| M18 | `Editor.tsx:437` | load does not record the form | kill | killed by `SPEC-ADDON-037 every write keeps the file's form (I1) > autosave of a BOM and CRLF file`; `SPEC-ADDON-037 every write keeps the file's form (I1) > autosave of a BOM and LF file` (+4 more) |
| M19 | `Editor.tsx:439` | load never blocks | kill | killed by `SPEC-ADDON-037 a file the editor cannot write back unchanged (I2) > CRLF and bare CR: Edit shows the notice an`; `SPEC-ADDON-037 a file the editor cannot write back unchanged (I2) > Read shows the text decoded with replaceme` (+4 more) |
| M20 | `Editor.tsx:461` | writeBody never re-encodes | kill | killed by `SPEC-ADDON-037 every write keeps the file's form (I1) > Overwrite writes the buffer in the form the file has n`; `SPEC-ADDON-037 every write keeps the file's form (I1) > autosave of a BOM and CRLF file` (+4 more) |
| M21 | `Editor.tsx:461` | .md also sent as bytes with default form (same bytes) | live | killed by `Editor explicit versions > applies a restored body through the reload state path and cancels pending autosave`; `Editor explicit versions > disables editing while loading a restore and aborts if content revision changes` (+4 more) |
| M22 | `Editor.tsx:585` | performSave guard removed | kill | **survived** |
| M23 | `Editor.tsx:623` | autosave-effect guard removed (performSave guard still holds) | live | **survived** |
| M24 | `Editor.tsx:693` | unmount-save guard removed | kill | killed by `SPEC-ADDON-037 a file the editor cannot write back unchanged (I2) > Overwrite that finds the file not editable` |
| M25 | `Editor.tsx:991` | keep-version guard removed (performSave guard; toolbar hidden) | live | **survived** |
| M26 | `Editor.tsx:1005` | restore guard removed (panel hidden when blocked) | live | **survived** |
| M27 | `Editor.tsx:1197` | Overwrite ignores a blocked probe | kill | killed by `SPEC-ADDON-037 a file the editor cannot write back unchanged (I2) > Overwrite that finds the file not editable`; `SPEC-ADDON-037 a file the editor cannot write back unchanged (I2) > held: Read shows the retained text and Edi` |
| M28 | `Editor.tsx:1207` | Overwrite keeps the stale form | kill | killed by `SPEC-ADDON-037 every write keeps the file's form (I1) > Overwrite writes the buffer in the form the file has n` |
| M29 | `Editor.tsx:1061` | restored version not normalised | kill | killed by `SPEC-ADDON-037 version history of a .txt (I10) > restores a version in the file's own form, after saving the d` |
| M30 | `Editor.tsx:568` | resync-tags + registry notify on plain save | kill | killed by `SPEC-ADDON-037 loading and the file's form > loads the body from /stream as bytes and sends no request but cor` |
| M31 | `Editor.tsx:510` | wiki resolutions fetched for plain | kill | **survived** |
| M32 | `Editor.tsx:660` | markdownContentRegistry.register for plain | kill | **survived** |
| M33 | `Editor.tsx:681` | touchContent for plain (no registration to touch) | live | **survived** |
| M34 | `Editor.tsx:912` | wiki trigger on typing in plain | kill | **survived** |
| M35 | `Editor.tsx:1429` | wiki trigger on selection in plain | kill | **survived** |
| M36 | `Editor.tsx:1431` | drop uploads in plain | kill | killed by `SPEC-ADDON-037 what the plain-text editor leaves out (I4, I10) > pasting or dropping an image inserts nothing ` |
| M37 | `Editor.tsx:1432` | paste uploads in plain | kill | killed by `SPEC-ADDON-037 what the plain-text editor leaves out (I4, I10) > pasting or dropping an image inserts nothing ` |
| M38 | `Editor.tsx:1168` | formatting shortcuts in plain | kill | killed by `SPEC-ADDON-037 what the plain-text editor leaves out (I4, I10) > Ctrl/Cmd+b {} is left alone`; `SPEC-ADDON-037 what the plain-text editor leaves out (I4, I10) > Ctrl/Cmd+e {} is left alone` (+4 more) |
| M39 | `Editor.tsx:1168` | .md loses formatting shortcuts (I7) | kill | **survived** |
| M40 | `Editor.tsx:1110` | plain cycles into Split | kill | killed by `SPEC-ADDON-037 a file the editor cannot write back unchanged (I2) > switches Read and Edit by the shortcut too`; `SPEC-CORE-020 the Read view and the two-way switch (I5, I6) > never enters Split on the shortcut and does not ` |
| M41 | `Editor.tsx:1110` | .md loses Split on shortcut (I7) | kill | **survived** |
| M42 | `Editor.tsx:1396` | formatting toolbar in plain | kill | killed by `SPEC-ADDON-037 what the plain-text editor leaves out (I4, I10) > draws only the … menu on the toolbar` |
| M43 | `Editor.tsx:1396` | .md loses toolbar (I7) | kill | **survived** |
| M44 | `Editor.tsx:1398` | file-link handler passed in plain (toolbar hidden by versionsOnly) | live | **survived** |
| M45 | `Editor.tsx:1496` | version panel shown for blocked doc | kill | killed by `SPEC-ADDON-037 a file the editor cannot write back unchanged (I2) > offers no toolbar, no version-history entr` |
| M46 | `Editor.tsx:1501` | plain version preview link-decoded | kill | killed by `SPEC-ADDON-037 version history of a .txt (I10) > shows a version's text raw, with no link decoding` |
| M47 | `Editor.tsx:1501` | .md version preview raw (I7) | kill | **survived** |
| M48 | `Editor.tsx:1423` | editor mounted for a not-editable doc | kill | killed by `SPEC-ADDON-037 a file the editor cannot write back unchanged (I2) > CRLF and bare CR: Edit shows the notice an`; `SPEC-ADDON-037 a file the editor cannot write back unchanged (I2) > bare CR: Edit shows the notice and no edit` (+2 more) |
| M49 | `Editor.tsx:1441` | held editor stays editable | kill | killed by `SPEC-ADDON-037 a file the editor cannot write back unchanged (I2) > Overwrite that finds the file not editable` |
| M50 | `Editor.tsx:818` | plain Escape blurs (also stops Tab insertion) | live | killed by `SPEC-ADDON-037 what the plain-text editor leaves out (I4, I10) > Escape then Tab does not insert a tab` |
| M51 | `Editor.tsx:408` | .md loaded through /stream (I7) | kill | killed by `Editor ConflictModal portal (PR-6) > dismiss button closes the modal`; `Editor ConflictModal portal (PR-6) > overwrite button refetches the etag and re-saves` (+4 more) |
| M52 | `Editor.tsx:1386` | toolbar shown on blocked doc | kill | killed by `SPEC-ADDON-037 a file the editor cannot write back unchanged (I2) > Overwrite that finds the file not editable`; `SPEC-ADDON-037 a file the editor cannot write back unchanged (I2) > offers no toolbar, no version-history entr` |
| M53 | `MarkdownEditor.tsx:325` | plain gets Markdown language/keymap | kill | killed by `SPEC-ADDON-037 what the plain-text editor leaves out (I4, I10) > Enter inserts a line break and carries no ind`; `SPEC-ADDON-037 what the plain-text editor leaves out (I4, I10) > Tab inserts a tab character` |
| M54 | `MarkdownEditor.tsx:124` | Enter carries indentation | kill | killed by `SPEC-ADDON-037 what the plain-text editor leaves out (I4, I10) > Enter inserts a line break and carries no ind` |
| M55 | `MarkdownEditor.tsx:117` | Tab not bound to insertTab | kill | killed by `SPEC-ADDON-037 what the plain-text editor leaves out (I4, I10) > Tab inserts a tab character` |
| M56 | `MarkdownEditor.tsx:119` | indent commands (Mod-[ ], Mod-Enter blank line) kept | kill | **survived** |
| M57 | `KnowledgeEditSection.tsx:82` | any text/plain edited without core's flag (I9) | kill | killed by `KnowledgeEditSection (flag true) > renders nothing for text/plain (C2: editor markdown-only)` |
| M58 | `KnowledgeEditSection.tsx:82` | flag alone suffices (core only sets it on text/plain) | live | **survived** |
| M59 | `KnowledgeEditSection.tsx:85` | txt gets full-editor link when inline flag off (I8) | kill | **survived** |
| M60 | `KnowledgeEditSection.tsx:99` | txt opened in Markdown mode | kill | killed by `SPEC-ADDON-037 a file the editor cannot write back unchanged (I2) > CRLF and bare CR: Edit shows the notice an`; `SPEC-ADDON-037 a file the editor cannot write back unchanged (I2) > Overwrite that finds the file not editable` (+4 more) |

Each mutation is described by what it does; the exact old/new strings are in the harness input and
are reproducible from the `file:line` given. "+N more" counts at most six failing tests recorded.

### Notes on `want` that did not match the result (not findings)

- **M13** (`want=live`, killed): folding a bare CR is load-bearing for a *restored* version, not only
  for blocked display; the restore test feeds a version containing `\rend` and catches it. My `want` was wrong.
- **M21** (`want=live`, killed): sending a `.md` as `Uint8Array` with the default form yields the
  same bytes; the `.md` suites fail only because they assert the PUT body is a string. Not a defect either way.
- **M50** (`want=live`, killed): the Escape-blur in plain mode is caught by "Escape then Tab does not
  insert a tab". The test pins the specified behaviour.
- **M23, M25, M26, M33, M44, M58** (`want=live`, survived): each is shadowed by another guard
  (performSave guard, hidden toolbar / version panel, no registry entry to touch, core sets the flag only
  for `text/plain`), as predicted.

## Findings (surviving `want=kill`)

### F1 — M32: `markdownContentRegistry.register` skip for plain text is unpinned
- Claim: removing `if (plainText) return;` at `Editor.tsx:660` passes the whole suite. With it removed,
  the `.txt` registers as a Markdown content source, and core's `MarkdownAwareTagChips`
  (`frontend/src/components/MarkdownAwareTagChips.tsx:35-45`) switches the tag chips into content mode
  whenever the document layout is active, so adding a tag rewrites the buffer with YAML frontmatter,
  which autosave then writes into the `.txt`.
- Invariant: I3 (tag chips on a `.txt` write `File.tags`, never the file's bytes); also I10.
- Bucket: **A** — ordinary use: open a `.txt` in the document layout and add a tag chip; the file gains a
  `---\ntags: …\n---` header and `File.tags` is not the write target. Today's code is correct; nothing stops
  the regression. (The core acceptance test for the next PR may cover the chip side; the addon suite does not.)

### F2 — M34 / M35: the wiki-link trigger skip in plain mode is unpinned
- Claim: removing `if (plainText) return;` in `handleEditorChange` (`Editor.tsx:912`, M34), or passing
  `updateWikiTrigger` as `onSelectionChange` (`Editor.tsx:1429`, M35), each survives. Typing `[[` in a
  `.txt` then opens `WikiLinkAutocomplete`; Enter while it is open picks a note and inserts `[[Title]]`
  instead of a line break.
- Invariant: I4 (Enter inserts only a line break; no Markdown syntax inserted), I10.
- Bucket: **A** (borderline: the popup is visible) — a viewer typing `[[` in a plain note and pressing
  Enter gets Markdown wiki syntax written into the file. No test types `[[` in plain mode.
  Counted as two findings (two independent unpinned switches).

### F3 — M43: `.md` toolbar can disappear with no test failing
- Claim: `versionsOnly={true}` at `Editor.tsx:1396` hides the whole formatting toolbar for every `.md`
  and the 592-test suite stays green. No Editor-level test asserts the formatting toolbar renders for `.md`
  (EditorToolbar.test exercises the component in isolation, with `versionsOnly` defaulting to false).
- Invariant: I7 (`.md` keeps the toolbar exactly as before).
- Bucket: **A** — breaks `.md` editing (formatting buttons gone) silently in CI.

### F4 — M39: `.md` formatting shortcuts can disappear with no test failing
- Claim: replacing `plainText ? [] : markdownShortcuts` with `[]` (`Editor.tsx:1168`) survives: no test
  presses Ctrl/Cmd+B/I/K/E/Shift+K in a `.md` editor at the Editor level since the list was hoisted.
- Invariant: I7 (formatting shortcuts unchanged for `.md`).
- Bucket: **A** — `.md` bold/italic/link shortcuts stop working.

### F5 — M41: `.md` loses Split on the view-mode shortcut with no test failing
- Claim: forcing the plain branch of `cycleViewMode` (`if (true)`, `Editor.tsx:~1110`) makes `.md`
  toggle only Edit/Read; nothing fails. No test cycles a `.md` through Split by Ctrl/Cmd+Shift+\.
- Invariant: I7 (`.md` keeps Split), I5 counterpart.
- Bucket: **A** — `.md` Split unreachable by shortcut.

### F6 — M47: `.md` version preview link decoding is unpinned
- Claim: `rawPreview={true}` for every file survives; `VersionHistoryPanel.test` does not cover
  the `.md` path through `decodeLinkTargets` via the Editor, and no panel test asserts decoding with
  `rawPreview` defaulted.
- Invariant: I7.
- Bucket: B — display-only regression in the version preview (percent-encoded link targets shown raw);
  writes nothing wrong.

### F7 — M59: `.txt` with the inline editor flag off is unpinned
- Claim: removing `if (isPlainText && !isInlineKnowledgeEditorEnabled()) return null;`
  (`KnowledgeEditSection.tsx:85`) survives. The section then shows the "open in editor" link for a `.txt`,
  which opens it in the full knowledge editor without `plainText`, i.e. the Markdown string path, which does
  not preserve a BOM or CRLF on write.
- Invariant: I8 (no editor and no editor link without the inline flag), I1 by consequence.
- Bucket: **A, conditional** on `NEXT_PUBLIC_INLINE_KNOWLEDGE_EDITOR=false` (default is true): with that
  configuration, following the link and typing in a CRLF/BOM `.txt` silently rewrites its line endings/BOM.

### F8 — M22: `performSave`'s plain-block guard is unpinned
- Claim: removing `if (plainBlockRef.current) return false;` (`Editor.tsx:585`) survives. Every caller is
  separately guarded (autosave effect, keep-version, unmount, Overwrite's blocked branch), so the guard only
  matters for a save already queued in `enqueueSaveOperation` when Overwrite marks the document held; that
  PUT carries the pre-probe ETag and the server would 412 it.
- Invariant: I2 (no PUT for a not-editable document on any path).
- Bucket: B — defence in depth; no normal-use path reaches wrong bytes. The last line of I2 is not tested
  on its own.

### F9 — M31: wiki-resolutions skip in plain mode is unpinned
- Claim: removing `if (plainText) return;` at `Editor.tsx:510` survives. The request goes to core's
  `/api/files/{id}/wiki-resolutions` (not a knowledge endpoint), so the I10 test's `/api/addons/` filter does
  not see it.
- Invariant: I10 only in spirit (the request is core's); nothing is written.
- Bucket: B — one wasted request per load/save.

### F10 — M56: indentation commands survive in the plain keymap
- Claim: removing the `indentingCommands` filter (`MarkdownEditor.tsx:119`) survives. Mod-] / Mod-[ /
  Mod-Alt-\ / Mod-Enter (`insertBlankLine`, which carries indentation) are then active in a `.txt`.
- Invariant: I4 (no carried indentation).
- Bucket: B — needs a deliberate editor shortcut; the effect is visible in the buffer.

## Summary

- 60 mutations: 51 `want=kill` / 9 `want=live`.
- `want=kill`: 40 killed, 11 survived (M22, M31, M32, M34, M35, M39, M41, M43, M47, M56, M59).
- `want=live`: 6 survived as predicted, 3 killed (M13, M21, M50; notes above).
- Form detection, fatal decode, every re-encoding path (autosave, explicit, unmount, restore draft,
  Overwrite, restore normalisation) and the I2 load/Reload/Overwrite/unmount guards are all pinned.
- Gaps cluster in (a) `.md` regressions the addon suite no longer sees at the Editor level (F3, F4, F5, F6)
  and (b) plain-mode switches whose consequence lands in core or in an autocomplete (F1, F2).

TOTAL: 11 findings
