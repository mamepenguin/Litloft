# Triage: r2

## Warnings

- core.hooksPath is '/Users/libre/Sources/video_share/.githooks', so the pre-push hook in .githooks does not run in this clone; fix: git config core.hooksPath .githooks

## Trajectory

This run:
- claude-read: No. The code fix since r1 adds no branch, no state and no prediction. Commit 5a72cf674 changes two rows of an existing test table. Commit b780e8a1a adds one string to the existing FILE_LOCATION_PARAMS list, which the existing id comparison and loop at useSelectedFile.ts:43-45 already handle. The round removes a behaviour, the phrase carrying over to the next file, and with it the stale-phrase route to a wrong mark or scroll on the next note. It also does not touch the frame guard or the Editor's highlightSpent state. Commits 9df30cf7f and 85e610287 are described as docs records; their diffs were not in the brief. The design is not being patched on this evidence.

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

Note: clearFile (useSelectedFile.ts:55-62) and the folder-row press that calls it (TwoPaneLayout.tsx:68-69) leave ?highlight= in the URL with no file selected; run 4 in decisions.md recorded this as /drive/alpha/notes?highlight=<phrase>. I found no user-visible effect: RightPaneFile reads it only with a file selected, selectFile deletes it because the file id differs (null !== id), and card links rebuild the query. The same applies to section, page and t, and predates this fix.; Carried over from r1 and unchanged: a citation phrase with no match in the note's body, or found only in its frontmatter, scrolls the container to its start (useHighlightPassage.ts:94-98). This puts the frontmatter table above the visible area; decisions.md measured scrollTop 153. The F1 fix removes the stale-phrase route to this behaviour, so it now needs a citation whose phrase does not match the cited note.; Carried over from r1 and unchanged: highlightSpent is set when Read is left even if no highlight was present, and it resets only per mount (Editor.tsx:1274-1284). A first ?highlight= arriving on an already mounted note after Read was left is ignored. The only producer found goes through a separate page, so I found no normal-use route to it.
- claude-read: clearFile (useSelectedFile.ts:55-62) and the folder-row press that calls it (TwoPaneLayout.tsx:68-69) leave ?highlight= in the URL with no file selected; run 4 in decisions.md recorded this as /drive/alpha/notes?highlight=<phrase>. I found no user-visible effect: RightPaneFile reads it only with a file selected, selectFile deletes it because the file id differs (null !== id), and card links rebuild the query. The same applies to section, page and t, and predates this fix.
- claude-read: Carried over from r1 and unchanged: a citation phrase with no match in the note's body, or found only in its frontmatter, scrolls the container to its start (useHighlightPassage.ts:94-98). This puts the frontmatter table above the visible area; decisions.md measured scrollTop 153. The F1 fix removes the stale-phrase route to this behaviour, so it now needs a citation whose phrase does not match the cited note.
- claude-read: Carried over from r1 and unchanged: highlightSpent is set when Read is left even if no highlight was present, and it resets only per mount (Editor.tsx:1274-1284). A first ?highlight= arriving on an already mounted note after Read was left is ignored. The only producer found goes through a separate page, so I found no normal-use route to it.
- claude-verify: A note opened with a phrase that has no match scrolls its container to the top (frontend/src/hooks/useHighlightPassage.ts:94-98). decisions.md records scrollTop 153 with the frontmatter table above the visible area and does not say this was chosen. docs/specs/citation-quote-anchor.md has no text on this case in a keyword search. This was raised in r1; the commits since then do not change it. It is no longer reached by selecting another file, only by opening a URL that carries a phrase with no match.
- claude-verify: clearFile keeps highlight in the URL (frontend/src/hooks/useSelectedFile.ts:58-59), so pressing the folder row leaves /drive/<path>?highlight=<phrase>, as decisions.md run 4 records. The next selectFile drops it because the absent file param differs from the new id (line 43), so no later note is marked. The only remaining effect is a stale parameter in the address bar, plus any other page or link that copies the query string, which I did not trace.
- claude-verify: Selecting the same file keeps the phrase by design (useSelectedFile.test.tsx:78), so the mark stays when the current file is pressed again; decisions.md run 4 records no repeated scroll in that case.

### unspecified_behavior

