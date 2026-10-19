# PR-2 security review, round 1b (continuation of round 1)

Reviewed SHA: `15e18db86` (detached worktree `<review-worktree>`).
Scope: mutation table (sanitizer, epubReaderCsp, isEpubReaderFile + proxy, CSP probe), CSP-probe strength,
postMessage trust (inv. 10), exfiltration directives and the auth boundary, missing invariants.
Round-1 F1 (parsererror + namespaced attribute) is not re-derived here.
Reviewer: fresh subagent, no author context.

## Progress log

- Baseline at `15e18db86`: vitest (epub*) 230 passed; playwright-epub 22 passed (Chromium + WebKit).
- Measured CSP path matching in both engines (throwaway spec, removed): with `script-src <host>/epub-reader/`,
  `/%65pub-reader/..%2fx.js`, `/epub-reader%2f..%2fx.js` and `/epub-reader/..%5cx.js` are all ALLOWED by the
  policy in Chromium and WebKit; `/EPUB-READER/..%2fx.js` is blocked (case-sensitive). So the raw-path
  allowlist in `proxy.ts` is the only thing between these URLs and a non-reader file.
- Measured against `next dev` (port 3917, throwaway `public/zz-probe.js`, removed): every one of those raw
  paths answers 404, while `/EPUB-READER/..%2Fzz-probe.js` (not CSP-allowed) is served 200 — i.e. Next does
  decode `%2F` and normalise `..` for a path the proxy does not own, and the proxy's matcher does catch the
  `%65` and `epub-reader%2F` spellings. Holds in `next dev`; the standalone build + `server.js` was not
  built here (spec defers it to R-5).

## Mutation table — sanitizer (`frontend/public/epub-reader/sanitize.js`)

Each row: one edit, `want` declared before running, then `vitest run src/lib/__tests__/epub* src/components/epub`
and `playwright test --config=playwright-epub.config.ts reader.spec` (Chromium + WebKit), then `git checkout`.
Runner and inputs: `scratchpad/r1b-mut.mjs`, `r1b-mut-S.json`, `r1b-mut-S2.json`.

