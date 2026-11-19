# Triage: r1

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior
- unspecified_behavior
- rejected_high_consequence claude-read:F3

## Read coverage

Product files:
- addons/intelligence/app/models.py — partial: Changed hunk (PickupNotInterested class) from the diff.
- addons/intelligence/app/pickup/evaluate.py — partial: Changed hunks (_read_marks, _rank_configs, _cut_rankings, _replay_viewer) from the diff.
- addons/intelligence/app/pickup/profile.py — partial: Changed hunk (watched_file_ids docstring) from the diff.
- addons/intelligence/app/purge.py — partial: Diff hunks plus Read of lines 215-396 (vision, video-visual and index purge callers of _indexed_drives).
- addons/intelligence/app/routers/pickup.py — partial: Changed hunks (feed-read filter, _store_mark, _remove_mark, the two endpoints) from the diff.
- addons/intelligence/app/workers/pickup.py — partial: Diff hunks plus Read of lines 205-244 (per-viewer _stale_work loop).
- addons/intelligence/frontend/PickupWidget.notInterested.test.tsx — full: New file, whole content in the diff.
- addons/intelligence/frontend/PickupWidget.tsx — partial: Changed hunks from the diff (mark, undo, extraMenuItems).
- addons/intelligence/frontend/api.ts — partial: Appended hunk (writePickupNotInterested and wrappers).
- addons/intelligence/frontend/messages/en.json — partial: Changed hunk (pickup strings).
- addons/intelligence/frontend/messages/ja.json — partial: Changed hunk (pickup strings).
- addons/intelligence/frontend/pages/pickup.notInterested.test.tsx — full: New file, whole content in the diff.
- addons/intelligence/frontend/pages/pickup.tsx — partial: Changed hunks from the diff (loadMore, effects, mark, undo, grid).
- addons/intelligence/frontend/slots.ts — partial: Changed hunks (imports, slotItemActions).
- addons/intelligence/manifest.json — partial: Changed hunk (new route).
- frontend/e2e-components/file-menu-divider.spec.ts — full: New file, whole content in the diff.
- frontend/e2e-components/fixtures/app.tsx — partial: Two changed hunks (import and spread).
- frontend/e2e-components/fixtures/fileMenuDivider.tsx — full: New file, whole content in the diff.
- frontend/e2e-components/spec-viewport.spec.ts — partial: Changed hunk (list entry).
- frontend/src/components/CarouselSection.tsx — partial: Changed hunks (prop and pass-through).
- frontend/src/components/ContextMenu.tsx — partial: Changed hunks (types, items.map render).
- frontend/src/components/FileContextMenu.tsx — partial: Changed hunks (prop, extra, entries).
- frontend/src/components/FileGrid.tsx — partial: Changed hunks (prop and both layouts' pass-through).
- frontend/src/components/videoapp/DiscoverFace.tsx — partial: Changed hunks covering DiscoverShelf and DiscoverFace bodies.
- frontend/src/components/videoapp/VideoApp.tsx — full: Read the whole file.
- frontend/src/components/videoapp/VideoCard.tsx — partial: Changed hunks (CardLink, VideoCardWithMenu, VideoCard).
- frontend/src/components/videoapp/VideoShelfPage.tsx — partial: Changed hunks (item actions loading, removable, grid).
- frontend/src/components/videoapp/discoverCache.ts — partial: Changed hunks (removed map, withoutRemovedItems, removeCachedItem, restoreCachedItem, reset).
- frontend/src/components/videoapp/useDiscover.ts — partial: Changed hunks only; the enclosing provider-run function was not read in full.
- frontend/src/components/videoapp/useRemovableItems.ts — full: New file, whole content in the diff.
- frontend/src/hooks/useFileMenuItems.ts — partial: Changed hunks (types, extra rows, deps).
- frontend/src/lib/addons.ts — partial: Changed hunks (types, loadSlotItemActions).
- frontend/src/messages-core/en.json — partial: Changed hunk (common.undo, common.saveFailed).
- frontend/src/messages-core/ja.json — partial: Changed hunk (common.undo, common.saveFailed).

Test files:
- addons/intelligence/frontend/__tests__/pickupNotInterestedAction.test.ts — full: New file, whole content in the diff.
- addons/intelligence/tests/test_z_pickup_not_interested.py — full: New file, whole content in the diff.
- frontend/src/__tests__/undoSaveFailedMessages.test.ts — full: New file, whole content in the diff.
- frontend/src/components/__tests__/fileMenuExtraRows.test.tsx — full: New file, whole content in the diff.
- frontend/src/components/videoapp/__tests__/VideoApp.itemActions.test.tsx — full: New file, whole content in the diff.
- frontend/src/components/videoapp/__tests__/VideoShelfPage.itemActions.test.tsx — full: New file, whole content in the diff.
- frontend/src/components/videoapp/__tests__/useRemovableItems.test.tsx — full: New file, whole content in the diff.

## Needs a human

### unspecified_behavior

Note: useRemovableItems keeps a JS-session-global store of keyed removal operations, separate from discoverCache's removal set; resetDiscoverCache does not clear it.; Mark-only drives are now visited by the vision and video-visual startup purges.; ContextMenu `immediate` rows run onClick synchronously within the click event.
- claude-read: useRemovableItems keeps a JS-session-global store of keyed removal operations, separate from discoverCache's removal set; resetDiscoverCache does not clear it.
- claude-read: Mark-only drives are now visited by the vision and video-visual startup purges.
- claude-read: ContextMenu `immediate` rows run onClick synchronously within the click event.
- claude-verify: useRemovableItems keeps operations in module-level Maps for the whole JS session. Nothing removes them, and resetDiscoverCache does not clear them (its only callers are tests).
- claude-verify: ContextMenu's `immediate` flag changes when the handler runs (in the same click rather than the next frame) for the rows that set it.

### unspecified_behavior

Note: useRemovableItems keeps operations in module-level Maps for the whole JS session. Nothing removes them, and resetDiscoverCache does not clear them (its only callers are tests).; ContextMenu's `immediate` flag changes when the handler runs (in the same click rather than the next frame) for the rows that set it.
- claude-read: useRemovableItems keeps a JS-session-global store of keyed removal operations, separate from discoverCache's removal set; resetDiscoverCache does not clear it.
- claude-read: Mark-only drives are now visited by the vision and video-visual startup purges.
- claude-read: ContextMenu `immediate` rows run onClick synchronously within the click event.
- claude-verify: useRemovableItems keeps operations in module-level Maps for the whole JS session. Nothing removes them, and resetDiscoverCache does not clear them (its only callers are tests).
- claude-verify: ContextMenu's `immediate` flag changes when the handler runs (in the same click rather than the next frame) for the rows that set it.

### rejected_high_consequence (claude-read:F3)

Question: On the Recommended See all page, useRemovableItems is called without a key, so a removal made by one profile persists in local state across a profile switch that does not remount the page. It is replayed over the next profile's list and hides the same file there.
Impact: Viewer A marks file X on See all, then switches the profile to B without leaving the page. useProviderShelfPage refetches for B (nickname is in its deps), but the local 'remove X' operation is replayed, so X is missing from B's grid although B never marked it.
Evidence: VideoShelfPage.tsx: `const removable = useRemovableItems(provider.items);` (no key) and the grid renders `removable.items`. useRemovableItems.ts replays `localOperations` over any supplied list containing the id and never resets them. useProviderShelfPage.ts:165 includes `nickname` and `hasProfile` in the reload deps, so the list changes while the operations stay.
Recommendation: Key useRemovableItems on the See all page by (drive, entry, nickname), or reset its local operations when nickname, drive or entry changes.
Note: On the Recommended See all page, useRemovableItems is called without a key, so a removal made by one profile persists in local state across a profile switch that does not remount the page. It is replayed over the next profile's list and hides the same file there.

## Findings

A: 1
B: 4
C: 0

### claude-read:F3 — bucket A, MEDIUM, rejected

Claim: On the Recommended See all page, useRemovableItems is called without a key, so a removal made by one profile persists in local state across a profile switch that does not remount the page. It is replayed over the next profile's list and hides the same file there.
Impact: Viewer A marks file X on See all, then switches the profile to B without leaving the page. useProviderShelfPage refetches for B (nickname is in its deps), but the local 'remove X' operation is replayed, so X is missing from B's grid although B never marked it.
Evidence: VideoShelfPage.tsx: `const removable = useRemovableItems(provider.items);` (no key) and the grid renders `removable.items`. useRemovableItems.ts replays `localOperations` over any supplied list containing the id and never resets them. useProviderShelfPage.ts:165 includes `nickname` and `hasProfile` in the reload deps, so the list changes while the operations stay.
Repro: not_reproduced. Reasoned: render VideoShelfPage with nickname 'alice' and items [r1,r2,r3], remove r2, rerender with nickname 'bob' and a provider answer [r1,r2,r3]. Expected drawn [r1,r2,r3]; the code yields [r1,r3]. No test covers a profile switch on See all.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Key useRemovableItems on the See all page by (drive, entry, nickname), or reset its local operations when nickname, drive or entry changes.

</details>

### claude-read:F1 — bucket B, LOW, open

Claim: The diff edits frontend/src/components/videoapp/VideoApp.tsx, which is not in the declared touch-point list.
Impact: No user-visible defect: the only change passes `viewer={state.nickname}` to DiscoverFace. A reader working from the touch points would still miss that Discover's item-action gating (I4 profile check, I7 'with a profile') depends on this prop.
Evidence: frontend/src/components/videoapp/VideoApp.tsx:88 adds `viewer={state.nickname}`. DiscoverFace defaults `viewer = null`, and with null DiscoverShelf builds no `menu` (DiscoverFace.tsx, the `viewer !== null` condition). The touch points list DiscoverFace.tsx but not VideoApp.tsx.
Repro: Mutation: delete `viewer={state.nickname}` at VideoApp.tsx:88. Every Recommended card on Discover then loses its menu; the VideoApp.itemActions tests would fail, but only when the intelligence addon is linked (it.runIf).
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add `frontend/src/components/videoapp/VideoApp.tsx` (viewer pass-through to DiscoverFace) to the touch points.

</details>

### claude-read:F2 — bucket B, LOW, open

Claim: The diff adds frontend/src/components/videoapp/useRemovableItems.ts, a new module with JS-session-lifetime global state (operationsByKey, listenersByKey), and it is not in the declared touch-point list.
Impact: A second session-scoped store of removals sits next to discoverCache's removal set, and the touch points do not name it. Discover's drawn cards (keyed operations replayed over the supplied list) and the stored ids (discoverCache) can diverge without the plan accounting for it. The store also grows unbounded for the session. The module is also the path to F3.
Evidence: frontend/src/components/videoapp/useRemovableItems.ts (new file): module-level `operationsByKey` and `listenersByKey` Maps, never cleared (resetDiscoverCache does not clear them). Used by DiscoverFace.tsx (keyed by shelf.cacheKey) and VideoShelfPage.tsx (unkeyed). The touch points list discoverCache.ts, useDiscover.ts, DiscoverFace.tsx and VideoShelfPage.tsx, but not this module.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add useRemovableItems.ts to the touch points. Either clear its keyed operations in resetDiscoverCache or document that the two stores are kept separately.

</details>

### claude-read:F4 — bucket B, INFO, open

Claim: Changing `_indexed_drives` to include drives that only have marks also changes the drive set of `purge_disabled_vision_drives` and `purge_disabled_video_visual_drives`, which the touch points do not name.
Impact: On startup, mark-only drives now get extra vision_describe and video_visual_index policy lookups and run no-op purges, because those functions iterate IndexedFile rows and find none. A policy lookup error there is logged with logger.exception, so log noise is possible; no data is changed.
Evidence: addons/intelligence/app/purge.py:225 and :337 call `_indexed_drives()`, which now unions PickupNotInterested.drive_id (purge.py:188-210). The touch points name only `purge_drive`, `purge_disabled_drives` and `_indexed_drives`.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Name the vision and video-visual purges in the touch points, or give purge_disabled_drives its own drive discovery that adds the mark drives.

</details>

### claude-read:F5 — bucket B, INFO, open

Claim: ContextMenu gains a general `immediate` MenuItem flag, which bypasses the requestAnimationFrame deferral; the touch points describe the ContextMenu change only as a 'divider item'.
Impact: Any future caller that sets `immediate` gets synchronous onClick inside the click handler. Today only the new extra rows and the VideoCard menu use it, so callers that pass nothing are unchanged (I6 holds). It is unplanned API surface in the shared menu.
Evidence: frontend/src/components/ContextMenu.tsx: new `immediate?: boolean` on MenuItem, honored in onClick. Used in useFileMenuItems.ts (extra rows, `immediate: true`) and VideoCard.tsx (all menu rows).
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Mention the `immediate` row option in the touch points for ContextMenu.

</details>

## Not verified

- claude-read: Whether addons/intelligence/.flash/pickup-not-interested.md is part of the reviewed commit.
- claude-read: Whether CI links the intelligence addon so the it.runIf-gated tests actually run.
- claude-read: Whether the See all page can change profile without remounting (F3 assumes that VideoAppHeader allows it in place).
- claude-read: frontend-conventions.md, design-decisions.md and process.md were not read in full.
- claude-read: No test or e2e run; all claims come from reading.
- claude-verify: I did not run git diff against origin/develop, so I could not confirm directly that VideoApp.tsx and useRemovableItems.ts are in the diff. My conclusion rests on the new `viewer` prop and the new module's usages.
- claude-verify: I ran no tests (I had no execution tools).
- claude-verify: I did not check the backend invariants I1-I3 or I5, beyond the purge drive discovery.
- claude-verify: I did not read VideoCard.tsx's menu logic beyond the `immediate` rows and the isSameViewer check.

TOTAL: 5 findings
