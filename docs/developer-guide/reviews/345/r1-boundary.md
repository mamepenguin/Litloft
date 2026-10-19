# PR1 boundary review — `origin/develop..3411c56c`

Angle: the boundaries the change crosses — the markup sink, the two consumers
of the block's text, and whether the tests can fail.

## R-1 was broken during this review

The worktree did not stay still. At 18:04 four files went dirty on top of
`3411c56c` — `TextPreview.tsx` carrying a literal `// MUTANT: no char limit`
alongside a *fix* (a per-file `--code-gutter` inline style), `globals.css`
gaining `white-space: nowrap` on `.code-line::before`, and a new
`code-viewer-many` fixture arrangement. The Docker stack on `:3000` was
rebuilt with some of that between my second and third measurement run.

What this does and does not cost:

- Every unit-test run below is from 17:59–18:00, when the tree was clean at
  `3411c56c`. `pnpm tsc --noEmit` is clean and `pnpm lint` is 63 warnings /
  0 errors, the stated baseline.
- Every browser measurement of the CSS is taken with the reviewed sheet put
  back by an `!important` override (`--code-gutter: 3.5ch`,
  `::before { white-space: pre-wrap }`), which beats the inline custom
  property the newer build sets, so those numbers are about `3411c56c`
  whatever the container is serving. Where a measurement came straight off
  the container as built at the SHA, I say so.

Finding 1 below is the defect the dirty tree appears to be fixing. It is
reported against the SHA I was given, on its own evidence.

---

## 1. [HIGH] [introduced] Every line from 100 onward is drawn at double height: the line number wraps inside its own box

`frontend/src/app/globals.css:742-777`

`.code-view` sets `--code-gutter: 3.5ch` and `.code-line::before` takes
`width: var(--code-gutter)` with `padding-right: 1ch`. Tailwind preflight
makes that `box-sizing: border-box`, so the number gets a **2.5ch content
box**. The `<pre>` carries `whitespace-pre-wrap break-words`, and both
`white-space: pre-wrap` and `overflow-wrap: break-word` are inherited by the
generated box. A three-digit number does not fit in 2.5ch, and
`overflow-wrap: break-word` breaks it — `100` is drawn as `10` on one row and
`0` on the next, with the code on the second row.

Reproduction, in Chromium against the running stack, measuring the vertical
pitch between consecutive `.code-line` boxes (`Range.getClientRects()[0].top`
per line, tallied):

    _r5/zz-1500.rs  (1500 lines, as the container served it at the SHA)
      3.5ch / pre-wrap   →  98 gaps at 22.8px, 1401 gaps at 45.5px

    _r5/zz-150.rs   (150 lines, sheet restored to the SHA)
      3.5ch / pre-wrap   →  98 gaps at 22.8px,   51 gaps at 45.5px

The break is exactly at line 100 — the first number needing three digits.
Pinning the cause by changing one property at a time on the same page:

      --code-gutter: 3.5ch, white-space: pre-wrap, overflow-wrap: break-word
        → {22.8: 98, 45.5: 51}
      ... + overflow-wrap: normal
        → {22.8: 149}

Screenshot: `/tmp/sha-1500-line100.png` — lines 80–99 normal, then `10`/`0`
stacked in the gutter and every line below it twice as tall.

A hundred lines is most source files. `main.rs` in the fixture set is four
lines, which is why nothing on the branch shows it.

This breaks no sentence in `scratchpad/pr1-invariants.md` literally —
invariant 10 says *a CRLF file* is not drawn double-spaced, and this has
nothing to do with CRLF. It is the same observable, reached by a different
cause, and a user hits it on the first real file they open. **The invariant
list is missing "the gutter does not change the height of a line"**, and I am
reporting that as a finding per the brief, not as a suggestion.

What would fix it: the column has to be wide enough for the widest number the
file will draw, so it has to be set per file rather than fixed — plus
`white-space: nowrap` on the generated box so that a column that is somehow
still too narrow overflows instead of wrapping. (Either alone is not enough:
`nowrap` with a fixed 3.5ch stops the double height but truncates the number
against the code.)

## 2. [MEDIUM] [introduced] No test on this branch can observe finding 1

`frontend/e2e-components/code-viewer-desktop.spec.ts:16-22`,
`frontend/e2e-components/fixtures/app.tsx:949-956`