| id | mutation | want | unit | e2e | result |
|---|---|---|---|---|---|
| S01 | DROP: remove script (allowlist still unwraps) | live | FAIL(2) | pass | killed; want was wrong: killed only because the unwrapped script's text stays in the body (test asserts no `x()` text). Safe either way. |
| S02 | DROP: remove iframe | live | pass | pass | live; unwrapped by the allowlist; attrs (srcdoc) go with the element |
| S03 | DROP: remove foreignobject | live | pass | pass | live; unwrapped; children still sanitized |
| S04 | DROP: remove animate/set | live | pass | pass | live; unwrapped |
| S05 | DROP: remove form/button/input | live | pass | pass | live; unwrapped |
| S06 | HTML allowlist gains script (and DROP loses it) | kill | pass | pass | live; allowlist-only edit; DROP still removes it first → equivalent. See S06c. |
| S06b | HTML allowlist gains iframe | kill | pass | pass | live; as S06; see S06d |
| S07 | SVG allowlist gains foreignobject | kill | pass | pass | live; as S06; see S07c |
| S08 | SVG allowlist gains animate | kill | pass | pass | live; as S06; see S08c |
| S09 | HTML allowlist gains form | kill | pass | pass | live; as S06; see S09c |
| S10 | on* check narrowed | kill | FAIL(3) | pass | killed |
| S11 | on* check case-sensitive | kill | FAIL(1) | pass | killed |
| S12 | xml:base kept | kill | FAIL(1) | pass | killed |
| S13 | non-href xlink attrs kept | live | pass | pass | live; xlink:show/actuate/title carry no behaviour in either engine |
| S14 | meta http-equiv attr kept (element rule still removes) | live | pass | pass | live; keepElement removes the element anyway (equivalent) |
| S15 | URL check ignores xlink namespace | kill | pass | pass | live; equivalent: `xlink:href` has localName `href`, already in URL_ATTRS; non-href xlink attrs are dropped by the previous clause |
| S16 | URL_ATTRS loses href | kill | FAIL(5) | pass | killed |
| S17 | URL_ATTRS loses src | kill | FAIL(2) | pass | killed |
| S18 | URL_ATTRS loses poster | kill | FAIL(1) | pass | killed |
| S19 | URL_ATTRS loses action/formaction | live | pass | pass | live; form/button are unwrapped, so action/formaction never reach a form |
| S20 | URL_ATTRS loses data | live | pass | pass | live; object is dropped |
| S21 | URL_ATTRS loses ping | live | pass | pass | live; ping sends only on navigation; foliate cancels `a[href]` clicks and CSP connect-src 'none' covers ping |
| S22 | DROP_ATTRS loses target | kill | FAIL(1) | pass | killed |
| S23 | DROP_ATTRS loses srcset | kill | FAIL(1) | pass | killed |
| S24 | DROP_ATTRS loses formtarget | live | pass | pass | live; no form element survives |
| S25 | schemeOf keeps control chars | kill | FAIL(1) | pass | killed |
| S26 | schemeOf strips only spaces | kill | FAIL(1) | pass | killed |
| S27 | relative URL refused | kill | FAIL(3) | pass | killed |
| S28 | data: allowed everywhere | kill | FAIL(1) | pass | killed |
| S29 | data image regex allows svg | kill | FAIL(2) | pass | killed |
| S30 | data image regex loses terminator | live | pass | pass | live; harmless: data:image/pngX is still an image type |
| S31 | isImageSource always true | kill | pass | pass | live; **survivor with a gap**: `data:image/*` accepted on every URL attribute (e.g. `<a href>`, `<video poster>`). No script consequence found (data: top-level navigation is blocked, foliate cancels `a` clicks, img-src allows data:). Recorded as B, not counted. |
| S32 | isImageSource always false | kill | FAIL(1) | pass | killed |
| S33 | any link rel kept | kill | FAIL(1) | pass | killed |
| S34 | meta http-equiv element kept | live | FAIL(1) | pass | killed; want was wrong: test counts `meta` elements, so it kills; fine |
| S35 | PI and doctype kept | kill | FAIL(1) | pass | killed |
| S36 | disallowed elements removed instead of unwrapped | kill | FAIL(1) | pass | killed |
| S37 | disallowed elements kept | kill | FAIL(1) | pass | killed |
| S38 | children not recursed | kill | FAIL(35) | pass | killed |
| S39 | root attributes not sanitized | kill | pass | pass | live; equivalent: `sanitizeNode(doc)` already visits the root element as a child of the document |
| S40 | root namespace not checked | live | pass | pass | live; a root outside the allowlisted namespaces is served but inert (all its children unwrapped/sanitized) |
| S41 | no HTML fallback on parsererror | kill | FAIL(1) | pass | killed |
| S42 | no-namespace XML accepted | live | pass | pass | live; un-namespaced XML → every element is in the null namespace → all unwrapped to text |
| S43 | output type always XHTML | kill | FAIL(1) | pass | killed |
| S44 | isMarkupType loses /xml | kill | FAIL(2) | pass | killed |
| S45 | isMarkupType loses includes(html) | live | pass | pass | live; a type caught only by `includes("html")` becomes text/plain — fails safe |
| S46 | isMarkupType loses +xml | kill | FAIL(1) | pass | killed |
| S47 | non-inert types keep their type | kill | FAIL(4) | pass | killed |
| S48 | passthrough type not normalised | kill | FAIL(1) | pass | killed |
| S49 | type not normalised (params kept) | kill | FAIL(1) | pass | killed |
| S50 | type not lower-cased | kill | FAIL(1) | pass | killed |
| S51 | passthrough adds javascript | kill | FAIL(1) | pass | killed |
| S52 | font passthrough widened to any font-* | live | pass | pass | live; font bytes cannot become a document |
| S53 | markup read from string only (Blob skipped) | kill | FAIL(8) | pass | killed |
| S54 | SVG-declared parsed as XHTML | live | pass | pass | live; SVG parsed as XHTML still yields an SVG root in the SVG namespace |
| S06c | script moved from DROP to HTML allowlist | kill | FAIL(11) | pass | killed |
| S06d | iframe moved from DROP to HTML allowlist | kill | FAIL(1) | pass | killed |
| S07c | foreignobject moved from DROP to SVG allowlist | kill | FAIL(1) | pass | killed |
| S08c | animate+set moved from DROP to SVG allowlist | kill | FAIL(2) | pass | killed |
| S09c | form+button moved from DROP to HTML allowlist | kill | FAIL(1) | pass | killed |
| S55 | base moved from DROP to HTML allowlist | kill | FAIL(1) | pass | killed |
| S56 | object/embed moved from DROP to HTML allowlist | kill | FAIL(2) | pass | killed |
| S57 | annotation-xml moved from DROP to MathML allowlist | kill | FAIL(1) | pass | killed |

