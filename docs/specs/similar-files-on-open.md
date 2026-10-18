# Similar files load when the file detail opens

SPEC-ID: SPEC-ADDON-024

Approval:

## Summary

The intelligence addon's **Similar files** section, drawn by core's `file-relations` slot
under the file detail's **Related** group, starts its search when it mounts instead of when
the viewer expands it, and starts expanded. Detection was made user-initiated because one
request used to take about 10 s on production and starved the page and the server. Since the
vector tables were partitioned by type (SPEC-ADDON-022/023, deployed 2026-10-17), production
`GET /similar/{id}?limit=6` measures 0.03-0.3 s, and 1.0-1.5 s for the first request that
reads a drive's partition from disk, across documents, videos, images and archives on the
drives `main` and `videos`. So the result can be ready by the time the viewer looks at the
Related tab. This is for the single viewer of the personal library, who should not have to
press anything to see similar files.

The change lives in the `addons/intelligence` submodule's frontend. The backend, the endpoint
and core's slot host are not changed.

## Required items

### 1. Normal flow

1. The viewer opens a file detail. Core mounts every inspector tab panel at once and only
   hides the ones not selected (`InspectorShell`), so the Related panel, and the `file-relations`
   slot inside it, mounts with the detail even while another tab is shown. In the layout
   without the shell, `RelatedStack` mounts it in the page flow. On a phone the inspector is a
   sheet whose drawer is mounted only while expanded, so there the section mounts when the
   viewer expands the sheet.
2. On mount, `SimilarFilesSection` is expanded and in `loading`, shows its six ghost cards,
   and sends one `GET /api/addons/intelligence/similar/{fileId}?limit=6` with the `X-Lit-Drive`
   of the drive it was given.
3. The response replaces the ghosts with the result cards and the heading becomes
   "Similar files (N)". If the response is empty, the existing empty text is shown.
4. The viewer may collapse and expand the section. Neither sends a request; the results that
   were loaded are shown again.
5. Moving to another file (the section receives a new `fileId`) resets it to expanded and
   `loading` and sends one request for the new file.

### 2. Failure cases

