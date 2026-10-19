# PR1 review — is the machinery correct?

`origin/develop..3411c56c`, worktree `/Users/libre/Sources/video_share-srcpreview`.
Scope: `lib/codeLines.ts`, `lib/codeLanguage.ts`, `lib/fileNameParts.ts`,
`TextPreview.decorate()` and the three render paths, `FilePreview`'s one-line
reach change. Mutation log at the end.

Baseline at `3411c56c`: 94 unit tests green, `tsc --noEmit` clean, `pnpm lint`
0 errors / 63 warnings, `pnpm test:e2e:components` 156 passed.

> **R-1 note, not a finding.** The tree moved under this review. At the time I
> ran the browser suite, `git status` showed four files modified against
> `3411c56c` — `frontend/src/app/globals.css` (gutter `3.5ch` → `5ch`,
> `white-space: nowrap` on `::before`), `e2e-components/fixtures/app.tsx`,
> `e2e-components/code-viewer-desktop.spec.ts` (+63 lines, two new tests) and
> `componentFixtureParity.test.tsx`. Everything below is read and measured
> against the committed `3411c56c`; where those edits change a finding I say so.
> I restored every file I touched and left those four alone.

## 1. [HIGH] [introduced] a CR-only file loses a line break, and is split into lines two different ways

`frontend/src/lib/codeLines.ts:12,90` · `frontend/src/components/TextPreview.tsx:101-109`

`splitPlainLines` splits on `/\r?\n/`, so a lone `\r` is **not** a break and the
whole file is one entry. `splitHighlightedLines` hands the markup to
`template.innerHTML` (`codeLines.ts:39`), and the HTML parser's input-stream
preprocessing folds a lone `\r` to `\n` before anything in this file sees it —
so there the same file **is** split. `decorate` uses the first for the limit and
the second for what it draws.

Measured (probe against the real code, jsdom/parse5, same normalisation a
browser does):

```
template.innerHTML = "a\rb"           ->  content.textContent === "a\nb"

content = 'let a = 1;\rlet b = 2;\r'   (filename main.js)
  splitPlainLines(content)     -> ["let a = 1;\rlet b = 2;\r"]   1 entry
  splitHighlightedLines(html)  -> ["let a = 1;", "let b = 2;"]   2 entries
  trailingBreak = /\r?\n$/.test(content) = false
  text the block renders       -> "let a = 1;\nlet b = 2;"
```

Three consequences:

- **Invariant 4.** The file with CR folded to LF is `"let a = 1;\nlet b = 2;\n"`;
  the block renders it without the final break. A character is dropped — from
  what is drawn, from the haystack the citation `TreeWalker` collects, and from
  what the capture basket serialises.
- **Invariant 9.** The uncoloured path draws that file as **one** `.code-line`
  holding a raw `\r`; the coloured path draws **two**. Whether a file gets one
  number per line now depends on whether its name happens to name a language.
  (I measured the DOM, not the paint. Chromium treats CR as a segment break
  under `pre-wrap`, so the uncoloured case is likely to *look* like two rows
  carrying one number — but that is inference, not a measurement.)
- `MAX_DECORATED_LINES` is applied to `splitPlainLines(...).length`, i.e. to the
  count that is wrong for this file. A 100 000-line CR-only `.js` counts as one
  line, passes the limit, and then renders 100 000 elements.

`[introduced]` without a reproduction: all three functions are new in this
change.

Reachability is low — CR-only endings are a classic-Mac artefact — but it is an
ordinary file, not a crafted one, and the loss is silent.

Fix: let one rule decide. Fold once on arrival (`content.replace(/\r\n?/g,
"\n")` at the top of `decorate`) and split everything on `/\n/`; that also makes
`trailingBreak` right for free. Or make `BREAK` `/\r\n?|\n/` so the plain path
agrees with what the parser has already done to the coloured one.

## 2. [MEDIUM] [introduced] `MAX_DECORATED_CHARS` bounds size, not time, and three grammars in the table are quadratic

`frontend/src/components/TextPreview.tsx:23,99,108`

`decorate` runs `hljs.highlight` synchronously inside a `useMemo`, on the main
thread, during render. The only guard on it is `content.length > 512 * 1024`.
For an unbroken run of `[A-Za-z0-9]` several grammars are quadratic, so a file
**under** the limit freezes the tab for minutes. Measured with this bundle's own
`highlight.js` (node, this machine):

