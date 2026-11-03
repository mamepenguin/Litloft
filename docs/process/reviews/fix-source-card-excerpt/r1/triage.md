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

Note: behavior.md does not say what the excerpt text must be for a source file. TextThumbnail applies Markdown/HTML stripping that rewrites code (F1).; behavior.md's table does not cover file_type `subtitle` (text/vtt). The code says no excerpt, and no test pins it (F2).; Non-UTF-8 source files (for example Shift_JIS .c) are decoded as UTF-8 by res.text() and show replacement characters. The same already happens for .txt, but the number of affected file types grows.
- claude-read: behavior.md does not say what the excerpt text must be for a source file. TextThumbnail applies Markdown/HTML stripping that rewrites code (F1).
- claude-read: behavior.md's table does not cover file_type `subtitle` (text/vtt). The code says no excerpt, and no test pins it (F2).
- claude-read: Non-UTF-8 source files (for example Shift_JIS .c) are decoded as UTF-8 by res.text() and show replacement characters. The same already happens for .txt, but the number of affected file types grows.
- claude-verify: What a source/XML file's excerpt should show: raw first lines, or text passed through the Markdown/clip sanitizer stripPreviewText.
- claude-verify: Whether a subtitle file with text/vtt should draw an excerpt (unspecified; per drives.py:100-101 such rows are not registered today).

### unspecified_behavior

Note: What a source/XML file's excerpt should show: raw first lines, or text passed through the Markdown/clip sanitizer stripPreviewText.; Whether a subtitle file with text/vtt should draw an excerpt (unspecified; per drives.py:100-101 such rows are not registered today).
- claude-read: behavior.md does not say what the excerpt text must be for a source file. TextThumbnail applies Markdown/HTML stripping that rewrites code (F1).
- claude-read: behavior.md's table does not cover file_type `subtitle` (text/vtt). The code says no excerpt, and no test pins it (F2).
- claude-read: Non-UTF-8 source files (for example Shift_JIS .c) are decoded as UTF-8 by res.text() and show replacement characters. The same already happens for .txt, but the number of affected file types grows.
- claude-verify: What a source/XML file's excerpt should show: raw first lines, or text passed through the Markdown/clip sanitizer stripPreviewText.
- claude-verify: Whether a subtitle file with text/vtt should draw an excerpt (unspecified; per drives.py:100-101 such rows are not registered today).

## Findings

A: 0
B: 2
C: 0

### claude-read:F1 — bucket B, MEDIUM, open

Claim: The newly admitted other + text/* source files are run through stripPreviewText, a Markdown/HTML-clip sanitizer, so the excerpt on a source file's card is not the file's first lines but a mangled version of them.
Impact: In normal use, a folder of C, JS, CSS, Python, Perl or XML files shows card excerpts that silently differ from the file content. `#include <stdio.h>` shows as `#include `. Any `<` ... `>` pair is deleted even across lines, so `for (i = 0; i < n; i++) {\n  p->x = 1;` becomes `for (i = 0; i x = 1;`, and the same happens to JS arrow functions after a comparison. `/* Reset */` in CSS/C becomes `/ Reset /`. `char *a, *b;` becomes `char a, b;`. Python `def f(*args, **kw)` loses its stars. The `#` of a `# comment` line is stripped, and `fns[i](x)` collapses to `fnsi`. A `.xml`/`.sgm`/`.sgml` file (other + text/xml, text/x-sgml, also admitted by the text/* prefix) loses every tag and can show a blank excerpt (title only), which looks the same as having no excerpt. behavior.md's stated user-visible result is that the card 'shows its first lines'.
Evidence: frontend/src/lib/textExcerpt.ts:17-18 admits every file_type other with a text/* mime. frontend/src/components/TextThumbnail.tsx:69-83 sends every non-Office file to stripPreviewText. frontend/src/components/TextThumbnail.tsx:41 `.replace(/<[^>]+>/g, "")` ([^>] also matches newlines), :42 `^#+ ` strip, :44 link-collapse `\[([^\]]+)\]\([^)]*\)`, :47-48 `**x**`/`*x*` strips. backend/app/services/filetype.py:136-188 maps .bat/.c/.h/.ksh/.pl to text/plain, .py to text/x-python, .css to text/css, .js/.mjs to text/javascript, .xml to text/xml, .sgm/.sgml to text/x-sgml, .vcf to text/x-vcard and .n3 to text/n3, all as `other`. These were blank cards at origin/develop, so this commit is what first shows the mangled text for them. The R-5 record (docs/process/reviews/fix-source-card-excerpt/decisions.md:25-27) quotes only a Python file whose first lines contain none of these patterns.
Repro: Read-only trace, not run. stripPreviewText("#include <stdio.h>\nint main(void) {\n  for (i = 0; i < n; i++) {\n    p->x = 1;") applies `/<[^>]+>/g`. That removes `<stdio.h>` and also the span from `< n; i++) {\n    p-` through the `>`, so the result is "#include \nint main(void) {\n  for (i = 0; i x = 1;". stripPreviewText("/* Reset */\nbody { margin: 0 }") applies `/\*([^*]+)\*/g` and gives "/ Reset /\nbody { margin: 0 }". sourceCardExcerpt.test.tsx only counts `[data-testid="text-thumbnail"]` nodes and never resolves the fetch, so no test sees the text.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> For a non-Markdown text mime (anything other than text/markdown or a clip), show the raw window without stripPreviewText's Markdown/HTML transforms, and add a test that renders TextThumbnail for a `.c`/`.css` file with a mocked Range response and checks the drawn text.

</details>

### claude-read:F2 — bucket B, LOW, open

Claim: The test table has no row for file_type `subtitle` (or any bucket outside the seven listed) with a text/* mime, so a mutation of showsTextExcerpt's bucket test from an allowlist into a denylist survives.
Impact: Suppose a later edit rewrites line 18 as `file_type !== "audio" && file_type !== "archive"`. That edit would draw an excerpt on `.vtt` subtitle files (file_type subtitle, mime text/vtt per backend/app/services/filetype.py:260-262) wherever they appear in a listing, and no test would fail.
Evidence: frontend/src/lib/textExcerpt.ts:18 allowlists document/other. frontend/src/components/__tests__/sourceCardExcerpt.test.tsx:111-139 covers other, document, audio, archive, video and image, but not subtitle. behavior.md's table is silent on subtitle.
Repro: Mutant: textExcerpt.ts:18 -> `return file.file_type !== "audio" && file.file_type !== "archive";`. Every row in sourceCardExcerpt.test.tsx still holds: video and image are rejected earlier by hasThumbnail, and audio and archive are still rejected. Predicted to survive (not run).
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a row `subtitle + text/vtt -> false` to the table.

</details>

## Not verified

- claude-read: Did not run vitest, tsc or lint. Every test outcome and mutant result above is predicted by reading.
- claude-read: Did not check whether subtitle-type files ever appear on these three surfaces in a folder listing.
- claude-read: Did not check the _DANGEROUS_INLINE_MIMES set or whether any text/* mime among the new types gets a non-OK status from /stream.
- claude-read: Did not inspect the R-5 screenshots referenced in decisions.md.
- claude-verify: I did not run the vitest suite or the mutation; the survival in F2 was derived by reading the code.
- claude-verify: I did not diff against origin/develop to confirm that other+text/* cards were blank before this commit.
- claude-verify: I did not check whether the scanner really skips subtitle files, beyond the comment at drives.py:100-101.
- claude-verify: I did not look at the R-5 screenshots.

TOTAL: 2 findings
