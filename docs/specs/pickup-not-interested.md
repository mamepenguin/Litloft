# Pickup: "not interested"

SPEC-ID: SPEC-ADDON-154
SPEC-ID: SPEC-CORE-150

Approval: sha256:6a49d17c10729d5ba6fb104c92677e932c6049b6fa2900645273998567da55c2 Yuichi Senga 2026-11-19

## Summary

A viewer can tell Pickup that a recommended video is not for them. 「興味なし」 ("Not interested")
in the card's right-click / long-press menu puts a **not-interested mark** on the video for that
viewer and drive, which removes it from their Pickup feed at once and for good, with 「元に戻す」
("Undo") in the toast that follows. It is offered wherever Pickup is shown: the drive home's
Pickup row, the Pickup page, and the video app's Recommended shelf and its See all page. Similar
videos are not demoted.

The mark is new and unrelated to Continue's "set aside" (`watch_history.dismissed_at`), which this
change does not touch.

- **SPEC-ADDON-154**: the intelligence addon stores the marks, keeps marked files out of the feed,
  offers the control on its own surfaces, and supplies it to the video app through SPEC-CORE-150's
  card actions.
- **SPEC-CORE-150**: two generic extension points in the core. An addon can add rows at the top
  of the shared file menu of the cards it draws with `CarouselSection` / `FileGrid`; and a
  `video-discover-recommended` provider can attach item actions to its cards, which the video
  app's `VideoCard` shows in a right-click / long-press menu.

Agreed design: https://claude.ai/artifact/TbS98HmyLJsavFLeqBbvg3, saved in
`docs/process/reviews/feature-pickup-not-interested/design/` (`Main.dc.html`: the drive home's
Pickup row with the file menu open and the toast; `VideoApp.dc.html`: the video app's Recommended
with the card menu open and the toast). The artboards abbreviate the rows below the divider; D1
governs them. Its visible decisions:

- D1. Menus are the existing shared `ContextMenu` (176px wide, 14px icons, its row height),
  unchanged. In the file menu the addon's rows come first, then a 1px divider, then exactly the
  rows the menu shows today. 「興味なし」 has a circle-slash icon.
- D2. The video app card menu is the same `ContextMenu` with 「新しいタブで開く」 followed by the
  provider's actions, and nothing else.
- D3. After the action the card leaves at once, and the existing toast (bottom right, `success`
  kind, its close button, 5 s) reads 「おすすめから外しました」 with an 「元に戻す」 action.
- D4. The menu closes on selection, as today. While the write is pending the card is unchanged,
  and a menu reopened on it shows the action's row disabled (greyed, the menu keeps its rows).

## Required items

### 1. Normal flow

**SPEC-ADDON-154 (intelligence addon)**

1. A new table `pickup_not_interested` in the addon's database: `drive_id`, `viewer_id`,
   `file_id`, `marked_at`, primary key `(drive_id, viewer_id, file_id)`. The migration only adds
   it.
2. `manifest.json` gains the route `/pickup/not-interested/{file_id}`, methods `PUT` and
   `DELETE`, with the same gate as `/pickup` (`pre_check` `addon_feature` `index`, drive scope),
   so a drive whose `index` policy is off answers 404 through the proxy; with no feed there the
   control is never shown.
3. `PUT /api/addons/intelligence/pickup/not-interested/{file_id}` stores the mark for the
   request's viewer (`X-Lit-Viewer-Id`) and drive (`X-Lit-Drive`), keeping the first `marked_at`
   on a repeat, and answers 204. `DELETE` removes it and answers 204 whether or not it existed.
   Without a viewer both answer 400 `viewer_required` and write nothing. A `file_id` that does not
   match `^[A-Za-z0-9_-]{12}$` (the core's id alphabet) is 422.
4. The viewer's marked files of the drive are excluded by the worker and the feed read together
   with the watched videos of SPEC-ADDON-149: the sweep never ranks them, and the feed read
   removes them before paging (pages stay full, `total` is the filtered length).
   `watched_file_ids` keeps returning watched videos only. The staleness signature also carries
   the viewer's marked ids, so adding or removing a mark rebuilds that viewer on the next sweep.
   `PROFILE_VERSION` stays 5.
5. A mark changes no watched state, engagement or seed.
6. If the sweep cannot read a viewer's marks, it writes nothing for that viewer (no feed, no
   checkpoint), goes on with the other viewers, and retries that viewer on the next sweep.