- **The request fails or times out** (the addon proxy's 15 s timeout, the addon down, a 5xx):
  the existing behaviour is kept. The section waits 6 s and asks again, then 12 s and asks
  again, and after the third failure shows "unavailable" with a retry button. The retry
  starts the same sequence again.
- **The viewer moves to another file while a request or a backoff is pending**: the pending
  answer is discarded when it arrives and no further retry is sent for the old file. The new
  file's request starts at once.
- **The section unmounts while pending** (the detail closes, the phone sheet collapses):
  nothing it receives later is shown, and it sends no further retry.
- **The source file is not indexed**: the endpoint answers with an empty result, which shows
  the empty text, as today.
- **The drive is locked or the file is not in it**: the endpoint answers 404 and the section
  follows the failure path above, as today.

### 3. States

`loading -> loaded`, `loading -> (backoff) -> loading`, `loading -> unavailable`,
`unavailable -> loading` (retry button), and from any state `-> loading` on a new `fileId`.
`idle` is no longer reached: the section is in `loading` from its first render.

Independently, expanded/collapsed: expanded on mount and on each new `fileId`, toggled only by
the viewer. Collapsing while `loading` does not cancel the request, and the result landing
does not expand the section again.

### 4. Data read and written

- Read: the addon's `GET /similar/{file_id}` (search.db through the read session, and the
  addon's in-process similar-files cache, which the request may fill).
- Written: nothing persistent. Component state only. No localStorage.

### 5. External services

None outside the stack. The only call is to the intelligence addon through core's addon
proxy; its slow, down and wrong cases are the failure cases in item 2.

### 6. Authorization

Unchanged. The core addon proxy requires `X-Lit-Drive` for the drive-scoped route and checks
it against the viewer's accessible drives; the endpoint checks that the source is in that
drive. The section sends the drive it was given by the slot host and no other.

### 7. Effect on existing features

- Every file detail open now sends one similar-files request, where before only an expand did.
  On a phone, every sheet expansion of a not-yet-loaded file does.
- The other members of the Related group (core's relations) do not wait for it.
- `docs/addons/intelligence.md` says the section "searches only when you expand it"; that
  sentence changes in the same core PR that bumps the submodule.
- The addon's existing tests that assert "starts collapsed and asks for nothing" and "opening
  the disclosure is what fetches" describe the behaviour this spec replaces and are rewritten
  to the new behaviour; the tests for retries, stale answers, ghosts and the heading weight
  keep their assertions.

### 8. Error behavior

What the viewer sees is item 2. Nothing new is logged: the frontend logs nothing today and
the addon logs a failed `find_similar` as it does now.

### 9. User-visible behavior

- Opening a file detail shows **Similar files** expanded in the Related group, with ghosts and
  then results, without a press.
- The heading reads "Similar files (N)" once the results are in, as today.
- Collapsing it lasts only for that file; the next file opens expanded.
- Texts, card layout, ghost count and column count are unchanged.

### 10. Non-functional

- The request never blocks rendering or input: the section renders its ghosts on the first
  paint, and the rest of the file detail does not wait for the response.
- At most one request is in flight per mounted section, and at most three are sent
  automatically per file (the first and two retries).
- The server cost per file open is one `find_similar`, measured above; the endpoint runs it off
  the event loop (`asyncio.to_thread`) on the read session, so it does not hold the write lock
  or the loop.

## Touch points

- `addons/intelligence/frontend/SimilarFilesSection.tsx` (submodule): fetch on mount and on a
  new `fileId`, start expanded, keep the retry, stale-answer and ghost logic.
- `addons/intelligence/frontend/SimilarFilesSection.test.tsx` (submodule): the two tests on
  the replaced behaviour are rewritten.
- `docs/addons/intelligence.md`: the "searches only when you expand it" sentence.
- The submodule pointer `addons/intelligence` in core.
- Read only, not edited: core's `InspectorShell` (all panels mounted), `RelatedPanel`,
  `RelatedStack`, `MobileInspectorSheet` (drawer mounted only while expanded), the addon proxy
  and `GET /similar/{file_id}`.
- Rules passed through: `.claude/rules/design-decisions.md` (drive-scope context propagation:
  the frontend attaches `X-Lit-Drive`), `.claude/rules/frontend-conventions.md`, `DESIGN.md`
  §The Related group (weights unchanged).
- No protected path is edited.

## Invariants

I1. When the section mounts with a file and drive, it sends exactly one similar-files request for that file with that drive's `X-Lit-Drive`, without any viewer action.
I2. On mount and after every change of `fileId`, the section is expanded and shows its six ghost cards until the answer lands.
I3. Collapsing and expanding the section, or re-rendering it with the same `fileId` and drive (an inspector tab switch, a parent re-render), sends no request and, once loaded, shows the same results.
I4. Collapsing the section while its request is pending does not cancel it, and the answer landing does not expand the section again.
I5. After a change of `fileId` or an unmount, no answer, retry or unavailable state belonging to the previous file is shown, and no further request for the previous file is sent.
I6. A failing request is asked again after 6 s and after 12 s, and only the third failure shows the unavailable text with a retry button; the retry sends a new request.
I7. Neither the section nor the rest of the file detail waits for the response to render: the ghosts and core's own relations are on screen while the request is pending.

## Checked, no action

- **Fetch when the Related tab is shown instead of on open.** Offered to the user, who chose
  file-detail open (2026-10-18). It would need the addon to detect its panel becoming visible
  (core hides panels with `hidden`), and the viewer would see the ghosts on every tab open.
- **Keep it collapsed and show only the count.** Offered; the user chose expanded.
- **Abort the in-flight request on a file change (`AbortController`).** The browser would
  stop waiting, but the addon's `find_similar` runs to the end in its thread either way, so the
  server cost is the same. The stale-answer guard already keeps the old answer off screen.
- **Debounce rapid file changes** (stepping through files with the keyboard). Each request is
  0.03-0.3 s on production and the endpoint runs off the event loop; a debounce would delay
  every normal open to save little.
- **Lower the 6 s / 12 s backoff now that requests are fast.** It still covers the proxy
  timeout on a cold addon start and is not what this change is about.
- **Cache results in the browser across files.** The addon caches them in-process; a second
  open of the same file was measured at 0.00 s.
- **Backend changes.** None needed: the endpoint is already off-loop, on the read session and
  drive-checked.
- **`docs/user-guide/`.** `tags-and-relations.md` and `viewers-and-players.md` say Similar
  files is in the Related group and say nothing about expanding it, so they stay true.