The only test that runs in a browser mounts a **four-line** source file, so
the counter never leaves one digit and the 2.5ch box is never overfull.

The assertion that looks like it covers the numbers does not:

```
expect(content).not.toBe("none");
expect(width).toBeGreaterThan(0);
```

Both hold while the number is wrapped onto two rows — `content` is the
unresolved `counter(code-line)` either way and `width` is the declared 29.5px
either way. `toBeGreaterThan(0)` is also the lower-bound shape
`review-workflow.md` "Detector rules" §1 rules out of an enumerating
assertion, though here the number is not an enumeration so that is the lesser
problem.

The rest of the suite cannot reach it at all: `TextPreview.test.tsx` counts
`.code-line` elements in jsdom, which implements neither counters nor layout.

Which assertions about the numbers hold nothing, explicitly:

| assertion | holds |
|---|---|
| `TextPreview.test.tsx` `.code-line` counts | the element count only — true with no stylesheet at all, true with the counter removed |
| `code-viewer-desktop.spec.ts` "a number is drawn for every line" | that a `::before` box exists and is not `display:none`. Not its value, not its height, not whether it fits |
| `code-viewer-desktop.spec.ts` "a wrapped line resumes under the code" | real, and real evidence — it hit-tests the gutter beside the first row. But only for a one-digit number |
| `code-viewer-desktop.spec.ts` selection / TreeWalker cases | real, and they are the two that matter most. Verified independently below |

What would fix it: one case at a line count that needs three digits, asserting
the row pitch (or the block height divided by the line count) is the
single-row pitch. That is the measurement that separates the two states; a
screenshot comparison would not.

## 3. [MEDIUM] [introduced] The coloured and uncoloured paths disagree about a lone CR

`frontend/src/lib/codeLines.ts:12` and `:44`

`splitPlainLines` and the text-node split in `splitHighlightedLines` both use
`/\r?\n/`, which does not match a lone `\r`. But `splitHighlightedLines` first
does `template.innerHTML = html`, and the HTML parser normalises CR to LF
before anything is split. So the same bytes take two different shapes:

    _r5/zz-cr.rs   (coloured — `rs` names a grammar)
      5 `.code-line` elements; `pre.textContent` contains no `\r` at all

    _r5/zz-progress.log  (uncoloured — `log` deliberately names no grammar)
      3 `.code-line` elements; `pre.textContent` keeps both `\r`
      "start of build\ndownloading 10%\rdownloading 50%\rdownloading 100%\nbuild finished\n"

and Chromium draws the second as **one run-on row** —
`downloading 10%downloading 50%downloading 100%` — because a `\r` set through
`textContent` is not a segment break there. Screenshot `/tmp/cr-log.png`.

Invariant 4 says the rendered text is the file "with CR folded to LF". Only
one of the two paths does that fold; the other keeps the CR and then draws
nothing for it. A `pip`/`docker`/`make` log saved as `.log` or `.txt` is the
ordinary case, and it is the uncoloured one.

The same unit-level round trip, for the record (jsdom, full sweep over every
language in `LANGUAGE_BY_TOKEN` ∪ `LANGUAGE_BY_NAME`):

| input | coloured path output |
|---|---|
| `a\rb\n` | `a\nb\n` — CR folded |
| `a\u0000b\n` | `ab\n` — **NUL dropped** (see finding 4) |
| NBSP, U+2028, U+2029, FF, VT, ZWSP, BOM, astral pair, tab | unchanged |

What would fix it: fold CR in one place, before either split — `splitPlainLines`
and `decorate`'s `trailingBreak` test should see the same normalised string the
`<template>` parse will produce.

## 4. [LOW] [introduced] The coloured path silently drops U+0000

`frontend/src/lib/codeLines.ts:38`

highlight.js passes a NUL through unescaped; the HTML parser drops it on
`template.innerHTML = html`. The uncoloured path keeps it. Invariant 4 says
"character for character"; this is the one character that is not. Reachable
only for a file that is partly binary but carries a name on the allowlist, so
low.

## 5. [LOW] [introduced] The line cap is counted before the CR fold, so a CR-only file can slip past it

`frontend/src/components/TextPreview.tsx:101-102`

