# Similar files load when the section is shown

SPEC-ID: SPEC-ADDON-024

Approval:

## Summary

The intelligence addon's **Similar files** section, drawn by core's `file-relations` slot
in the file detail's **Related** group, starts its search when it mounts instead of when the
viewer expands it, and starts expanded. Detection was made user-initiated because one request
used to take about 10 s on production and starved the page and the server. Since the vector
tables were partitioned by type (SPEC-ADDON-022/023, deployed 2026-10-17), production
`GET /similar/{id}?limit=6` measures 0.03-0.3 s, 1.0-1.5 s for the first request that reads a
drive's partition from disk, and 0.00 s for a repeated request (the addon's in-process cache),
across documents, videos, images and archives on the drives `main` and `videos`. So the result
can be on screen by the time the viewer looks at the Related tab. This is for the single viewer
of the personal library, who should not have to press anything to see similar files.

The change lives in the `addons/intelligence` submodule's frontend. The backend, the endpoint,
core's slot hosts and the knowledge addon are not changed.

## Required items

### 1. Normal flow

1. The section mounts whenever its host draws it:
   - **Desktop with the inspector pane open**: `InspectorShell` mounts every tab panel and only
     hides the unselected ones, so the Related panel, and the slot in it, mounts with the file
     detail even while another tab is selected.
   - **Desktop with the pane closed** (under 1120 px, or the viewer last closed it on that
     drive): `FileDetailShell` does not render `InspectorPane`, so the section mounts when the
     viewer opens the pane.
   - **Phone**: `MobileInspectorSheet` mounts its drawer only while expanded, so the section
     mounts when the viewer expands the sheet.
   - **The layout without the shell**: `RelatedStack` mounts it in the page flow with the
     detail.
   - **The folder view's right pane and the full-screen detail** (`RightPaneFile`,
     `FileDetailFullScreen`) render `FileDetailContent`, which keys `FileDetailContainer` by
     `fileId`. There each file change, including arrow-key stepping, is an unmount and a new
     mount (the I7 path), not a prop change (the I5 path).