7. The startup purge (`purge_disabled_drives`) visits every drive that has indexed files or
   marks, and `purge_drive` deletes a policy-off drive's marks also when it has no indexed files.
   A failure to delete them is logged and the rest of the purge goes on; because the drive still
   has marks, the next startup visits it again and retries. It leaves the feed rows as it does
   today. Marks of files later purged from the core are not cleaned up; they are never candidates.
8. In `evaluate`'s `replay`, `after`, the grid rows and the marked `fresh_…` row also exclude the
   viewer's marks with `marked_at < t`; `before`, `depth`, `video`, `random`, `newest`, the
   candidate count and the targets are unchanged. If the marks cannot be read, the command fails
   with an error and writes nothing.
9. **Home row** (`PickupWidget`, through `CarouselSection`) and **Pickup page** (through
   `FileGrid`), with a profile: each card's file menu shows 「興味なし」 first, then a divider, then
   today's rows (D1). The addon owns the action, its pending state and its toasts on these
   surfaces, using the core's `common.undo` and `common.saveFailed` strings and its own
   「興味なし」 and 「おすすめから外しました」. Choosing it sends `PUT`; while it is pending the row is
   disabled (D4). On 2xx:
   - the card leaves the list, and the toast of D3 appears;
   - the home row's "See all" count drops by one; when its last card leaves, the row disappears
     (as an empty row does today);
   - the Pickup page keeps its paging position consistent with the filtered feed: the next
     request's `offset` is the number of feed ids received so far, minus those marked on this page,
     plus those restored, and its local `total` drops by one on a mark and rises by one on an
     undo. The page drops any id it already shows from a later response. When its last loaded
     card leaves and `offset < total`, it loads the next page; otherwise it shows its empty
     text.

   「元に戻す」 sends `DELETE`; on 2xx the card returns at its former index (the index it had when
   it left, clamped to the current length; each undone card uses its own index), the counts and
   the offset follow, and an emptied row or grid is drawn again. If the surface's list was
   replaced since (a drive change, a reload), 「元に戻す」 only sends `DELETE`; if the profile changed
   since, 「元に戻す」 does nothing (the toast belongs to the viewer who marked). A write that settles
   after the list was replaced still shows its toast (the toast is app-wide).
   On a failure the card stays and the `error` toast `common.saveFailed` appears.
10. **Video app**: the `pickup` entry of `video-discover-recommended` supplies one item action,
    「興味なし」, whose `run` sends `PUT` and resolves with the message 「おすすめから外しました」 and an
    `undo` that sends `DELETE`; both reject on a failure. Labels come from the addon's messages
    through the translator the core passes (SPEC-CORE-150 rule 2).
11. Without a profile none of these controls is shown.

**SPEC-CORE-150 (core extension points)**

1. `useFileMenuItems` takes an optional leading group of rows (`id`, `label`, `icon`,
   `onSelect`, `disabled?`); `FileContextMenu`, `CarouselSection` and `FileGrid` (both its grid
   layouts) pass through an optional `extraMenuItems(file)`. `ContextMenu` gains an optional
   divider item, drawn as a 1px line with its own key, used only when a caller passes one. Rows:
   the extra group, one divider, then today's rows. The core only invokes `onSelect`; it does not
   await it, catch it or show a toast for it. Callers that pass nothing, including `FileActions`,
   `ContinueWatchingSection`, `FileList`, `FolderTreePane`, `InboxView` and every other
   `ContextMenu` user, render and behave exactly as today.
2. A slot module may export `slotItemActions: Record<string, ShelfItemActions>` next to
   `slotProviders` / `slotPageProviders`, keyed by the entry id.
   `ShelfItemActions = (args: { drive; locale; t }) => ShelfItemAction[]`, where `t` is the core's
   translator over the merged messages (addon keys included). An action is
   `{ id: string, label: string, icon?: icon component, run(fileId) => Promise<{ message: string;
   undo?: () => Promise<void> }> }`. The core reads item actions only for
   `video-discover-recommended` entries. If the function is missing or throws, or returns
   anything but an array, the card has no actions; within an array each element that lacks a
   string `id` and `label` or a function `run` is dropped on its own, as is a repeated `id`. A
   missing icon leaves an empty 14px slot. The core interprets no id or label.
