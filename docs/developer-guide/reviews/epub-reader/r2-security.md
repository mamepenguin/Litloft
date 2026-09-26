# PR-2 security review, round 2

Reviewed SHA: `12fc6fc1a` (fix) on top of `15e18db86`, detached worktree `<review-worktree>`.
Perspective: security (invariants 1, 2, 3, 10, 16; S1–S5 of round 1).
Reviewer: fresh subagent, no author context. Fix commits read: `12fc6fc1a` (only).

## Progress log

- Read invariants, round-1 security findings (r1, r1b), fix diff.
- Baseline at `12fc6fc1a`: vitest (epub* + components/epub) 269 passed; playwright-epub 63 passed, 3 skipped (Chromium + WebKit).
- Real server (the running stack at :3000, built from this SHA), read-only GETs with `curl --path-as-is`:
  `/epub-reader/..%2Fepub-reader-probe.js`, `/%65pub-reader/..%2F…`, `/epub-reader%2F..%2F…`, `/epub-reader/..%2Fapi/drives`,
  `/epub-reader/..%2F..%2Fapi/drives`, `/epub-reader/%2e%2e%2Fapi/drives`, `/epub-reader/..%5Capi/drives`,
  `/epub-reader/..%2F_next/static/chunks/<chunk>.js` (and `%65`, `epub-reader%2F` spellings) → all **404 empty** (the proxy).
  Malformed escapes (`/%65pub-reader/..%2Fapi/drives%zz`, `/%65pub-reader/%zz/..%2F..%2Fepub-reader-probe.js`, …) → Next's own
  404 page (decode fails, proxy passes, Next refuses). `/epub-reader/reader.html` carries the new policy; `/epub-reader-probe.js`
  is 200 `application/javascript`; `/api/drives`, `/` unchanged (200).
  `/epub-reader/%2e%2e/api/drives` and `/epub-reader/%2e%2e/_next/static/…` answer **200** — but a browser's URL parser turns a
  `%2e%2e` segment into `..` before the request and before CSP matching, so no browser can reach them under `script-src …/epub-reader/`
  (checked in-browser below). Round 1's "standalone build not measured" gap is closed for these spellings.
- In-browser CSP matching against the running app (Chromium + WebKit, page = the real `/epub-reader/reader.html`):
  `<script src="/epub-reader/%2e%2e/api/drives">` is normalised by the URL parser to `/api/drives` and **refused**
  (`script-src-elem` violation) in both engines; `/epub-reader-probe.js` is refused; `/epub-reader/..%2Fapi/drives` and
  `/epub-reader/..%2Fepub-reader-probe.js` are **allowed by the policy, requested, and answered 404 by the proxy**; a stylesheet
  `/epub-reader/..%2Fapi/drives` likewise leaves the document and is answered 404 (see F10). `server.js`'s direct-to-backend
  `isStreamPath` is anchored (`^/api/files/<12>/stream$`) so no `/epub-reader/…` spelling reaches the backend through it.

## Mutation table (`scratchpad/r2-mut.mjs`, `r2-mut.json`; unit = `vitest run src/lib/__tests__/epub* src/components/epub`, e2e = full `playwright-epub`, both engines; tree restored with `git checkout` after each)