Note: A note opened with a phrase that has no match scrolls its container to the top (frontend/src/hooks/useHighlightPassage.ts:94-98). decisions.md records scrollTop 153 with the frontmatter table above the visible area and does not say this was chosen. docs/specs/citation-quote-anchor.md has no text on this case in a keyword search. This was raised in r1; the commits since then do not change it. It is no longer reached by selecting another file, only by opening a URL that carries a phrase with no match.; clearFile keeps highlight in the URL (frontend/src/hooks/useSelectedFile.ts:58-59), so pressing the folder row leaves /drive/<path>?highlight=<phrase>, as decisions.md run 4 records. The next selectFile drops it because the absent file param differs from the new id (line 43), so no later note is marked. The only remaining effect is a stale parameter in the address bar, plus any other page or link that copies the query string, which I did not trace.; Selecting the same file keeps the phrase by design (useSelectedFile.test.tsx:78), so the mark stays when the current file is pressed again; decisions.md run 4 records no repeated scroll in that case.
- claude-read: clearFile (useSelectedFile.ts:55-62) and the folder-row press that calls it (TwoPaneLayout.tsx:68-69) leave ?highlight= in the URL with no file selected; run 4 in decisions.md recorded this as /drive/alpha/notes?highlight=<phrase>. I found no user-visible effect: RightPaneFile reads it only with a file selected, selectFile deletes it because the file id differs (null !== id), and card links rebuild the query. The same applies to section, page and t, and predates this fix.
- claude-read: Carried over from r1 and unchanged: a citation phrase with no match in the note's body, or found only in its frontmatter, scrolls the container to its start (useHighlightPassage.ts:94-98). This puts the frontmatter table above the visible area; decisions.md measured scrollTop 153. The F1 fix removes the stale-phrase route to this behaviour, so it now needs a citation whose phrase does not match the cited note.
- claude-read: Carried over from r1 and unchanged: highlightSpent is set when Read is left even if no highlight was present, and it resets only per mount (Editor.tsx:1274-1284). A first ?highlight= arriving on an already mounted note after Read was left is ignored. The only producer found goes through a separate page, so I found no normal-use route to it.
- claude-verify: A note opened with a phrase that has no match scrolls its container to the top (frontend/src/hooks/useHighlightPassage.ts:94-98). decisions.md records scrollTop 153 with the frontmatter table above the visible area and does not say this was chosen. docs/specs/citation-quote-anchor.md has no text on this case in a keyword search. This was raised in r1; the commits since then do not change it. It is no longer reached by selecting another file, only by opening a URL that carries a phrase with no match.
- claude-verify: clearFile keeps highlight in the URL (frontend/src/hooks/useSelectedFile.ts:58-59), so pressing the folder row leaves /drive/<path>?highlight=<phrase>, as decisions.md run 4 records. The next selectFile drops it because the absent file param differs from the new id (line 43), so no later note is marked. The only remaining effect is a stale parameter in the address bar, plus any other page or link that copies the query string, which I did not trace.
- claude-verify: Selecting the same file keeps the phrase by design (useSelectedFile.test.tsx:78), so the mark stays when the current file is pressed again; decisions.md run 4 records no repeated scroll in that case.

## Findings

A: 0
B: 0
C: 0


## Not verified

- claude-read: Nothing was run: no tests, no app and no mutations. This reviewer has read-only tools, so the test outcomes above are reasoned from the code.
- claude-read: I read the working tree and took it to match commit 85e61028 from the git status at session start; the addons/knowledge checkout was not compared with pin f12e5ad0f.
- claude-read: The Ask citation link with a real LLM, the only producer of ?highlight=, was not exercised; decisions.md also lists it as pending.
- claude-read: Core's MarkdownPreview path without the knowledge editor was not exercised, and decisions.md says run 3 skipped it.
- claude-read: The scripts, logs and screenshots named in decisions.md were not opened; I read only its text record of the runs.
- claude-read: The diffs of docs commits 9df30cf7f and 85e610287 were not in the brief. I read the current decisions.md but not the r1 record as committed, and I did not compare it with the artifacts in the brief.
- claude-read: I did not read the bodies of CollectionItemsPane.tsx or CollectionDetail.tsx beyond their selectFile calls, or FolderTreePane's press handling beyond the onSelectFile call at line 351.
- claude-read: readDocumentSelection in frontend/src/lib/documentCapture was not read, so capture of a selection that spans a mark is unchecked; the publisher hook itself only listens for selectionchange and does not change the DOM.
- claude-verify: Nothing was executed: no tests, no browser and no running app, because this role has read-only tools.
- claude-verify: The diff against origin/develop was not read directly; the working tree was read and assumed to match 85e610287, with r2/head.txt naming that commit.
- claude-verify: The addons/knowledge checkout was read as present and its pin was not compared with the commit named in decisions.md (f12e5ad0f).
- claude-verify: The Ask citation link with a real LLM, the only producer of ?highlight= in the code, was not checked; decisions.md also lists it as pending.
- claude-verify: The R-5 scripts, logs and screenshots named in decisions.md were not opened.
- claude-verify: The matching fallbacks in useHighlightPassage.ts after line 135 and every consumer that might copy the query string after clearFile were not read in this pass.
- claude-verify: docs/specs/citation-quote-anchor.md was only searched by keyword, not read in full.

TOTAL: 0 findings