3. On Discover's Recommended shelf and on the Recommended See all page, when the shelf's entry
   has at least one action and a profile is set, a right-click or a long press (the existing
   `useContextMenu`: 500 ms) on a `VideoCard` opens `ContextMenu` with 「新しいタブで開く」 and the
   actions, exactly 1 + N rows (D2), instead of the browser's menu; neither the press nor the
   click that follows a long press navigates, and the iOS link callout does not appear. The click
   suppression and the callout fix live in `VideoCard`; `useContextMenu` is not changed.
   「新しいタブで開く」 opens the card's own link (`fileLinkHref(item)`) in a new tab. A click
   or a short tap opens the card as today.
4. Choosing an action calls `run`; while it is pending the row is disabled (D4). When `run`
   resolves with a string `message`, the card leaves the shelf or page at once and the `success`
   toast shows `message` with 「元に戻す」 (`common.undo`) when `undo` is a function. A resolution
   of another shape is treated as a rejection. On Discover, the removed id also leaves the stored
   Recommended ids under the visit's key, and the id joins a removal set for that key, kept for the
   rest of the JS session: any provider answer stored later under that key (also after the visit
   ended or `VideoApp` unmounted) is stored without it. So the next visit's rebuild does not draw
   it. A write that settles after the visit's key changed still updates the old key. The See all
   page does not touch the stored ids; when its last card leaves it shows its empty state as
   today, and an undo there draws the grid again.
5. 「元に戻す」 calls `undo`; when it resolves, the card returns at its former index (as in
   SPEC-ADDON-154 rule 9) and, on Discover, the id leaves the removal set and returns to the stored
   ids under that key at the index it had there at removal time, clamped to the stored list's
   current length. When the last Recommended card leaves, the shelf is not drawn (SPEC-CORE-057
   I8), and 「元に戻す」 draws it again at its former position, also above shelves drawn since
   (revises SPEC-CORE-076 I2). "The same list" on Discover is the visit (it survives switching to
   the Library tab); if the visit's key changed since, 「元に戻す」 only calls `undo` and updates the
   old key's stored ids and removal set. If the profile changed since, it does nothing.
6. When `run` or `undo` rejects, the card is left as it was and the `error` toast shows
   `common.saveFailed`.
7. Other shelves (`video-discover-shelves` entries and their See all pages, New, Continue,
   Library) never read item actions and are unchanged.

### 2. Failure cases

| Step | What goes wrong | What the system does and the viewer or operator sees |
|---|---|---|
| `PUT` | Network failure, non-2xx, or 400 without a viewer | The card stays; the `error` toast 「変更を保存できませんでした」. |
| `PUT` | The proxy times out while the addon waits on its write lock (indexing or refine running), and the write commits later | The viewer sees the failure toast and the card stays; the next read of the surface drops it. Accepted. |
| `DELETE` (undo) | Network failure or non-2xx | The card stays removed; the failure toast; the mark stays. |
| `DELETE` (undo) | The proxy times out and the delete commits later | The card stays removed; the failure toast; the next read of the surface shows the file again. Accepted. |
| Undo after the list was replaced or the surface left | The toast is app-wide and outlives the list | 「元に戻す」 only sends `DELETE` / calls `undo` (Discover also restores the id under the old key); the file returns on the next read. After a profile change it does nothing. |
| A write settles after the list was replaced | The viewer is elsewhere | Its toast still appears; a failure shows the `error` toast. |
| Item actions | `slotItemActions` is missing, throws or returns no array | The card has no actions: no app menu, the browser's own. |
| Item actions | `run` resolves with another shape | Treated as a rejection. |
| Sweep | Reading marks fails | Nothing is written for that viewer; the others go on; retried next sweep. |
| Feed read | Reading marks fails | The request fails as SPEC-ADDON-149's failure row says. |
| `purge_drive` | Deleting marks fails | Logged; the purge goes on. |
| `evaluate` | Reading marks fails | The command exits with an error and writes nothing. |

### 3. States

Per viewer, drive and file: `not marked` → (`PUT` 2xx) `marked` → (`DELETE` 2xx) `not marked`.
Not allowed: playing, liking, watching, setting aside from Continue or the scanner changing it.
`purge_drive` removes all of a drive's marks.