| id | mutation | want | unit | e2e | result |
|---|---|---|---|---|---|
| S1 | drop `(ns === null && name.includes(":"))` | kill | pass | pass | live — the second pass refuses the F1 document on its own (want was wrong; layered) |
| S2 | drop `name.startsWith("xmlns")` | live | pass | pass | live — every `xmlns:*` in an HTML tree also contains `:` (S1 rule) |
| S3 | drop both new attribute rules | kill | pass | pass | live — second pass alone holds F1 |
| S4 | no second pass (`return once`) | live | pass | pass | live — attribute rules alone hold F1 |
| S5 | S3 + S4 (the round-1 sanitizer) | kill | **pass** | FAIL(8) | killed, **by the browser suite only**: the new jsdom vectors ("what the browser builds from the output") pass against round-1 code, so they are not a detector (see F8) |
| S6 | second pass returns `twice` instead of refusing | live | pass | pass | live — no test document changes on the second pass |
| S7 | prefixed rule narrowed to `…:href` | kill | pass | pass | live — second pass holds `foo:onload`, and SVG `onload` is not in the hostile walk anyway |
| R1 | outside-script probe always `true` | kill | pass | FAIL(8) | killed (weaker-policy cases) |
| R2 | probe URL → a file that does not exist | kill | pass | FAIL(8) | killed — under a weaker policy a 404 is taken as "refused" and the book opens (see F9) |
| R3 | `load` → `resolve(true)` | kill | pass | FAIL(8) | killed |
| R4 | eval half of the probe removed | live | pass | pass | live — still untested (round-1 R01) |
| R5 | inline half of the probe removed | live | pass | pass | live — still untested (round-1 R02); see F7 |
| R6 | probe inside `/epub-reader/` (always allowed) | kill | pass | FAIL(31) | killed (nothing opens) |
| C1 | `style-src 'self' …` | kill | FAIL(9) | FAIL(2) | killed — unit exact directive + e2e `/leaks` |
| C2 | `style-src` gains `host/` | kill | FAIL(1) | FAIL(2) | killed — e2e `/leaks` notices the stylesheet request |
| C3 | `style-src` loses the reader directory | kill | FAIL(1) | FAIL(2) | killed (reader.css blocked → layout tests) |
| P1 | `isUnderEpubReader` catch → `false` | kill | pass | n/a | live — untested; on the real server the malformed-escape paths already get Next's own 404 (measured above), so no observable consequence found |
| P2 | `isUnderEpubReader` does not decode | kill | FAIL(7) | pass | killed (unit only) |
| P3 | matcher back to `/epub-reader/:path*` | kill | FAIL(4) | n/a | killed (`unstable_doesMiddlewareMatch`) |
| P4 | matcher also skips paths starting with `%` | kill | FAIL(1) | n/a | killed |
| P5 | proxy decides on raw prefix | kill | FAIL(3) | n/a | killed |
| P6 | proxy reads `nextUrl.pathname` instead of the raw URL | live | pass | n/a | live — equivalent in unit (NextRequest keeps the encoding); not measured on the real server |