```
400 KiB of bare base64, one line      ini          704 948 ms   (11m 45s)
400 KiB of bare base64, one line      javascript   194 762 ms   ( 3m 15s)
400 KiB of bare base64, one line      rust          65 130 ms   ( 1m  5s)
512 KiB of "x",         one line      javascript   375 885 ms   ( 6m 16s)

quadratic, confirmed by doubling (ini, bare base64):
   8 KiB   351 ms     16 KiB  1 342 ms     32 KiB  5 133 ms     64 KiB  19 378 ms
```

`ini` is the grammar `.toml .ini .cfg .conf .env .properties .editorconfig
.gitconfig .gitmodules .npmrc` all map to (`codeLanguage.ts:63-72`).

What keeps this from being routine is that the run has to be genuinely
unbroken. Every shape with punctuation in it is linear and cheap at the same
sizes:

```
512 KiB minified javascript                                268 ms
400 KiB base64 inside a JS string literal                    4 ms
ini  SECRET=<64 KiB base64>                                  1 ms
rust const S: &str = "<32 KiB base64>";                      0 ms
400 KiB bare base64 as python / markdown / css / sql / yaml / xml / go   1-13 ms
```

So the reachable case is a file whose *name* says `.js` / `.env` / `.conf` /
`.toml` / `.rs` but whose *content* is a bare blob — a base64 dump saved with
the wrong extension, a wordlist with no separators, a sequence file. Not
crafted, not common. There is no way out once it starts: no cancel, no progress,
and reloading reopens the same file.

`[introduced]`: `git show origin/develop:frontend/src/components/TextPreview.tsx`
imports no `highlight.js` and renders `{content}` directly, so the same file
opens instantly on `develop`.

It breaks no declared invariant — nothing on the list says the page stays
responsive — so MEDIUM by the rubric, not HIGH.

Fix, cheapest first: bound the longest line as well as the total size. The line
array already exists at `TextPreview.tsx:101`, so

```ts
if (plain.some((line) => line.length > 5_000)) return null;
```

costs nothing and closes every case measured above (at 5 KiB the worst grammar
is ~130 ms). It also removes the one shape that makes the DOM walk slow —
`splitHighlightedLines` over 512 KiB of minified JS took 2 870 ms in jsdom, and
over 5 000 ordinary rust lines 612 ms, both of which the current limits allow.

## 3. [MEDIUM] [introduced] the line-number test cannot fail on a wrong number, or on no number

`frontend/e2e-components/code-viewer-desktop.spec.ts:31-52`