2. On mount the section is expanded and in `loading`, shows its six ghost cards, and sends one
   `getSimilarFiles(fileId, drive, { signal })`, `signal` being the `AbortSignal` of an
   `AbortController` the section owns for that request (`GET /api/addons/intelligence/similar/{fileId}?limit=6`
   with that drive's `X-Lit-Drive`).
3. The response replaces the ghosts with the result cards and the heading becomes
   "Similar files (N)". An empty result shows the existing empty text and "(0)".
4. The viewer may collapse and expand the section. Neither sends a request; loaded results are
   shown again.
5. A new `fileId` or a new `drive` while mounted (the pair is the section's identity) resets
   the section to expanded and `loading` and sends one request for the new pair.
6. Each mount starts from step 2. The section keeps nothing across an unmount: collapsing the
   phone sheet or closing the pane and opening it again on the same file shows the ghosts and
   sends a request again, which the addon's cache answers. In development React's StrictMode
   runs the mount effects, their cleanup and the effects again: the first run's request is
   aborted as for an unmount, the second run sends its own, so `getSimilarFiles` is called
   exactly twice, and the section ends `loaded` with the second run's answer.
7. Result thumbnails load lazily (`loading="lazy"`): while the Related panel is hidden behind
   another inspector tab, the browser requests none of them, and it requests them when the
   panel is shown.

### 2. Failure cases

- **The request fails or times out** (the addon proxy's 15 s timeout, the addon down, a 5xx,
  a 404 for a locked drive): kept as today. The section waits 6 s and asks again, then 12 s and
  asks again, and after the third failure shows the unavailable text with a retry button. The
  retry starts the same sequence. During each backoff the section stays in `loading`: the
  ghosts stay on screen and the heading has no count.
- **A new `fileId` or `drive` while a request or a backoff is pending**: the old file's answer is
  discarded when it arrives, and no further request for the old file is sent, as today. New:
  the old pair's pending HTTP request is aborted (`AbortSignal`), and a pending backoff timer is
  cleared. An abort is not a failure: it starts no backoff and shows nothing.
- **Telling an abort from a failure**: a request counts as aborted when its own signal is
  `aborted` at the moment it settles, whatever it resolved or rejected with. An aborted request
  changes no state. A request whose signal was not aborted is a success or a failure by how it
  settled.
- **Unmount while a request or a backoff is pending** (the sheet collapses, the pane closes,
  the detail closes): new behaviour. The pending HTTP request is aborted, the pending backoff
  timer is cleared, no further request is sent, and nothing that settles later changes state. Today nothing cancels on unmount and
  the loop wakes from its backoff and sends the next retry; with the section mounted and
  unmounted in normal use (the phone sheet, the pane), that would be routine.
- **The source file is not indexed**: the endpoint answers with an empty result, shown as the
  empty text.

### 3. States

`loading -> loaded`, `loading -> (backoff) -> loading`, `loading -> unavailable`,
`unavailable -> loading` (retry button), and `-> loading` from any state on a new `fileId` or
`drive`. The section is in `loading` from its first render.

Not allowed: `idle` shown at all; `loaded -> loading` or `unavailable -> loading` by expanding,
collapsing or re-rendering with the same `fileId` and `drive` (`unavailable` leaves only through
the retry button or a new pair); any transition after an unmount.

Independently, expanded/collapsed: expanded on mount and on each new `fileId` or `drive`, toggled only by
the viewer. Collapsing while `loading` does not cancel the request, and the answer landing does
not expand the section again.

### 4. Data read and written

- Read: the addon's `GET /similar/{file_id}` (search.db through the read session, and the
  addon's in-process similar-files cache, which the request may fill).
- Written: nothing persistent. Component state only; no localStorage, no module-level cache.

### 5. External services

None outside the stack. The one call goes to the intelligence addon through core's addon
proxy; its slow, down and wrong cases are item 2.

### 6. Authorization

Unchanged. The core addon proxy requires `X-Lit-Drive` for the drive-scoped route and checks it
against the viewer's accessible drives; the endpoint checks that the source is in that drive.
The section sends the drive the slot host gave it and no other.

### 7. Effect on existing features

- One similar-files request per mount of the section: per file detail open with the pane open,
  per pane open, per phone sheet expansion, per file change while mounted, and per selection in
  the folder view's right pane and the full-screen detail, arrow-key stepping included, each
  aborting the previous one. The user accepted this (2026-10-18). Before, only an
  expand sent one. Its result thumbnails are requested only once the panel is shown.
- Core's own relations in the Related group render without waiting for it.
- The knowledge addon's "See connections as a graph" link sits after Similar files in the same
  slot (priority 90 against 40). With the section expanded, the link is drawn below the ghosts
  and then the result cards, about three card rows lower in the 384 px rail. The user accepted
  this (2026-10-18).
- In the layout without the shell (`RelatedStack`, used off the canonical file route, such as a
  collection), Similar files sits above Exif, the `file-detail-sections` slot and the comments.
  Starting expanded moves those down by the ghosts' height from the first paint, and up again
  when fewer than six results come back, on each file. The user accepted this (2026-10-18).
- `docs/addons/intelligence.md` says the section "searches only when you expand it"; that
  sentence is changed in the core PR that bumps the submodule.
- `SimilarFilesSection.test.tsx`: almost every test opens the section by clicking the header
  first, which now collapses it, so the file is rewritten to the new behaviour. The tests that
  describe the replaced behaviour ("starts collapsed and asks the backend for nothing",
  "opening the disclosure is what fetches", "goes back to asking nothing when the file changes
  under it") are replaced by their opposites. The stale-answer tests ("drops a slow answer...",
  "drops one that arrives after a backoff, too") keep what they guard, an old file's late
  answer never shown, but hold a separate deferred promise per file, because the new file now
  fetches on its own and a shared promise would make them pass or fail for the wrong reason.
  The retry timing and the heading-weight assertions are unchanged.

### 8. Error behavior

What the viewer sees is item 2. Nothing new is logged: the frontend logs nothing today, and the
addon logs a failed `find_similar` as it does now.

### 9. User-visible behavior

- Wherever the Related group is on screen, **Similar files** is expanded and shows ghosts and
  then results, without a press.
- The heading reads "Similar files (N)" once the results are in, as today.
- A collapse lasts until the file changes or the section unmounts; the next mount is expanded.
- Re-expanding the phone sheet or reopening the pane shows the ghosts briefly again.
- While the intelligence addon is down or refusing connections, every file shows the ghosts in
  the Related group for about 18 s (three fast failures and the 6 s and 12 s backoffs), then the
  unavailable text and the retry button, without a press. While it is hung, each attempt waits
  for the proxy's 15 s timeout, so the ghosts last up to about 63 s. Before, this showed only after expanding. The user
  accepted this (2026-10-18).
- On notes, the knowledge graph link moves below the cards (item 7). Off the canonical route,
  Exif, addon sections and comments sit below the cards (item 7).
- Thumbnails in a hidden Related panel appear when the panel is shown, not before.
- Texts, card layout, ghost count and column count are unchanged.

### 10. Non-functional

- The request never blocks rendering or input. The section draws its ghosts on its own first
  paint; the first time the addon's code chunk loads, core's `AddonSlot` shows nothing for the
  entry until the chunk arrives (`Suspense fallback={null}`), which is unchanged. The rest of
  the file detail does not wait for the response.
- A mounted section holds at most one open similar-files request: a new pair or an unmount
  aborts the previous one, so a slow or hung addon does not hold the browser's per-origin
  HTTP/1.1 connections (about six) while the viewer steps through files, and core's own
  requests do not queue behind them. At most three requests are sent automatically per mount
  and pair (the first and two retries).
- The server cost per mount is one `find_similar`, measured above, plus up to six thumbnail
  requests to core once the panel is shown. The endpoint runs it off the
  event loop (`asyncio.to_thread`) on the read session, so it holds neither the loop nor the
  write lock.

## Touch points

- `addons/intelligence/frontend/SimilarFilesSection.tsx` (submodule): fetch on mount and on a
  new `fileId` or `drive`; start expanded; new: abort the open request on a new pair and on
  unmount, clear the backoff timer, and ignore anything that settles after an abort in a way that survives StrictMode's effect re-run; `loading="lazy"` on
  the result thumbnails; keep the retry, stale-answer and ghost logic.
- `addons/intelligence/frontend/api.ts` (submodule): `getSimilarFiles` takes an optional
  `AbortSignal` and passes it to `fetch`. Its shape becomes
  `getSimilarFiles(fileId, drive, { limit?, signal? } = {})`, `limit` defaulting to
  `SIMILAR_FILES_LIMIT`; the section is its only caller and passes `{ signal }`.
- `addons/intelligence/frontend/SimilarFilesSection.test.tsx` (submodule): rewritten as item 7
  says.
- `docs/addons/intelligence.md`: the "searches only when you expand it" sentence.
- The submodule pointer `addons/intelligence` in core.
- Read only, not edited: core's `RightPaneFile`, `FileDetailFullScreen` and
  `FileDetailContent` (keyed by `fileId`), `FileDetailShell` and `InspectorPane` (pane rendered only while
  open), `InspectorShell` (all panels mounted), `RelatedPanel`, `RelatedStack`,
  `MobileInspectorSheet` (drawer mounted only while expanded), `AddonSlot`, the addon proxy,
  `GET /similar/{file_id}`, and the knowledge addon's `knowledge-connections-link` entry.
- Rules passed through: `.claude/rules/design-decisions.md` (drive-scope context propagation:
  the frontend attaches `X-Lit-Drive`), `.claude/rules/frontend-conventions.md`, and `DESIGN.md`
  §The Related tab (addon entries at the section-label weight; unchanged).
- No protected path is edited.

## Invariants

I1. A mount of the section with a file and drive, with no viewer action, sends one similar-files request for that file with that drive's `X-Lit-Drive` and its own `AbortSignal` before any answer arrives (two under StrictMode's effect re-run, the first aborted).
I2. On mount and after every change of `fileId` or `drive`, the section is expanded and shows its six ghost cards, with no count in the heading, while its requests and both backoffs are pending.
I3. Collapsing and expanding the section, or re-rendering it with the same `fileId` and `drive` (an inspector tab switch, a parent re-render), sends no request and, once loaded, shows the same results; while mounted, a request is sent only on mount, by a retry (I6), by the retry button, or for a new `fileId` or `drive`.
I4. Collapsing the section while its request is pending does not cancel it, and the answer landing does not expand the section again.
I5. After a change of `fileId` or `drive`, the previous pair's open request is aborted, no answer, retry or unavailable state belonging to it is shown, and no further request for it is sent.
I6. A failing request is asked again 6 s and then 12 s after the failures, and only the third failure shows the unavailable text with a retry button; the retry sends a new request.
I7. After the section unmounts, its open request is aborted, no backoff timer is left pending, no further request is sent, and nothing that settles later changes state, including when it unmounts during a backoff; when its effects are run, cleaned up and run again (StrictMode), it still ends `loaded` with the second run's answer.
I8. A request whose signal is aborted when it settles changes no state, whatever it settled with: it starts no backoff, sends no retry and never shows the unavailable text.
I9. Every result thumbnail `<img>` carries `loading="lazy"`.
I10. The section leaves `unavailable` only through the retry button or a new `fileId` or `drive`.

## Checked, no action

- **Fetch when the Related tab is shown instead of on mount.** Offered; the user chose
  file-detail open (2026-10-18). It would need the addon to detect its panel becoming visible
  (core hides panels with `hidden`), and the viewer would see the ghosts on every tab open.
- **Prefetch while the desktop pane is closed.** Offered; the user chose fetching when the pane
  opens (2026-10-18). Prefetching would need a fetch outside the slot entry, which core would
  have to host.
- **Keep loaded results across a remount (a browser cache).** Offered; the user chose fetching
  again (2026-10-18). The addon's in-process cache answers a repeat in 0.00 s on production; a
  browser cache would add an eviction rule and a stale path.
- **Keep it collapsed and show only the count.** Offered; the user chose expanded.
- **Move the knowledge graph link above Similar files.** Offered; the user kept the order.
- **Collapse the section in the layout without the shell.** Offered; the user chose expanded
  there too (2026-10-18). It would need the host to tell the addon which layout it is in.
- **Load result thumbnails eagerly.** Offered; the user chose lazy loading (2026-10-18).
- **Only ignore old answers instead of aborting them.** Offered; the user chose aborting
  (2026-10-18), for the connection limit in item 10. The addon's `find_similar` still runs to
  the end in its thread, so an abort saves the browser, not the server; its result lands in the
  addon cache.
- **Show nothing, or collapse, while the addon is down.** Offered; the user kept the
  unavailable text and retry button (2026-10-18).
- **An invariant that core's relations render while the request is pending.** Every touch point
  is inside the addon and `AddonSlot` wraps the entry in `Suspense fallback={null}`, so no change
  here can hold core's relations back. Item 7 states it as an effect, not an invariant.
- **Testing that a hidden panel requests no thumbnail in jsdom.** jsdom fetches nothing and has
  no layout. That browsers do not fetch a lazy image under `display: none` is checked at R-5 in
  a real browser (Chrome, network log, Related tab not selected and then selected); I9 holds
  only the attribute.
- **Debounce rapid file changes** (stepping through files with the keyboard). A request is
  0.03-0.3 s on production and runs off the event loop; a debounce would delay every normal
  open to save little.
- **Lower the 6 s / 12 s backoff.** It still covers the proxy timeout on a cold addon start and
  is not what this change is about.
- **Backend changes.** None needed: the endpoint is already off-loop, on the read session and
  drive-checked.
- **An invariant for the submodule pointer.** `check-traceability` already requires the core to
  pin the addon commit that cites SPEC-ADDON-024 before the row can be `implemented`.
- **An invariant for the docs sentence.** It is prose, which the code outranks and review does
  not grade; the touch point names it so it is not missed.
- **`docs/user-guide/`.** `tags-and-relations.md` and `viewers-and-players.md` say Similar files
  is in the Related group and say nothing about expanding it, so they stay true.
