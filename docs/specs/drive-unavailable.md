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
that is locked for this browser, today shows the drive's empty state — 「ファイルがありません」,
「ここにファイルをドロップして追加」 and an Add button — because the listing's 404 is swallowed
by the infinite-scroll hook and read as zero rows. A viewer who mistyped a URL or followed an
old bookmark is invited to upload into a drive that cannot take files.

Under `/drive/<name>`, when the backend answers 404 for the drive, the page shows one state
instead: an icon tile, the heading 「ドライブ「<name>」を開けません」 / "Can't open the drive
“<name>”", a link 「ドライブ一覧へ」 / "All drives" (to `/`) and, under the same condition as
the root picker's unlock entry, a link 「ロックを解除」 / "Unlock" that returns to the page the
viewer opened after a successful unlock. The backend already answers 404 for both an unknown and a locked
drive (`check_drive_access`), so the two cases cannot be told apart and the page does not try.
Chosen by the owner on the design canvas https://claude.ai/artifact/XKXLin7PcqbjnvS1UfYhEw
(row 3, option A; artboard sources copied to
`docs/process/reviews/feature-drive-unavailable/design/`).

For the owner; the app is a personal tool with no other users.

## Required items

### 1. Normal flow

1. The viewer opens any route under `/drive/<name>` (the drive root, a folder, a `?view=`,
   search, a collection, an app, an addon page, a file page).
2. The drive layout asks the backend about the drive with
   `GET /api/drives/<name>/summary` each time the layout mounts and each time the drive name
   in the URL changes. Navigation inside the same drive does not ask again.
3. While it waits, the route renders as today.
4. On a 404, the layout renders the unavailable state in place of everything it draws:
   the folder-tree pane, the content, and the layout's own file pane for `?file=`. The app
   header and the sidebar (drawn outside the layout) stay as they are.
5. On a 2xx, the route keeps rendering as today.
6. 「ロックを解除」 links to `/unlock?redirect=<path>` where `<path>` is the current pathname
   plus its query string, URI-encoded. `/unlock` already returns to a `redirect` that starts
   with `/` and not `//`. Arriving back mounts the drive layout again, so it asks again.

### 2. Failure cases

- The summary request fails with anything other than a 404 (network down, 5xx, a timeout)
  → the route renders as today; the unavailable state is shown only on a 404.
- The summary has not answered yet → the route renders as today; for an unknown or locked
  drive that briefly shows today's empty state (accepted by the owner, so a working drive is
  never delayed). The state replaces it when the 404 arrives.
- An answer that arrives after the drive name has changed is discarded.
- The auth status (`GET /api/auth/status`) fails or has not answered → the Unlock link is not
  shown; 「ドライブ一覧へ」 always is.
- The viewer unlocks the drive in another tab and comes back → the state stays until the
  layout mounts again (a reload, or leaving the drive and coming back); no polling.

### 3. States

`checking` (no answer yet: the route renders), `available` (2xx: the route renders),
`unavailable` (404: the state renders), `unknown` (any other failure: the route renders).
A mount or a new drive name starts at `checking`; `checking` moves to one of the other three
on the answer for the current name. `available`, `unavailable` and `unknown` change only by
a new mount or a new drive name.

### 4. Data read and written

Reads `GET /api/drives/<name>/summary` and `GET /api/auth/status`, both existing and
read-only. Writes nothing.

### 5. External services

None.

### 6. Authorization

Unchanged. The backend decides access (`check_drive_access`); the frontend only reacts to
its 404. The state never says whether the drive exists, is locked, or which group would
unlock it, and lists no drive names other than the one in the URL.

### 7. Effect on existing features

- `frontend/src/app/drive/[name]/layout.tsx` wraps every route under the drive, so the state
  covers all of them, including addon pages and the file page.
- The sidebar and the drive switcher already fetch `/api/drives`; they are not changed. The
  sidebar (`useSidebarData`) and the page-jump list (`useJumpDestinations`) also call
  `getDriveSummary`; they catch any error, and `ApiStatusError` is an `Error` with the same
  message, so they behave as before. The layout's request duplicates the sidebar's; that is
  accepted (one small GET).
- The root drive picker (`/`) and `/unlock` are not changed.
- The listing's own swallowing of errors (`useInfiniteScroll`) is not changed: a 404 on the
  listing of an available drive (a removed folder) keeps today's behaviour.

### 8. Error behavior

As in 2. Nothing new is logged.

### 9. User-visible behavior

