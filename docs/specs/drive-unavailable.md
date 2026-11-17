# A drive that cannot be opened says so instead of showing an empty folder

SPEC-ID: SPEC-CORE-125

Approval:

<!--
Leave the Approval line empty. After a human approves this spec, the approval step
writes `Approval: <commit sha> <name> <date>` here (the name may contain spaces) and
moves the ledger row in docs/specs/INDEX.md to approved. A spec that defines several behaviors gives each its own
SPEC-ID and its own ledger row.
-->

## Summary

Opening `/drive/<name>` for a name that is not a configured drive, or for a protected drive
that is locked for this browser, today shows the drive's empty state — 「ファイルがありません」
(`folder.noFilesTitle`), 「ファイルをここにドロップすると追加できます。」 (`noFilesDescription`)
and the `+ Add` button — because the listing's 404 is swallowed by the infinite-scroll hook
and read as zero rows. A viewer who mistyped a URL or followed an old bookmark is invited to
upload into a drive that cannot take files.

Under `/drive/<name>`, when the backend answers 404 for the drive, the page shows one state
instead: an icon tile, the heading 「ドライブ「<name>」を開けません」 / "Can't open the drive
“<name>”", a link 「ドライブ一覧へ」 / "All drives" (to `/`) and, under the root picker's
condition, a link 「ロックを解除」 / "Unlock" that brings the viewer back to the page they
opened after a successful unlock. The backend already answers 404 for both an unknown and a
locked drive (`check_drive_access`), so the two cases cannot be told apart and the page does
not try. Chosen by the owner on the design canvas
https://claude.ai/artifact/XKXLin7PcqbjnvS1UfYhEw (row 3, option A; artboard sources and
`canvas.json` in `docs/process/reviews/feature-drive-unavailable/design/`).

For the owner; the app is a personal tool with no other users.

## Required items

### 1. Normal flow

1. The viewer opens any route under `/drive/<name>` (the drive root, a folder, a `?view=`,
   search, a collection, an app, an addon page, a file page).
2. The drive layout requests `GET /api/drives/<name>/summary` when it mounts and when the
   drive name in the URL changes; navigation inside the same drive does not request it again.
3. While it waits, the route renders as today.
4. On a 404, the layout requests `GET /api/auth/status` once, and renders the unavailable
   state in place of everything it draws on every branch: the folder-tree pane, the content,
   and its own file pane for `?file=`. The app header and the sidebar, drawn outside the
   layout, stay as they are.
5. On a 2xx, the route keeps rendering as today.
6. When the auth status answers `has_protected_drives: true` and `is_admin: false` (the root
   picker's condition), the 「ロックを解除」 link is added to the link row. Its `href` is
   `/unlock?redirect=` + `encodeURIComponent(pathname + search)`. `/unlock` returns to a
   `redirect` that starts with `/` and not `//`; arriving back mounts the drive layout again,
   so it asks again.

### 2. Failure cases

- The summary fails with anything other than a 404 (network down, 5xx, an aborted request) →
  the route renders as today; the unavailable state is shown only on a 404.
- The summary has not answered yet → the route renders as today; for an unknown or locked
  drive that briefly shows today's empty state (accepted by the owner, so a working drive is
  never delayed). The state replaces it when the 404 arrives.
- An answer (summary or auth) for a drive name that is no longer the URL's is discarded.
- The auth status fails or has not answered → no Unlock link; 「ドライブ一覧へ」 is always drawn.
- A drive that stops being reachable while the viewer stays on it (locked in another tab, an
  expired token) → today's empty state, until the layout mounts again (accepted by the owner).

### 3. States

Summary: `checking` → `available` (2xx) | `unavailable` (404) | `unknown` (other failure), on
the answer for the current name. A mount or a new drive name starts at `checking`; nothing
else changes the state.

Unlock link, only while `unavailable`: `pending` (auth not answered: no link) → `shown`
(condition true) | `hidden` (condition false or auth failed). The link may appear after the
state is drawn; once shown or hidden it does not change until the summary state does.

### 4. Data read and written

Reads `GET /api/drives/<name>/summary` and, after a 404, `GET /api/auth/status`; both exist
and are read-only. Writes nothing.

### 5. External services

None.

### 6. Authorization

Unchanged. The backend decides access (`check_drive_access`); the frontend only reacts to its
404. The state never says whether the drive exists, is locked, or which group would unlock
it, and lists no drive names other than the one in the URL.

### 7. Effect on existing features

- `frontend/src/app/drive/[name]/layout.tsx` wraps every route under the drive, so the state
  covers all of them, including addon pages and the file page.
- `getDriveSummary` throws `ApiStatusError` (an `Error` carrying the status, with the same
  message as today). Its other callers, the sidebar (`useSidebarData`: trash and missing
  counts) and the page-jump list (`useJumpDestinations`: missing count), catch any error and
  behave as before. The layout's request duplicates the sidebar's; that is accepted.
- The root drive picker (`/`) and `/unlock` are not changed.
- The listing's own swallowing of errors (`useInfiniteScroll`) is not changed.
- The app header's tree toggle and search, and the sidebar's drive sections, stay on the
  unavailable state (accepted by the owner).

### 8. Error behavior

As in 2. Nothing new is logged.

### 9. User-visible behavior

On a 404, the area below the app header and beside the sidebar (the box the layout's
`h-below-header` branches fill; the same box on the branches that return bare children) shows
one group, centred horizontally and placed in a flex column with `justify-content: center`
and a 120px bottom padding, so it sits a little above the centre:

