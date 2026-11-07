# Triage: r1

## Warnings

- core.hooksPath is '/Users/libre/Sources/video_share/.githooks', so the pre-push hook in .githooks does not run in this clone; fix: git config core.hooksPath .githooks

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: Any core MarkdownPreview or TextLines rendered under the ShellLayout knowledge-edit slot Provider (including ones the addon draws for other purposes) would record scroll under the file id.; The fixture app now selects its arrangement by query string, with the hash as a fallback.
- claude-read: Any core MarkdownPreview or TextLines rendered under the ShellLayout knowledge-edit slot Provider (including ones the addon draws for other purposes) would record scroll under the file id.
- claude-read: The fixture app now selects its arrangement by query string, with the hash as a fallback.
- claude-verify: The ShellLayout, TextLines and e2e-components edits go beyond the listed touch points.

### unspecified_behavior

Note: The ShellLayout, TextLines and e2e-components edits go beyond the listed touch points.
- claude-read: Any core MarkdownPreview or TextLines rendered under the ShellLayout knowledge-edit slot Provider (including ones the addon draws for other purposes) would record scroll under the file id.
- claude-read: The fixture app now selects its arrangement by query string, with the hash as a fallback.
- claude-verify: The ShellLayout, TextLines and e2e-components edits go beyond the listed touch points.

## Findings

A: 0
B: 4
C: 0

### claude-read:F1 — bucket B, LOW, open

Claim: The diff edits frontend/src/components/FileDetail/ShellLayout.tsx to wrap the knowledge-edit AddonSlot in TextScrollFileIdContext.Provider, a file the touch points do not list.
Impact: Every addon component rendered in the knowledge-edit slot of the full page now sees a file id through the context. Any core MarkdownPreview or TextLines inside that slot records and restores scroll under that id. Nothing in the touch points or invariants covers this path, so a future change to the slot could start recording by accident.
Evidence: frontend/src/components/FileDetail/ShellLayout.tsx:~492-507 (new Provider around AddonSlot); the test stub in FileDetail/__tests__/PlainTextDocument.test.tsx reads the context.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F2 — bucket B, LOW, open

Claim: The diff edits frontend/src/components/TextLines.tsx to call useTextScrollProgress, and TextLines is not a listed touch point (only TextPreview, MarkdownFileViewer and MarkdownPreview are).
Impact: TextLines also renders archive text entries (ArchiveTextViewer) and other callers. It records only when a TextScrollFileIdContext is set, which is null by default. I7 (a text entry inside an archive writes nothing) therefore depends on the absence of a Provider above it, not on any check in TextLines itself.
Evidence: frontend/src/components/TextLines.tsx:~91-95 (hook call with useContext(TextScrollFileIdContext)); the default value is null in lib/textScrollProgress.ts.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F3 — bucket B, LOW, open

Claim: The real-browser check was placed in frontend/e2e-components/ (new fixture textResume.tsx, spec text-resume-desktop.spec.ts, and edits to fixtures/app.tsx, projects.ts and spec-viewport.spec.ts), but the touch points name frontend/e2e-layout/.
Impact: The shared fixture app.tsx routing changed: the arrangement id is now read from ?arrangement= and falls back to the hash, and data-arrangement follows. All existing arrangements go through this new selection logic, so a regression there would hit unrelated suites. The registered-arrangements parity test componentFixtureParity.test.tsx was also edited.
Evidence: frontend/e2e-components/fixtures/app.tsx App() and the last lines (URLSearchParams selection); projects.ts and spec-viewport.spec.ts lists; componentFixtureParity.test.tsx ("text-resume" added).
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F4 — bucket B, INFO, open

Claim: The new lib modules import from the components layer (archiveProgress.ts imports ProfileProvider and components/archive/archiveUtils; textScrollProgress.ts imports ProfileProvider), and the touch points do not list archiveUtils as imported or ProfileProvider as read.
Impact: A lib to components dependency direction is created. archiveUtils is listed but not edited, so the archive-wide sequence lives in lib/archiveProgress.ts instead of archiveUtils.ts as declared.
Evidence: frontend/src/lib/archiveProgress.ts:1-8; frontend/src/lib/textScrollProgress.ts imports; frontend/src/components/archive/useArchiveNavigation.ts imports archiveImageSequence from @/lib.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: I did not open the repository files; the answer comes from the diff alone.
- claude-read: I did not check whether other callers of MarkdownPreview or TextLines sit under the new Provider.
- claude-read: I did not check the behaviour of the invariants themselves (I1 to I10).
- claude-read: I did not check whether the repository's process documents allow e2e-components in place of e2e-layout.
- claude-verify: Invariants I1-I10 behavior was not traced.
- claude-verify: Contents of the e2e-components edits were not opened.
- claude-verify: No tests were run, since I have no execution tool.

TOTAL: 4 findings