`decorate` decides with `splitPlainLines(content).length > MAX_DECORATED_LINES`,
and `splitPlainLines` does not split on a lone `\r`. The coloured path then
does, because of the `<template>` parse. A 400 KB `.js` file whose breaks are
all CR counts as **one** line against a cap of 5000 and then renders twenty
thousand elements — exactly the cost the comment on `MAX_DECORATED_LINES` says
the limit exists to bound ("a 512 KB log is twenty thousand elements").

Same root cause as finding 3, different observable: there it is what the user
sees, here it is a limit that does not hold. Contrived as a real file, hence
LOW; folding CR once before either split closes both.

## 6. [LOW] [introduced] The new fixture arrangement hand-writes its messages, where every other one uses the real ones

`frontend/e2e-components/fixtures/app.tsx:963-971`

`CodeViewer` passes a literal `{ text: { loading: "Loading", ... } }` to
`NextIntlClientProvider`. Every other arrangement in that file — fifteen of
them, at lines 758, 775, 835, 1141, 1160, 1179, 1197, 1218, 1241, 1266, 1287,
1319, 1335, 1382 — passes `enMessages` (or `jaMessages`), the real
`messages-core` file. The fixture therefore cannot notice the component asking
for a key the real catalogue does not have, and it is the one arrangement that
does not resemble its neighbours.

Nothing else covers that either: `i18n-keys.test.ts` holds *en/ja parity* (I
killed it — deleting `text.tooLargeToDecorate` from `ja.json` turns it red, so
both locales are held), but nothing holds that the key the component asks for
exists at all.

Fix: `messages={enMessages}`.

---

# Checked, no defect

Each of these is the reproduction, not a reading.

## The trust boundary is sound

**Nothing reaches the markup sink that highlight.js did not escape.** Sweep in
jsdom over every language in `LANGUAGE_BY_TOKEN` ∪ `LANGUAGE_BY_NAME` (38
grammars, all present in the bundle — `hljs.getLanguage` returned non-null for
every one, so the `codeLanguageFor` guard never silently drops a mapped
language) × nine payloads: `<img src=x onerror=alert(1)>`,
`</span><script>alert(1)</script>`, `a & b < c > d "e" 'f'`,
`<!-- --><svg/onload=alert(1)>`, `&lt;script&gt;`,
`<span class="hljs-x">x</span>`, `<style>`, `<iframe src=javascript:…>`,
`<textarea></textarea><table><td>`, each twice and across a line break. After
`splitHighlightedLines` and re-parsing, in every one of the 342 cases: the only
element produced is `SPAN`, there is no attribute other than `class`, and
`textContent` is identical to the source. The `<template>` round trip adds
nothing — it re-serialises text nodes through `innerHTML`, which re-escapes.

**Confirmed in a real browser**, not only jsdom: `_r5/zz-probe.xml` (`text/xml`
→ `TextPreview` with the `xml` grammar, the grammar with the most reason to
emit markup) renders `<!-- <script>window.__pwnedXml=1</script> -->` as text.
`pre.querySelectorAll("*")` → `["SPAN"]`, no non-`class` attribute, zero
`<script>`, `window.__pwnedXml` undefined.

**`markdown` and `html` in the map are not reachable from the file page.**
`FilePreview` routes `text/markdown` to `MarkdownFileViewer` and `text/html` to
`HtmlPreview` before the `isTextPreviewable` branch, and the backend gives every
`.md`/`.markdown`/`.html` file one of those mimes. Not a defect — just worth
knowing that the two grammars most likely to emit markup are dead entries here.

**The uncoloured and over-limit paths do not share the sink.** `_r5/zz-plain.vue`
(`vue` is on the text allowlist and deliberately not in `LANGUAGE_BY_TOKEN`)
whose content *is* markup: elements in the block are `["SPAN"]` only,
`textContent` is the file byte for byte. Same for the over-limit branch in
jsdom. Invariants 6, 7 hold.

**Widening the allowlist with `js`, `json`, `css`, `html`, `xml` exposes nothing
in the archive viewer.** `ArchiveTextViewer` renders `{textContent}` as a React
child (`archive/ArchiveTextViewer.tsx:86-88`) — there is no sink there at all.
And for entries whose mime the backend guessed correctly those five already
matched `TEXT_MIME_PREFIXES`/`TEXT_MIME_EXACT`, so the widening only reaches
entries with an opaque mime.