"a number is drawn for every line" asserts `content !== "none"` and
`width > 0` on the `::before`. Neither can observe a number. Measured in
Chromium by overriding the rule in the page (equivalent to deleting the
declaration, since each value I set is the property's initial value) and then
running the shipped assertions verbatim:

```
counter-increment: none   ->  content "counter(code-line)"  width 42.14  PASSES
counter-reset: none       ->  content "counter(code-line)"  width 42.14  PASSES
content: ""               ->  content "\"\""               width 42.14  PASSES
```

`width` is 42.14 on every line in every case, because it is `var(--code-gutter)`
resolved — the assertion measures the custom property, not a glyph. With
`content: ""` no number is drawn at all and the test still passes. Per
`review-workflow.md` "Detector rules", this holds nothing.

The spec's comment is right that `getComputedStyle(...).content` gives back the
unresolved `counter(code-line)` — but the rendered digits are readable other
ways, so the limit is in the test, not in the browser:

- `elementFromPoint` into the gutter strip, which this same file already does at
  line 87 for the wrapping test, and read what is painted there;
- `toHaveScreenshot()` on the first and the hundredth line;
- or the indirect one: with 150 lines, the `::before` box of line 100 must be
  wider in ink than line 1's. That is what the gutter is sized for.

The two tests added in the working tree since `3411c56c` do not close this:
"a three-digit number keeps its line one row tall" compares row *steps* and
"the gutter holds the widest number" compares the `::before` *box* against a
`8888` probe. Every number being `0` satisfies both.

## 4. [MEDIUM] [introduced] nothing holds the wiring that makes any of this happen in the app

`frontend/src/components/FilePreview.tsx:211`

Mutation M22: delete `filename={file.filename}` from the `<TextPreview>` call —
`want=kill`, **survived** the whole unit suite. With that one line gone, no file
in the app is ever coloured, none is numbered by language, and `decorate`'s
`filename === undefined` arm takes every case. `FilePreview.test.tsx:79-88`
stubs `TextPreview` down to `({ fileId }) => <div>{fileId}</div>`, so the prop is
not observed anywhere; `TextPreview.test.tsx` passes `filename` directly and
never goes through `FilePreview`.

The sibling line *is* held — M21 (`isTextPreviewable(file.mime_type)` with the
name dropped) is killed by four tests. So the change deliberately tested one
half of the same two-line edit.

Fix: have the `FilePreview` stub render the prop it is handed —
`({ fileId, filename }) => <div data-testid="text-preview" data-filename={filename}>{fileId}</div>`
— and assert it for one case.

## 5. [MEDIUM] [introduced] invariant 3 has no test over the structure this change introduced

`frontend/src/components/TextPreview.tsx:220-242` · `e2e-components/fixtures/app.tsx:1050`

The block the citation marker runs over went from one text node to N elements
with a `::before` on each. The number of `<mark>` elements one quote produces
changes with it. Measured on the running stack, `_r5/main.rs` with
`?highlight=let greeting = "hello"; /* a comment`:

```
marks: 9, seams start / mid x7 / end
        ["    ","let"," ","answer"," = ","42",";\n","    ","println!"]
uncoloured path, same quote: 3 marks
over-limit path, same quote: 1 mark     (the shape develop had)
```

It works — I checked all three paths, and in the browser the mark that contains
the `\n` draws an 8px box at the end of its row rather than running to the right
edge. Selecting the whole block returns the file exactly (less the trailing
newline Chromium drops), and six lines are drawn and numbered 1-6 for a six-line
file. So invariants 1, 3 and 9 hold today on the live app.

What is missing is anything that would notice if they stopped. The only browser
test for citation seams, `citation-seams-desktop.spec.ts`, runs against
`CitationSeams`, a hand-written `<pre>` with `hljs-` spans and **no**
`.code-view`, no `.code-line`, no counter and no line break inside the quote
(`app.tsx:1050-1071`). The PR-344 rule it exists to hold — one passage drawn as
one shape — is exactly what a 9-way split stresses, and it is unmeasured here.
No unit test passes `highlight` to `TextPreview` either.

Fix: give the `code-viewer` fixture a `highlight` prop whose quote crosses a
line boundary, and assert in the browser that the marks' union is one
rectangle-run with `start`/`end` at its ends — the assertion
`citation-seams-desktop.spec.ts:65` already makes for prose.

## 6. [LOW] [introduced] a dotfile whose leading segment names a whole-name language opens but is never coloured

`frontend/src/lib/codeLanguage.ts:106` · `frontend/src/components/TextPreview.tsx:85`

`isTextPreviewable` consults **both** tables for a dotfile's leading segment
(`TEXT_SUFFIXES.has(token) || TEXT_FILENAMES.has(token)`). `codeLanguageFor`
consults `LANGUAGE_BY_NAME` with `base`, and a dotfile's `base` still carries its
leading dot, so it never matches:

```
.gemfile    isTextPreviewable -> true    codeLanguageFor -> null
.rakefile   isTextPreviewable -> true    codeLanguageFor -> null
.justfile   isTextPreviewable -> true    codeLanguageFor -> null
```

`fileNameParts.ts:18-20` says the rule is shared "so that what the viewer agrees
to render and what it agrees to colour are decided by one rule"; for these they
are not. Only a missing colour, never a missing file, so LOW.

Fix: `LANGUAGE_BY_NAME.get(base) ?? (token === null ? undefined :
LANGUAGE_BY_NAME.get(token) ?? LANGUAGE_BY_TOKEN.get(token))`.

## 7. [LOW] [introduced] an arm of `isTextPreviewable`'s dotfile branch that no test reaches

`frontend/src/components/TextPreview.tsx:85`

Mutation M20: drop `|| TEXT_FILENAMES.has(token)` — `want=kill`, **survived**.
No test names a dotfile whose leading segment is in `TEXT_FILENAMES`
(`.makefile`, `.dockerfile`, `.license`, `.gemfile`, `.procfile`). Either the arm
is dead and should go, or it needs a case. Related to finding 6: it is the arm
`codeLanguageFor` does not have.

## 8. [LOW] [introduced] the phantom line is decided by emptiness, not by provenance

`frontend/src/lib/codeLines.ts:90`

The last entry is dropped when `textContent === ""`, which is a proxy for "a
trailing break created it". Any last line genuinely empty of text goes with it:

```
splitHighlightedLines('a\n<span class="x"></span>')  ->  ["a"]     2 lines in, 1 out
```

I could not get real `hljs.highlight` output into that shape — ten unterminated
constructs across javascript, python, xml, css, markdown, bash, ini, makefile
and yaml all round-tripped exactly — so this is latent, not live. It is also
invisible if it ever happens. A boolean set in the `i > 0` branch of `visit`
("the last `beginLine` was reached") says the same thing without asking the
content.

## Meant to survive

- **M11** `trailingBreak = /\n$/` instead of `/\r?\n$/` — equivalent mutant; a
  CRLF file still ends in `\n`. The `\r?` is redundant, not load-bearing.
- **M17** dropping the `hljs.getLanguage(name)` guard — every entry in both
  tables resolves today, which `codeLanguage.test.ts` "maps every entry to a
  language the bundle carries" is what holds. The guard is for a future entry,
  and no mutation of today's tables can reach it.
- **M18** consulting `LANGUAGE_BY_TOKEN` before `LANGUAGE_BY_NAME` — no key in
  `LANGUAGE_BY_NAME` contains a dot, so those names have `token === null` and
  the tables cannot disagree. Nothing enforces that they stay disjoint; if a
  dotted key is ever added to `LANGUAGE_BY_NAME` the order starts to matter.
- **M28** swapping the two limit checks in `decorate` — same answer either way;
  the character check is only the cheaper one to run first.
- **M15** `fileNameParts` not cutting at the last `/` — survived, and I am not
  filing it. It is only observable for a path whose last segment has no dot
  while an earlier one does (`dir.bin/Makefile`, `src/Makefile`), and both real
  callers pass a basename: `FilePreview` passes `FileItem.filename` and
  `archiveUtils`/`ArchivePreview` pass `ArchiveEntry.filename`, which sits beside
  a separate `path` field (`src/types/index.ts:224-232`). The slice is defence,
  and the tests do exercise the dotted-directory case that matters
  (`deep/dir.rs/thing.bin`).
- **M34** dropping `user-select: none` from `.code-line::before` — measured:
  `Selection.toString()` over the block is byte-identical with it and without
  it. Chromium leaves generated content out regardless, which is what the rule's
  own comment says nothing should depend on.

## Checked, nothing found

- **Real highlight.js output, 14 languages** — rust, python, xml, ini, makefile,
  diff, markdown, bash, yaml, sql, latex, css, json, go — each with a multi-line
  construct (block comment, docstring, heredoc, raw string, fenced block, `|`
  scalar, template literal). Every one round-tripped character for character
  through `splitHighlightedLines` + the caller's break, and every line count
  matched `splitPlainLines`. Invariant 4 holds for all of them.
- **Structural edges of the walk**: element as the first node, element as the
  last node, break as the first character, break as the last character,
  consecutive breaks inside a span, a span containing only a break, attributes
  other than `class` (preserved by `cloneNode(false)`), four levels of nesting
  with text at every level, a comment node in the markup. All correct.
- **`cursor = cursor.parentElement ?? line` (`codeLines.ts:81`)**: the `?? line`
  arm is unreachable for anything a walk can produce. `beginLine` is only called
  from inside a text node, and whenever the walk is inside an element
  `open.length >= 1`, so the rebuilt cursor is never the line root at a depth
  that returns.
- **`fileNameParts`** on `""`, `"."`, `".."`, `"a."`, `"a.."`, `".a."`, `"...."`,
  `"foo/"`, `"a.b/c"`, `"..a"`, `".env.local"`. No throw and no surprise; the
  basename is taken before the dot logic, so a `/` after the last dot is handled.
- **The limits, exactly**: `content.length === 512 * 1024` decorates and `+1`
  does not; 5 000 lines decorate and 5 001 do not. Inclusive, as the code reads.
- **React index keys.** I could not construct a re-render that breaks them.
  Rendering `main.rs` and then re-rendering with `filename="notes.unknownext"`
  and the same `fileId` — which is what a navigation does while the next fetch is
  in flight — switches every line from `dangerouslySetInnerHTML` to text
  children on the same `span`. React clears the markup: the text comes out
  exactly right and the `innerHTML` is free of `hljs-` spans. The reverse
  direction and a shrinking line count are clean too. Lines are positional and
  never reorder, so the index is the right key here.
- **`useMemo([content, filename])`.** Both of `decorate`'s inputs are in the
  list. A `filename` change with a stale `content` re-decorates the old text
  under the new language, which is the transient above; it resolves when the
  fetch lands.
- **Live, on the running stack** (`_r5/main.rs`, Chromium 1440x900): six lines
  drawn for a six-line file, numbered 1-6; `Selection.toString()` over the block
  returns the file with no digits in it; the `TreeWalker` text is the file.
  Invariants 1, 2, 9 confirmed outside jsdom.

## Mutation log

Unless noted, the command is
`pnpm vitest run src/lib/__tests__/codeLines.test.ts
src/lib/__tests__/codeLanguage.test.ts
src/components/__tests__/TextPreview.test.tsx
src/components/__tests__/FilePreview.test.tsx` (94 tests, green at `3411c56c`).
M32-M34 are Chromium, via a page-level override of the rule.

| # | mutation | want | actual |
|---|---|---|---|
| M1 | `beginLine` reopens nothing | kill | KILLED (3 tests) |
| M2 | `cursor = line` instead of `cursor.parentElement` | kill | KILLED |
| M3 | `BREAK = /\n/` | kill | KILLED |
| M4 | `dropTrailingEmpty` drops every trailing empty | kill | KILLED |
| M5 | `splitHighlightedLines` always drops the last line | kill | KILLED (6 tests) |
| M5b | `splitHighlightedLines` never drops the last line | kill | KILLED (5 tests) |
| M6 | no `MAX_DECORATED_CHARS` | kill | KILLED |
| M7 | no `MAX_DECORATED_LINES` | kill | KILLED |
| M8 | uncoloured branch uses `dangerouslySetInnerHTML` | kill | KILLED |
| M9 | `withBreak` always true | kill | KILLED (2 tests) |
| M10 | `withBreak` ignores `trailingBreak` | kill | KILLED (4 tests) |
| M11 | `trailingBreak = /\n$/` | live | SURVIVED — equivalent |
| M14 | `fileNameParts` reads a dotfile's trailing segment | kill | KILLED |
| M15 | `fileNameParts` does not cut at the last `/` | kill | SURVIVED — see "meant to survive" |
| M16 | extensionless name matched as a token | kill | KILLED |
| M17 | drop the `hljs.getLanguage` guard | live | SURVIVED — meant to |
| M18 | `LANGUAGE_BY_TOKEN` before `LANGUAGE_BY_NAME` | live | SURVIVED — meant to |
| M20 | drop `TEXT_FILENAMES.has(token)` from the `fromDot` arm | kill | **SURVIVED → 7** |
| M21 | `FilePreview` calls `isTextPreviewable(mime)` only | kill | KILLED (4 tests) |
| M22 | `FilePreview` stops passing `filename` | kill | **SURVIVED → 4** |
| M23 | `decorate` never resolves a language | kill | KILLED |
| M28 | swap the order of the two limit checks | live | SURVIVED — meant to |
| M30 | `isTextPreviewable` drops the whole-name table | kill | KILLED (4 tests) |
| M31 | extensionless name matched against `TEXT_SUFFIXES` | kill | KILLED |
| M32 | `counter-increment: none` on `.code-line` | kill | **SURVIVED → 3** |
| M33 | `counter-reset: none` on `.code-view` | kill | **SURVIVED → 3** |
| M34 | `user-select: auto` on `.code-line::before` | live | SURVIVED — meant to |
| M35 | `content: ""` on `.code-line::before` (no number at all) | kill | **SURVIVED → 3** |

TOTAL: 8 findings