A card on a surface: `shown` → (choose the action) `pending` → (resolve) `removed`, or (failure)
`shown`; `pending` → (list replaced) the write still settles and its toast appears; `removed` →
(「元に戻す」 resolves, same list) `shown` at its former index, (「元に戻す」 fails) `removed`, or (toast
closes or expires) `removed` for good. Not allowed: a `pending` card taking the action again; a removed
card reappearing on that surface's list, or on Discover's next visit when it was removed on
Discover, while the mark stands.

### 4. Data read and written

- Addon DB: `pickup_not_interested` (new; written by the two endpoints and `purge_drive`, read by
  the sweep, the feed read and `evaluate`).
- Core DB: not written. No core backend change.
- Browser: Discover's in-memory stored Recommended ids (existing) lose and regain ids.

### 5. External services

None: the only new calls are from the browser through the core's addon proxy to the addon, all
inside the deployment.

### 6. Authorization

The new route sits behind the core's addon proxy with drive scope and the `index` feature gate,
like `/pickup`; the addon reads the viewer from `X-Lit-Viewer-Id`, which the proxy sets from the
host. A viewer's marks affect only that viewer's feed in that drive. Per
`.claude/rules/internal-api-policy.md` R4 this is addon-written, addon-read data, so it stays in
the addon DB and adds no Internal API.

### 7. Effect on existing features

- Pickup's feed (SPEC-ADDON-149) excludes marked files as well as watched ones.
- `ContextMenu` gains an optional divider item; `FileContextMenu`, `useFileMenuItems`,
  `CarouselSection`, `FileGrid` gain optional props; existing callers are unchanged.
- `VideoCard` gains an optional menu, used only on Recommended cards whose entry has actions.
- Discover: removing the last Recommended card reduces the drawn positions within a visit, and a
  removal outranks a later provider answer in the stored ids (revises SPEC-CORE-076 I1 and I7).
- The slot contract gains `slotItemActions` (an addition); `docs/ADDON-DEVELOPMENT.md` documents
  it in the PR that adds it.
- Docs: `docs/addons/intelligence.md` (Pickup: "not interested", undo, the two endpoints);
  `docs/user-guide/video.md` (how to mark a pick as not interested; undo is in the toast);
  `docs/user-guide/keyboard-shortcuts.md` (right-click / long press on Recommended cards).

### 8. Error behavior

The `error` toast above; the sweep, purge and evaluate cases log as the addon logs today.

### 9. User-visible behavior

- 「興味なし」 in the four places (D1, D2), with a profile only; disabled while pending (D4).
- The card leaves at once; the toast 「おすすめから外しました」 / "Removed from your picks" with
  「元に戻す」 / "Undo" (D3).
- On video app Recommended cards, right-click and long press open the app's menu instead of the
  browser's.
- New strings. Addon ja / en: 「興味なし」 / "Not interested", 「おすすめから外しました」 / "Removed
  from your picks". Core ja / en: `common.undo` 「元に戻す」 / "Undo", `common.saveFailed`
  「変更を保存できませんでした」 / "Couldn't save the change". 「新しいタブで開く」 exists.

### 10. Non-functional

- One extra indexed read of the viewer's marks per feed read and per sweep.
- A mark or undo makes that viewer's next sweep a full rebuild (the cost of any history change).
- Per viewer only.
- The divider and the video app menu are measured in a real browser (`frontend/e2e-components/`).

## Touch points

- `addons/intelligence/app/models.py` and its migration: `pickup_not_interested`.
- `addons/intelligence/manifest.json`: the `/pickup/not-interested/{file_id}` route.
- `addons/intelligence/app/routers/pickup.py`: the two endpoints and the feed-read filter.
- `addons/intelligence/app/pickup/profile.py`, `addons/intelligence/app/workers/pickup.py`: the
  worker's exclusion and the signature.
- `addons/intelligence/app/pickup/evaluate.py`: `after`, grid and `fresh_…` exclusion.
- `addons/intelligence/app/purge.py`: `purge_drive`, `purge_disabled_drives` and `_indexed_drives` (drive discovery).
- `addons/intelligence/frontend/PickupWidget.tsx`, `frontend/pages/pickup.tsx`,
  `frontend/pickupShelfProvider.ts`, `frontend/slots.ts`, `frontend/api.ts`,
  `frontend/messages/{ja,en}.json`.
