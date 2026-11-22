# Remove the drive-home Pickup row and the Pickup page

SPEC-ID: SPEC-ADDON-169
SPEC-ID: SPEC-ADDON-170

Approval: sha256:05808e6afdb6d79a42de2c5e2f5007b4be3a71b25455ebb43b14f1f5f387dbb2 Yuichi Senga 2026-11-22

## Summary

The intelligence addon shows its Pickup feed in two places: a carousel on the drive home
(`drive-home-sections` slot, `PickupWidget`) with a See all link to its own page
(`/drive/<name>/addons/intelligence/pickup`), and **Recommended** in the video app
(`video-discover-recommended` slot), whose See all opens the core's video shelf page.
The feed is videos only (`app/workers/pickup.py` restricts candidates to the drive's live
videos; `app/pickup/profile.py` reads only video history), so both places show the same
videos. This change removes the duplicate for the viewer who uses the video app:

- SPEC-ADDON-169: the drive home no longer shows a Pickup row.
- SPEC-ADDON-170: `/drive/<name>/addons/intelligence/pickup` no longer exists; the URL
  answers as any unknown addon subpage does (not found).

The Pickup feed, its API, the video app's Recommended shelf, its See all page and
**Not interested** on Recommended cards stay as they are.

## Required items

### 1. Normal flow

1. A viewer with a profile and watch history opens a drive's home. The home draws its
   rows; no Pickup row is among them, and nothing occupies the place it held.
2. The viewer opens the video app. Recommended shows the same Pickup videos as before,
   with its See all and its Not interested action.
3. A viewer who opens `/drive/<name>/addons/intelligence/pickup` (a bookmark, history)
   gets the core's not-found response for an unknown addon subpage.

### 2. Failure cases

None new. Removing a slot entry and a page adds no call that can fail. The Pickup API's
failure cases are unchanged and are now only seen through Recommended.

### 3. States

None. No stored state is added, removed or reinterpreted. The home's other rows keep
their own loading, empty and error states.

### 4. Data read and written

- Read: none newly. The home stops calling `GET /api/addons/intelligence/pickup`; the
  video app still calls it.
- Written: none. The Pickup feed tables and the not-interested marks in the intelligence
  DB are untouched and keep being produced by the pickup worker.

### 5. External services

None. Pickup makes no LLM or outside calls.

### 6. Authorization

Unchanged. The remaining Pickup endpoints keep their drive-scope and profile checks.

### 7. Effect on existing features

- `drive-home-sections` in the core stays as a slot; with no entry from any installed
  addon, `AddonSlot` draws nothing (the existing rule that an empty slot leaves no hole).
  Intelligence was its only provider.
- The video app's Recommended uses `pickupShelfProvider` / `pickupPageProvider` and the
  `pickup` item action in `slots.ts`; these stay.
- `fetchPickup`, `readPickupPage`, `markPickupNotInterested`, `unmarkPickupNotInterested`
  in `api.ts` stay because the providers and the item action use them.
- The core test for SPEC-ADDON-158 uses `pickup` as an example of a subpage intelligence
  keeps; it must name a subpage that still exists (`search-compare`).
- Translation keys used only by the removed widget and page are removed: the core's
  `drive.pickup`, and intelligence's `pickup.heading`, `pickup.description`,
  `pickup.empty`, `pickup.loading`, `pickup.retry`. `pickup.notInterested` and
  `pickup.notInterestedToast` stay (used by the Recommended item action).

### 8. Error behavior

Nothing new. The removed page's URL shows the same not-found the core shows for any
subpage an addon does not ship; nothing is logged for it.

### 9. User-visible behavior

- The drive home has no Pickup row, for every viewer and drive, with or without a profile.
- `/drive/<name>/addons/intelligence/pickup` is not found.
- Not interested is available only in the video app: on Recommended cards and on the cards
  of Recommended's See all page.
- `docs/addons/intelligence.md` describes Pickup as the feed behind Recommended, without
  the home row or the Pickup page.

### 10. Non-functional

One fewer request to the Pickup API per home visit. No other limit is affected.

## Touch points

