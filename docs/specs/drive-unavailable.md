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
“<name>”", and two links, 「ドライブ一覧へ」 / "All drives" (to `/`) and 「ロックを解除」 /
"Unlock" (to `/unlock`). The backend already answers 404 for both an unknown and a locked
drive (`check_drive_access`), so the two cases cannot be told apart and the page does not try.
Chosen by the owner on the design canvas https://claude.ai/artifact/XKXLin7PcqbjnvS1UfYhEw
(row 3, option A; artboard sources copied to
`docs/process/reviews/feature-drive-unavailable/design/`).

For the owner; the app is a personal tool with no other users.

## Required items

### 1. Normal flow

1. The viewer opens any route under `/drive/<name>` (the drive root, a folder, a `?view=`,
   search, a collection, an app, an addon page, a file page).
2. The drive layout asks the backend about the drive once per drive name, with
   `GET /api/drives/<name>/summary`.
3. On a 404, the layout renders the unavailable state in place of the route's content. The
   app header and the sidebar stay as they are.
4. On a 2xx, the route renders as today.

### 2. Failure cases

- The summary request fails with anything other than a 404 (network down, 5xx, a timeout)
  → the route renders as today; the unavailable state is shown only on a 404.
- The summary has not answered yet → the route renders as today. The state replaces the
  content when the 404 arrives.
- The viewer unlocks the drive in another tab and comes back → the state stays until the
  page is reloaded or the viewer navigates; no polling.

### 3. States

`checking` (no answer yet: the route renders), `available` (2xx: the route renders),
`unavailable` (404: the state renders), `unknown` (any other failure: the route renders).
A new drive name starts at `checking`. No other transition.

### 4. Data read and written

Reads `GET /api/drives/<name>/summary`, which exists and is read-only. Writes nothing.

### 5. External services

None.

### 6. Authorization

Unchanged. The backend decides access (`check_drive_access`); the frontend only reacts to
its 404. The state never says whether the drive exists, is locked, or which group would
unlock it, and lists no drive names other than the one in the URL.

### 7. Effect on existing features

- `frontend/src/app/drive/[name]/layout.tsx` wraps every route under the drive, so the state
  covers all of them, including addon pages and the file page.
- The sidebar and the drive switcher already fetch `/api/drives`; they are not changed.
- The root drive picker (`/`) and `/unlock` are not changed.
- The listing's own swallowing of errors (`useInfiniteScroll`) is not changed: a 404 on the
  listing of an available drive (a removed folder) keeps today's behaviour.

### 8. Error behavior

As in 2. Nothing new is logged.

### 9. User-visible behavior

On a 404: the drive's content area shows, centred, a 48px rounded tile with an inbox icon,
the heading 「ドライブ「<name>」を開けません」 (ja) / "Can't open the drive “<name>”" (en) as
the page's `<h1>`, and under it two links side by side: 「ドライブ一覧へ」 / "All drives" in the
sand button look, and 「ロックを解除」 / "Unlock" in the quiet look. No Add button, no drop zone,
no listing. Each link has a 44px touch target on a coarse pointer.

### 10. Non-functional

One extra small GET per drive name opened in a page load. No new endpoint.

## Design decisions to check

Against `DriveMissingA.dc.html` (390 × 844). The header and the menu button drawn on the
artboard are today's app header, not part of this change.

- D1: the state is centred in the content area: tile, heading, then the link row.
- D2: the heading names the drive from the URL; there is no second sentence.
- D3: two links, the first in the sand look and the second quiet; nothing else.

## Touch points

- `frontend/src/app/drive/[name]/layout.tsx` — the check and the switch to the state.
- A new component for the state, under `frontend/src/components/` (drive-specific).
- `frontend/src/lib/api.ts` — `getDriveSummary` reports the HTTP status of a failure
  (`fetchJSONStatus` / `ApiStatusError`), so a 404 is told apart from other failures.
- `frontend/src/messages-core/en.json`, `ja.json` — the heading and the two link labels.
- `backend/app/routers/drives.py` (`/summary`), `backend/app/auth.py` (`check_drive_access`) —
  read, unchanged.
- `.claude/rules/design-decisions.md` §Access control (404 for locked, may link to `/unlock`,
  no locked names) — passed through.
- `DESIGN.md` — one line on the unavailable drive state.
- `docs/user-guide/` — none: see Checked, no action.
- No protected path is edited.

## Invariants

I1. Opening `/drive/<name>` for a name that is not a configured drive shows the heading
naming `<name>`, a link to `/` and a link to `/unlock`, and no Add button, drop zone or file
listing.
I2. For a protected drive that is locked in this browser, the page is the same as I1, element
for element apart from the name.
I3. For an available drive, every route under `/drive/<name>` renders as before this change.
I4. When the summary request fails with a status other than 404, or without a response, the
route renders as before this change.
I5. The state shows no drive name other than the URL's, no group name and no count.
I6. The state replaces the content of every route under `/drive/<name>`, including a file
page (`?file=`), a collection, an app and an addon page.
I7. On a coarse pointer, both links have a touch target of at least 44px.

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
- **Re-checking after an unlock in another tab.** Not done; a reload or navigation re-checks.