Observation on the table: **no sanitizer mutation is killed by the real-browser suite** (e2e column is `pass`
for all 62 rows, including S06c "script allowlisted" and S37 "disallowed elements kept"). The e2e hostile tests
run either with both layers or with the CSP alone; the sanitizer alone is tested only in jsdom. See F2.

## Mutation table — CSP, reader-file allowlist, proxy, CSP probe, message channel

Files: `src/lib/epubReaderCsp.ts` (C), `src/proxy.ts` (P), `public/epub-reader/reader.js` (R), `public/epub-reader/core.js` (K),
`src/lib/epubReaderChannel.ts` (H), `src/components/epub/useEpubReader.ts` (U). Input `r1b-mut-C.json`.

| id | mutation | want | unit | e2e | result |
|---|---|---|---|---|---|
| C01 | default-src * instead of 'none' | kill | FAIL(1) | pass | killed; killed by the unit exact-directive table only; e2e does not notice (nothing in the hostile book relies on default-src) |
| C02 | script-src gains 'self' | kill | FAIL(14) | FAIL(2) | killed |
| C03 | script-src host without path | kill | FAIL(6) | FAIL(2) | killed |
| C04 | script-src '*' | kill | FAIL(14) | FAIL(2) | killed |
| C05 | style-src loses unsafe-inline | kill | FAIL(1) | FAIL(8) | killed |
| C06 | img-src gains https: | kill | FAIL(1) | pass | killed; unit only |
| C07 | connect-src * | kill | FAIL(1) | pass | killed; unit only |
| C08 | frame-src * | kill | FAIL(1) | FAIL(12) | killed |
| C09 | form-action removed | kill | FAIL(1) | pass | killed; unit only |
| C10 | base-uri removed | kill | FAIL(1) | pass | killed; unit only |
| C11 | frame-ancestors * | kill | FAIL(1) | pass | killed; unit only |
| C12 | media-src * | kill | FAIL(1) | pass | killed; unit only |
| C13 | font-src * | kill | FAIL(1) | pass | killed; unit only |
| C14 | HOST_RE unanchored start | kill | FAIL(3) | pass | killed |
| C15 | HOST_RE unanchored end | kill | FAIL(4) | pass | killed |
| C16 | host not validated | kill | FAIL(6) | pass | killed |
| C17 | invalid host falls back to 'self' | kill | FAIL(8) | pass | killed |
| C18 | port digits unbounded | live | pass | pass | live; harmless |
| C19 | reader file regex unanchored end | kill | FAIL(1) | pass | killed |
| C20 | reader file regex: any vendor js | kill | FAIL(1) | pass | killed |
| C21 | reader file regex: any top-level js | kill | FAIL(1) | FAIL(?) | killed |
| C22 | reader file regex: dot unescaped in reader. | live | pass | pass | live; `reader.` with any char still needs a literal char, not `%2e`; harmless |
| P01 | non-reader path passed through | kill | FAIL(3) | pass | killed |
| P02 | policy header not set | kill | FAIL(1) | pass | killed |
| P03 | rawPath from decoded pathname | kill | pass | pass | live; equivalent: a decoded `..` never matches the exact allowlist; decoding only admits `reader%2ejs`, which is a reader file |
| P04 | policy host from nextUrl | live | pass | pass | live; nextUrl.host is derived from the same Host header |
| R01 | probe: eval half removed | live | pass | pass | live; **gap**: the `new Function` half of the probe is untested — removing it is invisible (see F3) |
| R02 | probe: inline half removed | live | pass | pass | live; **gap**: the inline half is untested alone; either half suffices when the header is simply missing (see F3) |
| R03 | probe always true | kill | pass | FAIL(2) | killed |
| R04 | open skips probe | kill | pass | FAIL(2) | killed |
| R05 | reader listener ignores source | live | pass | pass | live; reader accepts commands from any same-origin window; only a script already inside the origin could send one |
| R06 | reader listener ignores origin and source | live | pass | pass | live; as R05, plus any origin — but postMessage from another origin cannot transfer anything the reader acts on beyond `turn`/`theme`/`mode`/`open`; an `open` from a cross-origin opener would render an attacker-supplied book under the policy. frame-ancestors 'self' keeps cross-origin framers out; a cross-origin *opener* (window.open of /epub-reader/reader.html) is not covered by frame-ancestors. Untested; not counted (reader then posts to `parentWindow===window`, i.e. nowhere) |
| R07 | reader forwards any external link | live | pass | pass | live; parent re-validates (H04 kills) |
| R08 | reader posts with targetOrigin * | live | pass | pass | live; frame-ancestors 'self' keeps the parent same-origin |
| R09 | open accepted twice | live | pass | pass | live; no second-open test; not security |
| K01 | core isHttpUrl accepts any scheme | kill | FAIL(4) | pass | killed |
| K02 | keyAction forwards any key | kill | FAIL(4) | pass | killed |
| H01 | parent ignores source | kill | FAIL(3) | pass | killed |
| H02 | parent ignores origin | kill | FAIL(2) | pass | killed |
| H03 | parent key allowlist open | kill | FAIL(5) | pass | killed |
| H04 | parent link any scheme | kill | FAIL(4) | pass | killed |
| H05 | turned fraction unbounded | kill | FAIL(2) | pass | killed |
| H06 | postToReader targetOrigin * | live | FAIL(1) | pass | killed; want was wrong: a unit test asserts the target origin; fine |
| U01 | window.open without noopener | kill | FAIL(1) | pass | killed |
| U02 | book fetched without credentials | kill | FAIL(1) | pass | killed |
| U03 | reader window re-read at message time (open posted to current frame) | kill | pass | pass | live; test harness artefact (jsdom `window.frames[0]` is the reader frame); discard |
| P05 | `config.matcher` narrowed to `/epub-reader/reader.html` (measured against `next dev`, not by the runner) | kill | pass (45/45) | n/a (e2e uses its own server) | **live** — see F5 |