## Both consumers of the block's text still see the file

All measured in Chromium against the running stack.

**`useHighlightPassage`, citation crossing a line boundary — coloured path.**
`_r5/zz-cite.rs` with `?highlight=let message = "hello"; println!`: 9 marks,
joined text exactly `    let message = "hello";\n    println!`, seams
`start / mid×7 / end`. The mark that holds the bare `\n` measures 0px wide, so
the run paints no stray band at the line end. Invariant 3 holds across a split
line.

**Same, uncoloured path.** `_r5/zz-plain.vue` with a needle spanning the break:
3 marks, joined exactly `hello world</div>\n  <span>second line here`.

**The marks survive React re-rendering the split block.** After the citation
landed I selected the whole block (firing `selectionchange` → the capture
store) and resized the viewport twice: mark count, mark text and block text all
unchanged, and zero page errors or console errors. `dangerouslySetInnerHTML`
does not re-run while `__html` is unchanged, and the uncoloured branch's
split text nodes were not disturbed.

**Selection and the TreeWalker carry no line number.** `_r5/main.rs`:
`Selection.toString()` over the block is the file minus its trailing newline
(Chromium's serialiser, as stated), the `TreeWalker` string is the file
exactly. Invariants 1, 2, 4 hold.

**Including where the number wraps.** On `_r5/zz-150.rs` with the SHA's sheet
restored, selecting lines 96–105 — spanning the 99→100 boundary where the
gutter number is split onto two rows — yields
`let y95 = 95;\n…\nlet y104 = 104;\n` and the quote the capture basket would
store (`replace(/\s+/g," ").trim()`) contains no bare gutter number. The
`user-select: none` plus generated-content combination holds even in the
broken layout. Invariants 1, 2, 12 hold.

## Line counts, limits and the renumbered detector

Measured off the container as built at the SHA:

| file | drawn | expected |
|---|---|---|
| `_r5/main.rs` (6 lines, trailing `\n`) | 6 `.code-line` | 6 |
| `_r5/zz-150.rs` | 150 | 150 |
| `_r5/zz-1500.rs` | 1500 | 1500 |
| `_r5/crlf.bat` (CRLF) | 3, no double spacing | 3 |
| `_r5/big.log` (142 890 chars, >5000 lines) | undecorated, message shown, 142 890 chars of text | invariant 11 |
| `_r5/oneline.js` (600 009 chars, 1 line) | undecorated, message shown, 600 009 chars of text | invariant 11 |
| `_r5/zz-heavy.rs` (4999 lines, 485 KB — just inside both caps) | 4999, coloured, 39 992 nodes, 1.1 s to first paint | decorated |

Invariants 9, 10, 11 hold for LF and CRLF files. (Finding 3 is the lone-CR
case; finding 1 is the height of those lines, not their count.)

`popup-dismissal.test.ts` `457 → 460` **is the right edit**: the walk skips
`__tests__` and `*.test.ts(x)`, so the three new files that count are
`codeLanguage.ts`, `codeLines.ts`, `fileNameParts.ts` — the two new test files
do not. Reimplementing the walk independently gives 460.

`isTextPreviewable` before and after `fileNameParts` was extracted is the same
function on every input I could construct — dotfile, `.env.local`, bare
`Makefile`, extensionless `a.out`, trailing dot, `..`. Invariants 5, 8 hold;
`FilePreview.test.tsx` now drives the real predicate rather than a stub, which
is what makes the `main.rs` / `Makefile` / `a.out` cases mean anything.

## The e2e stub cannot pass the test for the wrong reason

`fixtures/app.tsx` replaces `window.fetch` with a function that resolves
`CODE_SOURCE` for any URL. If the component stopped fetching, or fetched and
discarded, `content` stays `null`, `decorate("")` returns no lines, and
`open()`'s `await expect(page.locator(".code-line").first()).toBeVisible()`
times out. The arrangement does load the real compiled sheet
(`app.tsx:61` imports `e2e-layout/fixtures/globals.built.css`, built from
`src/app/globals.css`), so the gutter measurement is against real CSS — the
gap is the four-line file, finding 2, not the stub.

Two smaller things, neither a defect: the `fetch` assignment sits in the render
body rather than an effect, and `CODE_SOURCE` is duplicated between
`fixtures/app.tsx` and `code-viewer-desktop.spec.ts` (the spec goes red if only
one is edited, which is the safe direction).

`componentFixtureParity.test.tsx` and `spec-viewport.spec.ts` both use exact
`toEqual` over a declared list, so both additions are held the way Detector
rule 1 asks.

## Documentation

Checked only for statements a reader could act on that are false about the
code. I found none.

- `known-issues.md`: `.ts` → `video/mp2t` — `mimetypes.guess_type("a.ts")`
  returns exactly that, and `FilePreview`'s `kind === "video"` branch
  (`FilePreview.tsx:126`) does precede the `isTextPreviewable` branch
  (`:206`). Both halves check out.
- `viewers-and-players.md`: "Above 512K characters or 5000 lines" matches
  `content.length > 512 * 1024` and `plain.length > 5000`. Verified live:
  `oneline.js` at 600 009 chars and `big.log` at >5000 lines both fall to the
  plain branch with the message, and `zz-heavy.rs` at 4999 lines / 485 KB does
  not.
- `DESIGN.md`: the mechanism it describes — reserved padding, negative margin
  of the same width — is what `globals.css` does.
- The `CLAUDE.md` doc table: user-guide is the only page a change of this shape
  owes, and it was updated; `DESIGN.md` was updated for the visual rule. No
  public endpoint, WS event, config key or env var changed, so nothing else
  applies. Nothing missing.

## Housekeeping

Probe files I added to the `動画` drive under `_r5/`, to purge when convenient:
`zz-progress.log`, `zz-cr.rs`, `zz-cite.rs`, `zz-plain.vue`, `zz-probe.xml`,
`zz-probe.markdown`, `zz-xss.md`, `zz-xss.html`, `zz-150.rs`, `zz-1500.rs`,
`zz-heavy.rs`. No file in the git tree was left changed by me.

---

# Addendum — the gutter fix, reviewed

The supervisor confirmed the tree moved for a fix to finding 1, and asked me to
carry on. This section reviews that uncommitted fix (`globals.css`,
`code-viewer-desktop.spec.ts`, the `code-viewer-many` arrangement and its
parity entry). Nothing under `src/components/` or `src/lib/` changed, so
everything above still stands.

**The fix works.** Measured on the rebuilt stack: `_r5/zz-1500.rs` now has a
uniform 22.8px pitch across all 1499 gaps (it was 98 at 22.8 and 1401 at 45.5),
and `_r5/zz-150.rs` is uniform at 22.8 across 149. The 4999-line
`_r5/zz-heavy.rs` shows a uniform 45.5px, which is its long lines wrapping to
two rows each, not the gutter — the first line, a one-digit number, is 45.5 too.

**Mutation results**, run through `pnpm test:e2e:components` (the first attempt
with `--config e2e-components` passed a directory, so Playwright silently
skipped the `globalSetup` that rebuilds the fixture and every mutation
"survived"; those runs are void):

| mutation | want | result |
|---|---|---|
| `--code-gutter: 5ch` → `3.5ch`, `nowrap` kept | kill | **killed** — "the gutter holds the widest number" (21.07 < 33.22). "a three-digit number keeps its line one row tall" *passes*: with `nowrap` still on, a too-narrow number overflows instead of wrapping |
| remove `white-space: nowrap`, `5ch` kept | — | **survived.** Nothing holds it. Correct as far as it goes — at 5ch nothing wraps, so it is a guard against a future narrowing — but it is unheld, and it is half of what made finding 1 |
| both reverted (the exact pre-fix sheet) | kill | **killed** — `threeDigits [46]` vs `oneDigit [23]`, and the widest-number case too |

So the two new cases together do hold finding 1. Worth knowing which holds
what: the row-height case only fires when the number can *wrap*, and the
sizing case is the one that fires on the width alone.

`globals.css` restored byte-for-byte afterwards (`shasum` match) and the spec
re-run green.

## 7. [MEDIUM] [introduced by the fix] Dropping the `1rem` from `padding-left` puts four-digit numbers flush against the card edge

`frontend/src/app/globals.css:758`

`padding-left: calc(1rem + var(--code-gutter))` became
`padding-left: var(--code-gutter)`. The `::before` is pulled back by exactly
`--code-gutter`, so its box now starts at the block's border edge — there is no
inset left for it at all, while `p-4` still gives 16px on the other three
sides.

Measured on `_r5/zz-1500.rs` at line 1001, viewport 1200:

    card left edge      256.00
    <pre> left edge     256.00
    number box left     256.00
    digits start at     255.99   ← 0.01px outside the card
    <pre> padding       top 16px  right 16px  bottom 16px  left 42.14px

A three-digit number keeps one digit's worth of inset by right-alignment, so
the effect appears at line 1000 and not before. Screenshot `/tmp/fix-1000.png`:
`986`–`999` are inset, `1000` onward touch the border of a `rounded-xl` card.

Before the fix the numbers had the same 16px inset as everything else, because
the `1rem` was there for exactly this.

Fix: keep the `1rem` — `padding-left: calc(1rem + var(--code-gutter))` — and
let `--code-gutter` be only the column, which is what the comment above it now
says it is.

## 8. [LOW] [introduced by the fix] `5ch` is a hundredth of a pixel short of four digits, and the test grants half a pixel to hide it

`frontend/src/app/globals.css:757`, `code-viewer-desktop.spec.ts:194`

`5ch` minus `padding-right: 1ch` leaves a **33.71px** column; `8888` in the
same font measures **33.72px**. `ch` is the advance of `0`, and the digits the
counter draws are not all that wide. The assertion is

```
expect(fits.column).toBeGreaterThanOrEqual(fits.widest - 0.5);
```

so it passes on a column that is short, and its comment — "The slack is
sub-pixel" — is describing negative slack. Invisible at this size; it means
`5ch` is exactly-not-enough rather than exactly-enough, and the next font
change decides which way it goes. `calc(4ch + 1ch + 1px)`, or dropping the
`- 0.5` and widening until it passes, removes the coin flip.

## 9. [MEDIUM] [introduced by the fix] The gutter's width is tied to `MAX_DECORATED_LINES` by a comment, and the test that guards it hardcodes four digits

`frontend/src/app/globals.css:749-751`, `code-viewer-desktop.spec.ts:186`

Both the CSS comment and the test comment say four digits is enough *because*
`MAX_DECORATED_LINES` is 5000. But the test probes the literal `"8888"`:

```
probe.textContent = "8888";
```

Raise the cap in `TextPreview.tsx` to 20000 and the viewer draws five-digit
numbers into a four-digit column, and this test still passes — it is measuring
a constant it named but did not read. `MAX_DECORATED_LINES` is not exported, so
it cannot read it today.

That is the detector failing on the one change it exists to catch (Detector
rules: a test whose expected value is disconnected from the thing it claims to
track). Export `MAX_DECORATED_LINES` and build the probe from it —
`"8".repeat(String(MAX_DECORATED_LINES).length)` — and the CSS gets a
`--code-gutter` derived the same way, or at minimum a test that fails when the
two drift.

## On the invariant list

Yes — the list should have named it, and my reading is that the gap is
structural, not an oversight about this one property.

Every one of the twelve declared invariants is about **what is in the text**:
what a selection returns, what a `TreeWalker` collects, what a `<mark>` wraps,
that nothing is lost or duplicated, that bytes are not read as markup. That is
the right axis for a change whose risk was the two consumers of the block —
and on that axis the change is clean, which is what the whole first half of
this report says.

But the change's *purpose* was to draw something new next to the text, and the
list contains not one sentence about what is drawn. Invariant 9 counts line
elements, which is a DOM fact, and invariant 10 names double-spacing but ties
it to CRLF — a cause, not the observable. So the one region the change actually
added, the gutter, had no invariant over it at all, and the defect landed
exactly there.

The missing line, written so a mutation can violate it:

> **The gutter does not change the height of a line, and does not change where
> the block's left edge is.** Every line of a file the viewer numbers is one
> row tall unless its own text wraps, at any line count up to
> `MAX_DECORATED_LINES`; and the numbers are inset from the block's edge by the
> same padding as the text.

That sentence is violated by the SHA (first clause) and by the fix (second
clause), which is the test of whether it was worth writing. Both halves need a
line count with the widest number the viewer can reach — the four-line fixture
is what let the first one through, and there is still nothing measuring the
second.

TOTAL: 9 findings