- `addons/intelligence/manifest.json` (remove the `drive-home-sections` entry `pickup`)
- `addons/intelligence/frontend/slots.ts` (remove the `pickup` slot component)
- `addons/intelligence/frontend/PickupWidget.tsx` (delete)
- `addons/intelligence/frontend/PickupWidget.test.tsx` (delete)
- `addons/intelligence/frontend/PickupWidget.notInterested.test.tsx` (delete)
- `addons/intelligence/frontend/pages/pickup.tsx` (delete)
- `addons/intelligence/frontend/pages/pickup.test.tsx` (delete)
- `addons/intelligence/frontend/pages/pickup.notInterested.test.tsx` (delete)
- `addons/intelligence/frontend/messages/en.json`, `addons/intelligence/frontend/messages/ja.json` (remove unused `pickup.*` keys)
- `frontend/src/messages-core/en.json`, `frontend/src/messages-core/ja.json` (remove `drive.pickup`)
- `frontend/src/app/drive/[name]/addons/[addon]/[slug]/__tests__/page.retireFind.test.tsx` (use a kept subpage)
- `frontend/src/components/DriveHome.tsx` (read only: the `drive-home-sections` slot stays)
- `frontend/src/__tests__/section-headings.test.ts` (the heading-icon sweep scans `PickupWidget.tsx`: `EXPECTED_ADDON_ICONS["addons/intelligence"]` becomes 1, `DRIVE_HOME_GLYPHS` becomes 4 whether or not the intelligence frontend is present, and `PickupWidget.tsx` leaves the `DRIVE_HOME` set)
- `docs/addons/intelligence.md` (the Pickup section, and the "**Pickup** on the drive home" line under "UI surface")
- `docs/developer-guide/known-issues.md` (the drive-switch slot entry names "Home's Pickup" as its example; the example is removed, the entry stays)
- `docs/ADDON-DEVELOPMENT.md` (slot inventory row `intelligence | drive-home-sections | pickup`)
- `addons/intelligence` submodule pointer in the core

## Invariants

I1. The drive home draws no Pickup row for any viewer or drive while the intelligence addon is installed.
I2. Opening the drive home sends no request to `/api/addons/intelligence/pickup`.
I3. `/drive/<name>/addons/intelligence/pickup` renders the core's not-found, the same as a subpage the addon does not ship.
I4. The video app's Recommended shelf shows the same Pickup videos, in the same order, as before this change.
I5. Not interested on a Recommended card, and on a card of Recommended's See all page, still removes the video from the viewer's Pickup for that drive, and Undo still puts it back.
I6. Recommended's See all still opens the video shelf page with the day's picks first and then the rest of the feed.
I7. The Pickup feed and the not-interested marks stored in the intelligence DB are neither deleted nor rewritten by this change.
I8. With no `drive-home-sections` entry from any addon, the drive home leaves no empty space where the slot is.
I9. The Not interested menu row and its notice on Recommended cards show the `intelligence.pickup.notInterested` and `intelligence.pickup.notInterestedToast` strings in both Japanese and English, never a raw key.

## Revises

SPEC-ADDON-154 I4. A card leaves only after its write resolves, and a pending card cannot take the action again; a failed write leaves the card and the mark as they were (except the accepted late commits after a proxy timeout) and shows `common.saveFailed` as an `error` toast; a success shows the action's message, with 「元に戻す」 only when an undo exists; 「元に戻す」 restores the card at its former index, and an emptied See all grid or Recommended shelf in its former place, only after `DELETE` or `undo` resolves, only while the same list (on Discover, the same visit) is current, and does nothing after a profile change.
SPEC-ADDON-154 I5. Neither the drive home nor `/drive/<name>/addons/intelligence/pickup` shows Pickup cards; Pickup is shown only through the video app's Recommended shelf and its See all page.

## Checked, no action

- **Pickup API and worker.** Kept: Recommended reads the same feed. Removing the page
  removes a reader, not the feed.
- **A drive where the video app is hidden.** Its viewers lose their only way to see
  Pickup. Accepted: Pickup is videos only, and a viewer who hides the video app is not
  browsing videos.
- **The `CarouselSection` example in `docs/ADDON-DEVELOPMENT.md` titled `t("pickup")`.**
  It illustrates `extraMenuItems` and does not claim a shipped component; left as is.
- **`docs/user-guide/video.md`.** Already describes Recommended as fed by Pickup; nothing
  in it mentions the home row or the page.
- **A redirect from the old page URL to the video app.** Not added: a bookmark to it is
  unlikely for a personal tool, and SPEC-ADDON-158 retired `find` the same way.
- **The core's `drive-home-sections` slot.** Kept as an extension point; it costs nothing
  when empty.
- **SPEC-ADDON-154 test coverage after the two `*.notInterested.test.tsx` files go.** The
  row stays cited by `addons/intelligence/frontend/__tests__/pickupNotInterestedAction.test.ts`,
  `addons/intelligence/tests/test_z_pickup_not_interested.py` and
  `frontend/src/__tests__/undoSaveFailedMessages.test.ts`; the Recommended card behaviour
  they do not cover is I5 and I9 here.
- **`driveHomeSectionOrder.test.tsx` and `homeResumeRows.test.tsx`.** They mock the slot
  with their own heading, so they pass whatever the manifest says; left as they are, and
  not evidence for I1.