On a 404: the area the drive layout draws shows, centred horizontally and set a little above
the vertical centre as drawn, a 48px `rounded-2xl` tile on `bg-elevated` with lucide's
`HardDrive` icon in `text-muted`, the heading 「ドライブ「<name>」を開けません」 (ja) /
"Can't open the drive “<name>”" (en) as the page's only `<h1>`, and under it the link row:
「ドライブ一覧へ」 / "All drives" in the sand button look, and — when the auth status says
`has_protected_drives` and not `is_admin`, the root picker's condition — 「ロックを解除」 /
"Unlock" in the quiet look. A long name wraps anywhere inside the heading and never widens
the page. No Add button, no drop zone, no listing, no tree. Each link has a 44px touch target
on a coarse pointer and the general size on a fine one. Colours are tokens, so the dark theme
follows them.

### 10. Non-functional

One extra small GET per drive name opened in a page load. No new endpoint.

## Design decisions to check

Against `DriveMissingA.dc.html` (390 × 844). The header and the menu button drawn on the
artboard are today's app header, not part of this change.

- D1: the state is centred horizontally in the area the layout draws, a little above the
  vertical centre: tile, heading, then the link row. At wide widths it is the same, centred
  in the content column beside the sidebar.
- D2: the heading names the drive from the URL; there is no second sentence.
- D3: the link row holds 「ドライブ一覧へ」 in the sand look and, when shown, 「ロックを解除」 in
  the quiet look; nothing else.

## Touch points

- `frontend/src/app/drive/[name]/layout.tsx` — the check and the switch to the state, in
  front of all three of its branches.
- `frontend/src/app/drive/[name]/__tests__/layout.test.tsx` — mocks the new requests so its
  existing cases keep testing the branches.
- A new component for the state, under `frontend/src/components/` (drive-specific).
- `frontend/src/lib/api.ts` — `getDriveSummary` throws `ApiStatusError` (via
  `fetchJSONStatus`) so a 404 is told apart; `getAuthStatus` is read.
- `frontend/src/components/sidebar/useSidebarData.ts`,
  `frontend/src/components/search/useJumpDestinations.ts` — callers of `getDriveSummary`,
  unchanged.
- A new e2e-components arrangement in `frontend/e2e-components/fixtures/app.tsx` drawing the
  state (short and 80-character names) and a spec measuring D1, I7 and the long-name wrap at
  390 × 844 (coarse) and 1280 × 800, with their registrations in
  `frontend/src/components/__tests__/componentFixtureParity.test.tsx` and
  `frontend/e2e-components/spec-viewport.spec.ts`.
- `frontend/src/messages-core/en.json`, `ja.json` — the heading and the two link labels.
- `backend/app/routers/drives.py` (`/summary`), `backend/app/auth.py` (`check_drive_access`) —
  read, unchanged.
- `.claude/rules/design-decisions.md` §Access control (404 for locked, may link to `/unlock`,
  no locked names) — passed through.
- `DESIGN.md` — one line on the unavailable drive state.
- `docs/user-guide/` — none: see Checked, no action.
- No protected path is edited.

## Invariants

I1. Once the summary has answered 404 for a name that is not a configured drive, the page
shows the heading naming `<name>` and a link to `/`, and no Add button, drop zone, file
listing, folder tree or file pane.
I2. Once the summary has answered 404 for a protected drive that is locked in this browser,
the page is the same as I1, element for element apart from the name.
I3. For an available drive, every route under `/drive/<name>` renders as before this change.
I4. When the summary request fails with a status other than 404, or without a response, the
route renders as before this change.
I5. The state shows no drive name other than the URL's, no group name and no count.
I6. The state replaces the content of every route under `/drive/<name>`, including a file
page (`?file=`), a collection, an app and an addon page.
I7. On a coarse pointer, each link drawn has a touch target of at least 44px.
I8. The Unlock link is drawn exactly when the auth status reports `has_protected_drives` true
and `is_admin` false; its `href` is `/unlock?redirect=` followed by the URI-encoded current
path and query, and after a successful unlock the browser is on that path and query.
I9. An answer for a drive name that is no longer the URL's changes nothing on the page.
I10. A heading with an 80-character name with no spaces stays inside the content area at
390px wide; the page does not scroll sideways.

## Checked, no action

- **Next.js `notFound()`.** Not used: the drive pages are client components and the answer
  comes from a client request, and the app header and sidebar should stay so the viewer can
  go elsewhere.
- **Telling a locked drive from an unknown one.** Not possible and not wanted: the backend
  answers both with the same 404 on purpose.
- **Using the `/api/drives` list.** Not used: an empty list after a network failure would
  read as "unavailable"; the drive's own 404 does not.
- **The user guide.** No page: a viewer who reaches this state can read it; nothing about it
  needs to be known in advance.
- **Re-checking after an unlock in another tab.** Not done; a new mount of the layout
  re-checks.
- **Hiding the brief empty state while checking.** Not done: the owner chose not to delay a
  working drive by a round trip.
- **Drive-scoped sections of the sidebar on an unavailable drive.** Left as they are; the
  sidebar is outside this change.