## Findings

Numbering continues from round 1 (F1 is round 1's).

### F2. The sanitizer alone is never tested in a real browser: all 62 sanitizer mutations survive the e2e suite

- Labels: `[introduced]` (the e2e suite and sanitizer are new in this commit); invariant **1** ("with either one alone"); severity **Medium** (test gap on a security layer).
- Observation: the mutation table above. S06c (`script` allowlisted and not dropped), S37 (disallowed elements kept), S38 (children not recursed) and every attribute/URL rule are invisible to Playwright in both engines; only jsdom catches them. `reader.spec.ts` has "runs no script" (both layers) and "runs no script with the policy alone" (sanitizer stubbed) but no "with the sanitizer alone" (CSP header stripped and `cspIsActive` bypassed).
- Why it matters: jsdom's parser/serializer is not the browsers'. Round-1 F1 is exactly a browser-only divergence (XMLSerializer + XHTML reparse) that the jsdom suite could not see. Invariant 1 says both layers hold alone; half of that claim has no real-browser detector.
- Direction: a Playwright test that strips the CSP from every `/epub-reader/` response and stubs the probe, then walks `hostileBook` (plus a F1-style fixture) asserting `__pwned === null`.

### F3. The CSP probe proves "some policy without `unsafe-inline`/`unsafe-eval`", not the reader's policy

- Labels: `[introduced]` (`reader.js` new); invariant **2**; severity **Medium** as a one-layer weakness (becomes a script run only together with a sanitizer bypass such as F1-class, or F2-class regressions).
- Measured (throwaway spec, removed; Chromium and WebKit, sanitizer stubbed, book with `<script src="<origin>/evil.js">`): with `reader.html`'s policy replaced by `script-src 'self'`, `script-src *`, `script-src http:`, or the single directive `script-src 'self'` (no `default-src`, `frame-src`, `connect-src`, …), the reader posts `boot`, `ready` — it opens the book — and `top.__pwned` becomes `["same-host-js"]` in every case. The probe does not distinguish the reader-directory scoping (the thing that keeps `/api/files/<id>/stream` from loading as script) nor the presence of any other directive.
- Mutations R01/R02: removing either half of the probe is invisible to the tests; only "no header at all" is tested, which either half detects.
- When a weaker policy occurs: the probe is the fail-closed guard for "the proxy did not run" — e.g. a standalone build where the middleware is not applied, combined with a reverse proxy or future site-wide CSP that sets `script-src 'self'`. The probe then reports active and parses the book.
- Direction: probe the specific property, e.g. a `<script src>` to a same-origin URL outside `/epub-reader/` must fire `securitypolicyviolation` (and optionally `blob:` script / `frame-src` probes), and add an e2e case per weaker policy.

### F4. `style-src 'self'` lets a book make credentialed same-origin GET requests to any path, on open, without a click

- Labels: `[introduced]` (`epubReaderCsp.ts`); invariant **none** (no declared invariant covers requests; see "Missing invariants"); severity **Low**.
- Measured (Chromium and WebKit, real policy, real sanitizer): a section with `<link rel="stylesheet" href="<origin>/x-style.css"/>` and `<style>@import url("<origin>/x-import.css")</style>` produces both requests (`resourceType=stylesheet`) as soon as the section renders. `isAllowedUrl` accepts absolute `http:` URLs and book CSS is passed through untouched, so any same-origin path — `/api/files/<other id>/stream`, `/api/drives/...`, any addon GET route — can be requested with the viewer's cookie by a book the viewer merely opens.
- Everything else in the same probe produced no request: `img`, `video src/poster`, `audio`, SVG `use href`/`xlink:href`, SVG `image`, CSS `background:url()`, `@font-face`, `a ping`, `area` navigation, SVG `<a xlink:href>` navigation (not intercepted by foliate's `a[href]` handler, but blocked by `frame-src blob:`), external `link rel=stylesheet`. `a href` to http(s) only reaches the parent as a `link` message (user click → `window.open(..., "noopener,noreferrer")`).
- Impact today: no core GET route with a side effect was found (`backend/app/routers/*` GETs read only); responses cannot be read back (no script, and every further CSS request is again same-origin/blob/data). The residual is CSRF-by-GET against any current or future GET with a side effect (addon routes through `addon_proxy` were not audited).
- Direction: `style-src <host>/epub-reader/ 'unsafe-inline' blob:` (the reader's own stylesheet is `reader.css`), the same scoping `script-src` uses.

### F5. The proxy matcher is untested; narrowing it silently reopens the `..%2F` bypass

- Labels: `[introduced]` (`src/proxy.ts`); invariant **3**; severity **Medium** (detector gap on the fix the spike found necessary).
- Measured against `next dev` with `config.matcher` mutated to `"/epub-reader/reader.html"`: `/epub-reader/..%2Fzz-probe.js`, `/%65pub-reader/..%2Fzz-probe.js` and `/epub-reader%2F..%2Fzz-probe.js` are all served **200** (a public file outside the reader), and `/epub-reader/reader.js` is served **without** a CSP; the unit suite passes 45/45 and the e2e suite cannot notice because `e2e-epub/server.ts` re-implements the routing (`rawPath.startsWith("/epub-reader/")`) instead of running `proxy.ts`. Browsers accept all three spellings under `script-src <host>/epub-reader/` (measured in Chromium and WebKit), so this mutation is a live script-src bypass for any same-origin file Next would serve, not only a missing header.
- With the matcher as committed, all three answer 404 in `next dev`. Standalone build not measured.
- Direction: a test that exercises the matcher (e.g. `unstable_doesMiddlewareMatch` from `next/experimental/testing/server`, or the e2e run against `next start`) for the raw spellings above.

### F6. A Host header that differs from the browser's origin leaves the reader stuck on "loading" with no error

- Labels: `[introduced]`; invariant **none**; severity **Low** (availability; fails closed, no security exposure).
- Measured (Chromium and WebKit): serving the reader with `epubReaderCsp("frontend:3000")` while the page is on another host blocks `reader.js`; the parent receives no message at all (`__msgs = []` after 3 s). `useEpubReader` has no timeout, so `EpubPreview` shows the loading status forever with no download fallback. A reverse proxy that rewrites Host (nginx's default `proxy_set_header Host $proxy_host`) produces this; the docs acknowledge reverse proxies in front of Litloft.
- Direction: a boot timeout that sets `error` (the existing `EmptyState` with download), or derive the host from `X-Forwarded-Host` only behind an explicit trust setting.

### F1 variants

None reproduced this round (not attempted beyond the round-1 record).

## postMessage trust (invariant 10) — checked, no new finding

- Section documents are nested blob frames inside the reader; their `postMessage` to the Litloft page carries `event.source` = the section window, which `parseReaderMessage` rejects (H01 kills). A nested frame cannot forge the reader's source.
- `event.source` compares the iframe's WindowProxy, which is stable across navigations of that iframe, so a reader frame navigated to another same-origin document would be trusted. Nothing but script can navigate it: `target`/`formtarget` are dropped on every element (S22 kills), `base` is dropped, forms are unwrapped, and `frame-src blob:` blocks a section navigating itself to a non-blob URL (measured with `area` and SVG `xlink:href`). Only reachable after invariant 1 already failed.
- Replayed keys: only `ArrowLeft`, `ArrowRight`, `f`, `Escape` reach `replayKey` (H03, K02 kill), with no modifiers; they map to prev/next file, fullscreen toggle and exit — the allowlist's intent. Synthetic (`isTrusted=false`) events cannot request fullscreen without activation, which the originating key press supplies.
- `window.open(url, "_blank", "noopener,noreferrer")` is asserted (U01 kills). A same-origin `http(s)` URL is allowed as a link target; that is an ordinary user-clicked link.
- The reader's own listener checks `origin` and `source === parent` (R05/R06 survive: untested, but an attacker would already need script in the origin or a cross-origin opener whose messages then fail `source === parent`).

## Exfiltration and the auth boundary — summary

- Directives: `connect-src 'none'`, `img-src`/`font-src blob: data:`, `media-src blob:`, `frame-src blob:`, `form-action 'none'`, `base-uri 'none'`, `default-src 'none'` — each individually killed only by the unit exact-directive table (C01, C06–C13); e2e checks none of them behaviourally. Measured behaviour: see F4 (only same-origin stylesheets leak a request).
- `navigator.sendBeacon`, `fetch`, workers: need script; `connect-src`/`default-src` would block them in the reader document, but a script that ran could call `parent.fetch` (same origin, no sandbox) — the accepted residual in the spec.
- Anchor DNS prefetch (Chromium prefetches anchor hostnames on http pages) was not measurable here; no `X-DNS-Prefetch-Control: off` is sent. Not counted.
- The book bytes are fetched by the parent (`credentials: "include"`, U02 kills) and transferred; the reader document itself never holds a URL to `/api/`.

## Missing from the invariant list (answered once)

1. **No request leaves the book except to the reader's own files** (or: "opening a book issues no request to a URL outside `blob:`/`data:`/`/epub-reader/`"). Nothing declared covers exfiltration or same-origin credentialed requests; F4 would violate it today.
2. **The CSP probe fails when `script-src` admits a same-origin URL outside `/epub-reader/`** — invariant 2 as written ("CSP is proven active") is satisfied by any policy; F3.
3. **A reader that never boots shows the error state with a download**, not an endless loading indicator; F6.
4. Invariant 3 should name the route, not only the responses: "`/epub-reader/..%2F`, `/%65pub-reader/..%2F` and `/epub-reader%2F..%2F` are 404 through the real Next server" — the spellings browsers accept under the policy (F5).

## Status

Tree restored: worktree clean at `15e18db86`; throwaway specs and `public/zz-probe.js` removed; `next dev` stopped. Nothing committed or pushed.

TOTAL: 5 findings