S1–S5 answer question 1 for S1/S2: F1 is held twice over, and the browser suite (new `sanitize.spec.ts` + the hostile book's `c6` section + "runs no script with the sanitizer alone") kills the regression to round-1 code in both engines. S3 (probe): R1–R3 killed; the probe halves (R4/R5) remain untested. S4 (style-src): C1–C3 killed, including by the new e2e leak detector. S5 (matcher): P2–P5 killed by unit tests using Next's own matcher helper, and the real server answers 404 for every round-1 spelling.

## Findings

Numbering continues from round 1 (F1–F6).

### F7. The second pass does not parse "as the browser will": on an XML parse error it falls back to HTML, the browser renders the XML prefix, and with the attribute rules removed F1 comes back

- Labels: `[introduced]` (the second pass and its fixtures are new in `12fc6fc1a`); invariant **1** (sanitizer alone); severity **Medium** as a detector gap — the committed code holds, but mutations S1/S3 survive while violating invariant 1.
- Mechanism: `sanitizeMarkup` re-runs `sanitizeOnce(once.text, once.type)`, and `parse()` falls back to `text/html` when the XML parse reports `parsererror`. The browser does not fall back: the blob is `application/xhtml+xml`, and Chromium and WebKit both **render the document up to the first XML error** (with the error banner). An XML-invalid character (U+000C form feed; any C0 control) placed *after* a payload makes both passes take the HTML path, so `twice === once` and the output is accepted, while the browser builds the XML prefix — in which `foo:href` + `xmlns:foo` bind to XLink.
- Reproduction (`scratchpad/r2-ff.cjs`; the sanitizer module evaluated in a same-origin page, output loaded as an `application/xhtml+xml` blob iframe, the rect clicked): the round-1 F1 section plus `<p>x\u000cy</p>` after the `<svg>`.
  - committed code: accepted, the rendered `a` carries only `id`; `__pwned = null` (Chromium, WebKit).
  - S3 mutant (both new attribute rules removed, second pass kept): **accepted**; rendered `a` has `xlink|foo:href=javascript:…`; click → `top.__pwned = [1]` in **Chromium and WebKit**. Without the form feed the same mutant is refused — which is why S1/S3 look safely redundant in the table.
- So the two new mechanisms are not two layers for this class: the attribute rules are the only thing holding F1 on the fallback path, and no test would notice their removal (S1, S3, S7 live).
- Direction (not a fix): make the second pass parse strictly with `once.type` and refuse on `parsererror` (such a section already renders as an XML error page in the browser, see below), and/or add the trailing-control-character vector to `sanitize.spec.ts` / the hostile book.
- Side observation `[pre-existing]` (not counted): any section containing a C0 control character reaches the browser as an XHTML blob that fails to parse, and shows the engine's XML error banner above a truncated chapter. Availability only.

### F8. The new jsdom vectors for F1 do not detect the round-1 sanitizer

- Labels: `[introduced]` (tests added in `12fc6fc1a`: `epubReaderSanitize.test.ts` "what the browser builds from the output"); invariant **1**; severity **Low** (bucket B candidate: the browser suite does kill the regression).
- Observation: mutation S5 restores the round-1 sanitizer exactly (no attribute rules, no second pass); unit = **pass**, e2e = FAIL(8). jsdom's parser/serializer does not reproduce the Chromium/WebKit behaviour that makes F1 work, so these three unit vectors hold nothing; the claim they appear to make is held only by `e2e-epub/sanitize.spec.ts` and the hostile book's `c6` section.
- Direction: none required beyond knowing it; if kept, they should not be read as coverage.

### F9. The outside-script probe takes any load error as "refused by the policy"

- Labels: `[introduced]` (`outsideScriptRefused` in `reader.js`, `public/epub-reader-probe.js`); invariant **2**; severity **Low**.
- The decision is `error → refused`. `error` also fires for a 404, a network failure, or a MIME/nosniff rejection. Mutation R2 (probe URL pointing at a file that does not exist) shows the consequence: under each weaker policy tested (`script-src 'self'`, `*`, `http: https:`, the `'self'` set) the reader **opens the book** (e2e FAIL(8) is the test catching exactly that). So the guard now depends on a new environmental prediction — that `/epub-reader-probe.js` is reachable in every deployment where the policy might be weak (e.g. a front proxy that forwards only some paths, a basePath, a build that drops the file). In the running stack it is served 200.
- Also: a policy that happens to refuse this one URL but not others (e.g. `script-src <host>/epub-reader/ <host>/api/`) passes the probe; the probe proves "this URL is refused", not "same-origin scripts outside the directory are refused". Contrived; not counted separately.
- Direction: decide on positive evidence — a `securitypolicyviolation` event whose `blockedURI` is the probe URL (fired in both engines, measured above: `…/epub-reader-probe.js script-src-elem`) — and treat `load`, `error` without a violation, and silence as "not proven".

### F10. A book can still send credentialed GETs to non-reader paths spelled under `/epub-reader/` (`/epub-reader/..%2F…`); only the proxy's 404 stops them

- Labels: `[introduced]` for stylesheets (the new `style-src <host>/epub-reader/`); the same holds for `script-src` since `15e18db86`; invariant **16** ("no request leaves a book except to `blob:`, `data:` or the reader's own files"); severity **Low**.
- Measured (Chromium and WebKit, real policy from the running stack): `<link rel=stylesheet href="/epub-reader/..%2Fapi/drives">` and `<script src="/epub-reader/..%2Fapi/drives">` are **allowed** by the policy and **requested** with the cookie; the proxy answers 404, so nothing reaches the backend. The book's own `<link>` / `@import` pass `isAllowedUrl` (http(s) absolute or relative), so a book can do this.
- The e2e leak detector (`/leak/…` paths on the test server) cannot see this spelling: the test server's `isUnderEpubReader` branch answers 404 before the leak recorder runs, and no fixture uses it.
- Impact today: none observed (proxy 404 on every spelling measured). Invariant 16 as written is violated by the request leaving, and its enforcement for these spellings rests entirely on the proxy, as `script-src` already did.
- Direction: either accept and reword invariant 16 to "reaches" (supervisor's call), or make the leak detector cover `/epub-reader/..%2Fleak/…`.

### F11. The eval and inline halves of the probe are still untested (round-1 S3 partly addressed)

- Labels: `[pre-existing]` (to the fix; code from `15e18db86`, round-1 R01/R02); invariant **2**; severity **Low**.
- R4 (eval half removed) and R5 (inline half removed) survive. None of the four weaker policies added in `reader.spec.ts` carries `'unsafe-inline'` or `'unsafe-eval'`, so a policy such as `script-src <host>/epub-reader/ 'unsafe-inline'` — which the outside-script half accepts — is caught only by code no test exercises. Under that policy inline `<script>` in a section blob would run if the sanitizer missed one.
- Direction: add `… 'unsafe-inline'` and `… 'unsafe-eval'` variants of the reader's own policy to the weaker-policy loop.

### S6 (known issue) — `[pre-existing]`, unchanged

Host-rewriting reverse proxy still leaves the reader on "loading" (the policy is still derived from `Host`); now recorded in `known-issues.md`. No change in behaviour from this fix.

## Question 2 — what the fix broke or opened (summary)

- Probe: F9 (error ≠ refusal), F11 (halves untested). No timing issue found: `state.opened` is set before the async probe, so a second `open` is ignored; under the real policy the probe fires `error` promptly with a violation in both engines.
- Broad matcher: measured on the running stack — `/`, `/admin`, `/setup`, `/unlock`, `/settings`, `/drive/...` (incl. `?view=`), RSC requests, `/manifest.json`, `/icon-192.png`, `/file.svg` answer as expected with no CSP; `/api/*` (rewrites, uploads, `/api/ws` on the custom server's upgrade path) and `/_next/*` are excluded by the matcher and `server.js` routes `/api/files/<id>/stream` itself with an anchored regex. `/epub-reader` → Next 404, `/epub-reader/` → 308 then 404. The proxy cannot throw (decode is caught), so it cannot 500 the whole app. Not measured: `next dev` (the matcher helper test covers config, not the dev server), and a proxied request with a body (server actions) — the proxy returns `NextResponse.next()` without touching it, so no change is expected.
- Decode failure / double encoding: malformed escapes fall to `rawPath.startsWith("/epub-reader")` or to Next's own 404 (measured); `%252F` decodes once on both sides (CSP and proxy) and stays a literal `%2F` → reader-file regex fails → 404; `%2e%2e` segments are normalised by the browser before CSP matching (measured), so the 200 `curl --path-as-is` gets for `/epub-reader/%2e%2e/api/drives` is not reachable from a page. P1 (catch → false) is untested but has no observable consequence on the real server.
- Convergence check vs legitimate books: no refusal. 20 realistic sections (`scratchpad/r2-legit.cjs`: `epub:type` with `xmlns:epub`, XHTML 1.1 doctype with `&nbsp;`/`&mdash;`, `&nbsp;` without doctype (HTML fallback), MathML with `semantics`/`annotation`, SVG cover with `xlink:href` + `viewBox`, self-closing `<a id/>`, `<td/>`, `xml:lang` + ruby, CDATA style + comment, `xml-stylesheet` PI, `&#10;`/`&#9;` in attributes, `&lt;`/`&amp;`/`]]&gt;` text, CRLF, custom namespaces, standalone SVG document, malformed HTML with SVG and `epub:type`) pass through both raw and foliate's own parse/serialize step in Chromium and WebKit, and all e2e fixtures open. Only a section with a C0 control character is "accepted but unparseable" (F7 side note).

## Question 3 — trajectory

Only one fix round exists (`12fc6fc1a`); the round before it is the original design (`15e18db86`). Reading the two in order:

- **Sanitizer:** the design added an HTML-fallback branch; this round adds two attribute-drop branches for HTML-tree quirks and a new state (refuse when the second pass differs). F7 shows the second pass itself mirrors the fallback branch where the browser does not — the next fix to it would be another branch on the same fallback path.
- **CSP probe:** the design proved the policy with two predictions (eval refused, inline refused); this round adds a third (an outside script is refused) plus a new environmental prediction (the probe file exists, so `error` means refused — F9). Each round approximates "is this our policy?" by one more observable.
- **Proxy:** this round **removes** a prediction (how the matcher sees encodings) in favour of deciding on the decoded path — that part converges.
- **style-src:** a value change, not a branch.

So yes: the sanitizer's fallback path and the probe each gained a branch/prediction this round, of the same kind the design introduced. It is one round, not two in a row, so by the rule it is not yet the C pattern — but if the fixes for F7 and F9 again add a branch to the fallback path or another probe prediction, it will be. Two changes that would *remove* rather than add: parse the second pass strictly as XML (drops the fallback from the check), and decide the probe on a `securitypolicyviolation` for the probe URL (drops the file-exists prediction).

## Status

Tree restored: worktree clean at `12fc6fc1a` (`git status` empty); no throwaway files were written into the worktree (browser scripts live in the scratchpad and only read the worktree / send GETs to :3000). Nothing committed or pushed; no Docker action.

TOTAL: 5 findings