- `addons/intelligence/tests/` and frontend tests for the above.
- `frontend/src/lib/addons.ts` (`ShelfItemActions`, `slotItemActions`, the loader).
- `frontend/src/components/ContextMenu.tsx` (divider item), `FileContextMenu.tsx`,
  `frontend/src/hooks/useFileMenuItems.ts`, `CarouselSection.tsx`, `FileGrid.tsx`.
- `frontend/src/components/videoapp/VideoCard.tsx`, `useDiscover.ts`, `discoverCache.ts`,
  `useProviderShelfPage.ts`, `DiscoverFace.tsx`, `VideoShelfPage.tsx`.
- `frontend/src/messages-core/{ja,en}.json`: `common.undo`, `common.saveFailed`.
- `frontend/e2e-components/` (the divider and the card menu, measured).
- Order of landing: (1) a core PR with SPEC-CORE-150 and its `docs/ADDON-DEVELOPMENT.md` entry
  (the addon's CI type-checks against core `develop`, so the props must exist first; nothing
  changes for a user while no addon uses them); (2) the addon PR; (3) a core PR that bumps the
  `addons/intelligence` pointer with `docs/addons/intelligence.md`, `docs/user-guide/video.md`
  and `docs/user-guide/keyboard-shortcuts.md`.
- Rules passed through: `.claude/rules/design-decisions.md` (addons: no core-to-addon
  dependencies, slots), `.claude/rules/internal-api-policy.md` (R4),
  `.claude/rules/backend-conventions.md` (migrations), `.claude/rules/frontend-conventions.md`,
  `DESIGN.md`.
- No protected path is edited.

## Invariants