- a 48px `rounded-2xl` tile on `bg-elevated` with lucide's `HardDrive` icon (24px,
  `text-muted`);
- 16px below, the heading 「ドライブ「<name>」を開けません」 (ja) / "Can't open the drive
  “<name>”" (en) as the page's only `<h1>`, 18px bold, centred, wrapping anywhere for a long
  name;
- 16px below, the link row (gap 8px, wraps): 「ドライブ一覧へ」 / "All drives" as a Secondary
  (Sand) button-look link, and, when shown, 「ロックを解除」 / "Unlock" as a Ghost button-look
  link (DESIGN.md §Buttons). Each has a 44px touch target on a coarse pointer and the general
  size on a fine one.

No `+ Add` button, no upload drop zone, no file listing, no folder tree, no file pane.
Colours are tokens, so the dark theme follows them.

### 10. Non-functional

One summary GET per layout mount and per drive name; one auth GET only after a 404. No new
endpoint.

## Design decisions to check

Against `DriveMissingA.dc.html` (390 × 844). The app header drawn there is a simplified stand-in.

- D1: tile, heading, link row stacked and centred, the group a little above the vertical
  centre (120px bottom padding), 16px between the three parts.
- D2: the heading names the drive from the URL; there is no second sentence.
- D3: 「ドライブ一覧へ」 in the Sand look and, when shown, 「ロックを解除」 in the Ghost look;
  nothing else in the row.

## Touch points

- `frontend/src/app/drive/[name]/layout.tsx` — the request, the states, and the switch in
  front of all three branches.
- `frontend/src/app/drive/[name]/__tests__/layout.test.tsx` — mocks the summary as resolved so
  its existing cases keep testing the branches on the `available` path.
- A new component for the state under `frontend/src/components/` (drive-specific).
- `frontend/src/lib/api.ts` — `getDriveSummary` via `fetchJSONStatus` (`ApiStatusError`);
  `getAuthStatus` read.
- `frontend/src/components/sidebar/useSidebarData.ts`,
  `frontend/src/components/search/useJumpDestinations.ts` — callers, unchanged.
- `frontend/src/messages-core/en.json`, `ja.json` — the heading and the two link labels.
- e2e-components: an arrangement in `frontend/e2e-components/fixtures/app.tsx` that draws the
  state in a below-header-sized box (short and 80-character names, Unlock shown and hidden);
  `frontend/e2e-components/drive-unavailable.spec.ts` (phone project, Pixel 5, 393px, coarse)
  and `drive-unavailable-desktop.spec.ts` (1280 × 800); registered in
  `frontend/src/components/__tests__/componentFixtureParity.test.tsx`,
  `frontend/e2e-components/spec-viewport.spec.ts` and `frontend/e2e-components/projects.ts`
  (`DESKTOP_ONLY`).
- `backend/app/routers/drives.py` (`/summary`), `backend/app/auth.py` (`check_drive_access`) —
  read, unchanged.
- `.claude/rules/design-decisions.md` §Access control (404 for locked, may link to `/unlock`,
  no locked names) — passed through.
- `DESIGN.md` — one line on the unavailable drive state.
- No protected path is edited.

## Invariants

I1. Once the summary has answered 404, the page shows the heading naming the URL's drive and a
link to `/`, and no `+ Add` button, no upload drop zone (`UploadZone`), no file listing, no
folder tree and no file pane, on every route under `/drive/<name>` (root, folder, `?view=`,
`?file=` on a folder and on a cross-folder view, search, collection, app, addon).
I2. For an available drive, the route's content is drawn before the summary answers, and is
the same after a 2xx as before this change.
I3. When the summary fails with a status other than 404, or without a response, the route
renders as before this change.
I4. The state shows no drive name other than the URL's, no group name and no count.
I5. The Unlock link is drawn exactly when the auth status reports `has_protected_drives` true
and `is_admin` false; its `href` is `/unlock?redirect=` + `encodeURIComponent(pathname +
search)`, and after a successful unlock the browser is on that path and query.
I6. An answer (summary or auth) for a drive name that is no longer the URL's changes nothing on
the page.
I7. The summary is requested once per layout mount and once per change of drive name, not on
navigation inside the same drive.
I8. When `getDriveSummary` rejects, the sidebar's trash and missing counts and the page-jump
list's missing entry are what they were before this change for the same rejection.
I9. On a coarse pointer each link drawn has a touch target of at least 44px; an 80-character
drive name with no spaces stays inside the content box at 393px wide and the page does not
scroll sideways.

## Checked, no action

- **Next.js `notFound()`.** Not used: the drive pages are client components and the answer
  comes from a client request; the app header and sidebar should stay so the viewer can go
  elsewhere.
- **Telling a locked drive from an unknown one.** Not possible and not wanted: the backend
  answers both with the same 404 on purpose. A locked drive is therefore covered by I1; no
  frontend test can tell the two apart.
- **Using the `/api/drives` list.** Not used: an empty list after a network failure would read
  as "unavailable"; the drive's own 404 does not.
- **The user guide.** No page: a viewer who reaches this state can read it.
- **Re-checking during the visit.** Not done (owner): a drive that becomes unreachable mid-visit
  shows today's empty state until the layout mounts again.
- **Hiding the brief empty state while checking.** Not done (owner): a working drive is never
  delayed.
- **Header controls and sidebar sections on the state.** Left as they are (owner).
- **Where layout is measured.** I9 and D1 are measured in e2e-components (phone and desktop
  specs above); jsdom has no layout. The in-shell position beside a real sidebar is checked at
  R-5.
