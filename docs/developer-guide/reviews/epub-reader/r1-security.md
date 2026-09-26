# PR-2 security review, round 1

Reviewed SHA: `15e18db86` (detached worktree `<review-worktree>`).
Perspective: security boundary (invariants 1, 2, 3, 10, 11).
Reviewer: independent subagent, no author context.

## Progress log

- Read diff, sanitizer, reader, CSP, proxy, channel, hook, e2e server/fixtures, spec, invariants.

- Baseline: vitest 230 passed; playwright-epub 22 passed (Chromium + WebKit).

## Findings

### F1. Sanitizer bypass: a `<parsererror>` element forces the HTML fallback, and XMLSerializer turns a null-namespace `foo:href` into a live `xlink:href="javascript:"` on reparse

- Labels: `[introduced]` (sanitize.js is new in this commit)
- Invariant: **1** ("no script runs ... with either one alone" — the sanitizer-alone half)
- Where: `frontend/public/epub-reader/sanitize.js:150-156` (`parse`: `doc.querySelector("parsererror")` as the fallback test) together with `:108-120` (`sanitizeAttributes` keys on `attr.localName` / `attr.namespaceURI` of the *HTML-parsed* tree) and `:160-172` (XMLSerializer output re-parsed as XHTML).
- Mechanism:
  1. A well-formed XHTML section that merely *contains* an element named `parsererror` makes `querySelector("parsererror")` true, so both foliate (`epub.js:816`) and `parse()` re-parse the text as `text/html`. (A genuinely malformed section, or one declared `text/html`, also gets there, but foliate's own XML round-trip then normalises the attribute first; the `parsererror` element keeps both passes on the HTML parser.)
  2. In the HTML tree, `<svg><a foo:href="javascript:..." xmlns:foo="http://www.w3.org/1999/xlink">` gives two null-namespace attributes whose localNames are literally `foo:href` and `xmlns:foo`. Neither starts with `on`, neither is in `URL_ATTRS`, neither is in the xlink namespace, so both survive. `parsererror` is not allowlisted and is unwrapped.
  3. XMLSerializer writes the names verbatim; the result is served as `application/xhtml+xml`, whose XML parser binds `foo` to XLink: the SVG `<a>` now carries `xlink:href="javascript:..."`.
  4. foliate's click handler uses `closest('a[href]')`, which does not match a namespaced `xlink:href`, so the click is not prevented and the SVG link navigates to `javascript:`.
- Reproduction (scratch spec, removed afterwards): a one-section EPUB whose `c1.xhtml` is
  `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>t</title></head><body><parsererror/><svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><a id="evil" foo:href="javascript:top.__pwned=(top.__pwned||[]).concat(['nsconf'])" xmlns:foo="http://www.w3.org/1999/xlink"><rect width="400" height="200" fill="red"/></a></svg></body></html>`,
  opened through `e2e-epub/fixtures/host.html`, then the rect clicked (both a dispatched `click` and a real `page.mouse.click`).
- Observed:
  - sanitizer only (CSP header stripped, `cspIsActive()` stubbed true): `top.__pwned = ["nsconf","nsconf"]` in **Chromium and WebKit** — the book script reached the top Litloft page.
  - both layers: `null` (the CSP blocks the `javascript:` navigation).
  - CSP only: `null`.
  - Direct sanitizer probe: `sanitizeMarkup` output contains `<a foo:href="javascript:top.__pwned=1" xmlns:foo="http://www.w3.org/1999/xlink">`; `DOMParser` of that output yields `xlink|foo:href=javascript:...` on an SVG `a`, same in both engines.
- Why the existing tests miss it: the hostile fixture's XLink vector is written with a real `xmlns:xlink` in a well-formed XHTML section, so it is always checked in the XLink namespace; nothing forces the HTML path together with a prefixed attribute name.
- Severity: **High** for the layer (a full one-layer bypass giving top-window script), **Medium** overall because the CSP still stops it today. Any future weakening of the CSP, or a deployment whose policy the probe mistakes for this one (see F2), turns it into stored XSS on the Litloft origin.
- Direction (not a fix): drop any attribute whose localName contains `:` or starts with `xmlns` when the tree came from the HTML parser, or decide the fallback on `doc.documentElement.localName === "parsererror"` / the parser's own error signal rather than any descendant named `parsererror`, and re-sanitize after the XML reparse (sanitize the tree the browser will actually build).

## Status of this round

This round is **incomplete**. Work stopped partway through, and the remaining perspectives were not covered. Only F1 above is established. It was reproduced in Chromium and WebKit against the real reader and sanitizer.

Not covered, and to be scoped for a follow-up reviewer:
- Mutation table for the sanitizer drop sets and attribute/URL rules, the CSP string, host validation, the raw-path allowlist, the proxy and the reader's CSP probe.
- Whether the CSP probe in `reader.js` proves *this* policy rather than *any* policy that lacks `'unsafe-inline'` / `'unsafe-eval'`. This was a suspicion only and was not measured, so it is not a finding.
- postMessage trust (invariant 10): parent origin/source/key/link checks.
- SSRF / exfiltration directives, and the auth boundary on `/api/files/<id>/stream`.
- Missing-invariant question: not answered this round.

Tree restored: the worktree is clean at `15e18db86`, the scratch spec was removed, and the local `next dev` was stopped. Nothing was committed or pushed.

TOTAL: 1 findings