I1. A mark changes no watched state, engagement or seed and writes no core table, and one viewer's marks in one drive never change what another viewer, or the same viewer in another drive, is served.
I2. Without a viewer, `PUT` and `DELETE` answer 400 and write nothing; with the drive's `index` policy off, the route answers 404 through the proxy; a `file_id` not matching `^[A-Za-z0-9_-]{12}$` is 422; a repeated `PUT` keeps the first `marked_at`; `DELETE` with no mark answers 204.
I3. The startup purge deletes a policy-off drive's marks even when the drive has no indexed files, and no other drive's; a sweep that cannot read a viewer's marks writes no feed and no checkpoint for that viewer and still processes the others.
I4. A card leaves only after its write resolves, and a pending card cannot take the action again; a failed write leaves the card and the mark as they were (except the accepted late commits after a proxy timeout) and shows `common.saveFailed` as an `error` toast; a success shows the action's message, with 「元に戻す」 only when an undo exists; 「元に戻す」 restores the card at its former index, and an emptied home row, Pickup grid, See all grid or Recommended shelf in its former place, only after `DELETE` or `undo` resolves, only while the same list (on Discover, the same visit) is current, and does nothing after a profile change.
I5. On the Pickup page, the ids received after any marks and undos never repeat a file, and skip none unless a page load overlapped a pending write or the stored feed was rebuilt between pages; the home row's count equals the feed's `total`.
I6. `ContextMenu`, `FileContextMenu`, `useFileMenuItems`, `useContextMenu`, `CarouselSection`, `FileGrid`, `FileActions` and `VideoCard` used without the new props render the same rows and behave as before, and no divider is drawn unless a caller passes one; with the extra group, its rows come first, then one divider, then today's rows.
I7. On a Recommended card whose entry has item actions, with a profile, right-click and a 500 ms long press open a menu of exactly 「新しいタブで開く」 (opening the card's own link) plus the valid actions and do not navigate (also not on the click after the long press); a click or short tap navigates; an element without a string `id` and `label` or a function `run`, or with a repeated `id`, is dropped on its own, and a missing, throwing or non-array `slotItemActions` gives no actions; no other shelf's cards, no card without valid actions and no card without a profile open an app menu.
I8. An id removed on Discover through an action is absent from the stored ids under that visit's key, including from any provider answer stored later under that key in the JS session, until an undo resolves, which puts it back at its removal-time index clamped to the stored list; the next visit's rebuild does not draw a removed id.

## Revises

SPEC-ADDON-149 I4. The feed read's ids are exactly the stored feed in rank order minus the viewer's exclusion set and the viewer's not-interested marks of the drive (SPEC-ADDON-154), both read at request time, sliced by `offset` and `limit` (or, for `window=daily`, the first `min(40, total)` of that list shuffled by the existing seed, cut to `limit`), and its `total` is the length of that filtered list.
SPEC-ADDON-149 I5. `_stale_work` and the feed read compute the same set for the same data (the viewer's exclusion set plus their not-interested marks of the drive), `watched_file_ids` returns that exclusion set without the marks, and `PROFILE_VERSION` is 5.
SPEC-ADDON-095 I5. With `last_played_at` unchanged, liking, unliking, favouriting, unfavouriting, setting aside from Continue, a change in a video's coverage, position or reported duration, a change in the sum of its played seconds, adding or removing a not-interested mark (SPEC-ADDON-154), or deploying a new `PROFILE_VERSION`, causes that viewer's feed for the drive to be rebuilt on the next sweep, as does a change to the drive's arrival stamp (SPEC-ADDON-103); two sweeps over an unchanged history, marks and arrival stamp on the same UTC date and `PROFILE_VERSION` compute the same checkpoint.
SPEC-ADDON-102 I1. For a fixed history, marks, reference time and candidate set, the set of files that qualify for a lane is exactly the set of candidates neither excluded under SPEC-ADDON-149 nor marked under SPEC-ADDON-154, with similarity in `[0.45, 0.999)`. Freshness changes only their order and which 120 a lane keeps.
SPEC-ADDON-098 I9. In `replay` at cut point `t`, no configuration ranks a file it excludes (`after`, the grid rows and `fresh_…`: the files watched under SPEC-ADDON-149, judged from rows with `last_played_at < t` and rows whose `last_played_at` does not parse, plus the viewer's not-interested marks with `marked_at < t`; `before`, `depth`, `video`, `random`, `newest`: every file opened before `t` and every unparseable row) or one created at or after `t`; the targets are exactly the live videos created before `t` with SPEC-ADDON-150 engagement above 0 and `last_played_at` in `[t, t + horizon)`; `recall@k = |T ∩ R_k| / |T|` is averaged per viewer over evaluated cut points only; `after` ranks exactly as the worker builds the feed with `FLOOR = 1` (videos only, engagement weighted, freshness 1 everywhere); and the `fresh_…` row marked `*` ranks exactly as the worker builds the feed for the same history, marks, candidates and reference time.
SPEC-CORE-076 I1. Within a visit, the number of drawn positions never decreases, except that Recommended's position goes when its last card is removed through an item action (SPEC-CORE-150) and comes back when that action is undone in the same visit; Retry on Continue or New does not change it.
SPEC-CORE-076 I7. A provider's resolved items (ids, with the byline of each when a page provider gave one) are stored under the key it was asked with, also when they arrive after the deadline, after the visit inputs changed or after `VideoApp` unmounted, minus any id in that key's removal set (ids removed through an item action under that key in the JS session and not undone, SPEC-CORE-150); a lookup never returns an entry stored under a different drive, target, slot, local date, nickname or entry list (Recommended) or entry and UI locale (addon shelf); a rejection or an absent provider writes nothing and leaves an existing entry in place.
SPEC-CORE-076 I2. Position j is drawn only once every position before it has settled in the visit; so no shelf ever appears above a shelf already drawn within a visit, except Recommended drawn again at its former position when the removal of its last card through an item action is undone (SPEC-CORE-150).

## Checked, no action

- **Demoting similar videos.** Decided against for now: excluding only the file is safe; demotion
  needs tuning and an evaluation once enough marks exist.
- **A list of marked videos.** Decided against: undo is in the toast. A marked video stays out of
  Pickup until undone; it can still be found and played anywhere else.
- **Marks made off Discover and Discover's stored ids.** Only removals made on Discover update the
  stored ids; one made on the home row, the Pickup page or the See all page can be drawn by the
  next Discover visit's rebuild once, until the provider's next answer is stored (accepted).
- **The daily window after a mark.** The home row's daily shuffle runs over the filtered list, so
  after a mark the next visit can show a different set of cards, not just one fewer.
- **Hydration dropping ids on the Pickup page.** The page's offset counts feed ids, not cards, so a
  feed id whose file was trashed since the last sweep (dropped by the batch file read) moves
  neither forward nor back.
- **Larger touch targets for menus.** The shared menu keeps its row height; changing every menu is
  a separate change.
- **Other surfaces.** Search, folders and the video app's other shelves get no 「興味なし」.
- **The iOS shell.** Long press inherits `useContextMenu`; real-device behaviour is
  `agent_cannot_verify`.
