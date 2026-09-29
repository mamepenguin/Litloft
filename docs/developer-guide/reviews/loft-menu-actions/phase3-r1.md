# Phase 3 review, round 1: media_import `9ea30ee`

Reviewed: media_import `9ea30ee` (feat/loft-menu-actions), not `main...HEAD`. Core develop `a9079aee1`, intelligence `5e9cbc6`.
Baseline: `pnpm vitest run src/addons/media_import` gave 18 files and 215 tests, all green. `pnpm exec tsc --noEmit` exited 0. `pnpm test` gave 559 files and 8147 tests, all green.
Backend `test_addon_meta.py` was read, not run (Docker).

## Touch points reached that are not in the list

- Core `@/components/ActionMenuItem` (LoftRefreshMenuItem.tsx:7,44) is consumed and not changed.
- Core `@/lib/playerKind` `LOFT_MIME` (LoftRefreshMenuItem.tsx:9,41) is consumed. The spec names it, but the touch-point list does not.
- `refreshLoft`'s new throw (api.ts:85) also reaches **its other caller**, the panel's `handleRefresh` behind `CaptionStatusBadge` retry. The list names the badge retry but not the behaviour change on that path (see F3).
- The backend slot manifest test `backend/tests/test_addon_meta.py` and `frontend/api.test.ts` are tests only.
- Endpoints: no new ones. `POST /link/{id}/refresh` becomes reachable for a `.loft` **without a `loft_metadata` row**. Before this change it was unreachable in that state (see F2).

The last two bullets are the candidates for a missing invariant.

## Mutation table

Runner: the three files `LoftMetadataPanel.test.tsx`, `LoftRefreshMenuItem.test.tsx` and `api.test.ts`. Each mutation was restored with `git checkout -- <file>`.

| # | mutation | want | result | killing test |
|---|---|---|---|---|
| M1 | LOFT_MIME gate removed | kill | killed | MenuItem "renders nothing for a %s file" (x3) |
| M2 | gate inverted | kill | killed | same + refresh tests |
| M3 | `onRequestClose` call removed | kill | killed | "refreshes once, closes the menu, and tells the panel" |
| M4 | `refreshLoft` call removed | kill | killed | same + "reports a failed refresh" |
| M5 | notify before `await refreshLoft` | kill | killed | "reports a failed refresh and does not tell the panel" |
| M6 | notify removed | kill | killed | "refreshes once, closes..." |
| M7 | start toast removed | kill | killed | "refreshes once, closes..." |
| M8 | failure toast removed | kill | killed | "reports a failed refresh..." |
| M9 | start toast `info` changed to `error` | live | **live** | none |
| M9b | failure toast `error` changed to `success` | kill | **live** | none (F1) |
| M9c | notify also in catch | kill | killed | "reports a failed refresh..." |
| M10 | `res.ok` check removed | kill | killed | api "rejects when the refresh is refused" |
| M11 | `res.ok` inverted | kill | killed | same + "refreshLoft sends the percent-encoded drive" |
| M11b | reject only on >=500 | kill | killed | api "rejects when the refresh is refused" (404) |
| M12 | emitter fileId filter removed | kill | killed | Panel "re-reads ... of this file only" |
| M13 | emitter unsubscribe removed | kill | killed **only by test order** | Panel "re-reads..." when run in-file. Run alone with `-t "re-reads"`, it survives (F5) |
| M14 | `handlerRef.current = handler` removed | live | live | none (panel is remounted per fileId) |
| M14b | `notifyLoftRefreshed` no-op | kill | killed | Panel "re-reads..." + MenuItem "refreshes once..." |
| P1 | offer id changed | kill | killed | "offers transcription ... before its metadata has loaded" |
| P2 | order 100 changed to 40 | kill | killed | same (`order > 50`) |
| P2b | order 100 changed to 51 | live | live | none (bound is "after intelligence's 10-50") |
| P3 | `active: false` | kill | killed | 4 panel tests |
| P3b | `active: true` | live | live | none (drive is always set) |
| P3c | active only once metadata loaded | kill | killed | "offers transcription ... before its metadata has loaded" + 3 |
| P4 | `busy: false` | kill | killed | 3 transcribe tests |
| P5 | `setQueueingStt(true)` removed | kill | killed | 3 transcribe tests |
| P6 | `finally` removed (busy never cleared) | kill | killed | 3 transcribe tests |
| P6b | busy cleared on success only, no finally | kill | killed | "reports a failed transcription request and stops being busy" |
| P7 | `run` no-op | kill | killed | 3 transcribe tests |
| P8 | success toast removed | kill | killed | "queues transcription once..." (x2) |
| P8b | success key fixed to `queued` | kill | killed | "... toasts already_queued" |
| P8c | success toast kind changed to `info` | live | live | none |
| P9 | error toast removed | kill | killed | "reports a failed transcription request..." |
| P9b | error toast kind changed to `success` | kill | **live** | none (F1) |
| P9c | error toast also shown on success | kill | **live** | none (F1) |
| R1 | re-read delay 3000 changed to 0 | live | live | none |
| R2 | re-read delay 3000 changed to 5000 | kill | killed | Panel "re-reads..." |
| R3 | re-read skips `getLoftMetadata` | kill | killed | Panel "re-reads..." |
| R4 | `useLoftRefreshed` removed | kill | killed | Panel "re-reads..." |
| R5 | re-read result discarded | kill | killed | Panel "re-reads..." |
| B1 | badge `onRetry` no-op | kill | killed | "refreshes from the caption badge's retry" |
| B2 | `handleRefresh` does not re-read | live | live | none (invariant 10 asks only that retry triggers the refresh) |
| B3 | `isRetrying={false}` | live | live | none |
| B4 | `setRefreshing(true)` removed | live | live | none |
| B5 | catch keeps spinner | live | live | none |
| B6 | badge refresh with wrong drive | kill | killed | "refreshes from the caption badge's retry" |

The final `git -C addons/media_import status --short` was clean. A scratch test `frontend/src/addons/media_import/zz_scratch.test.tsx`, in a core path that is gitignored, was used for F3 and F4 and then deleted.

## Findings

### F1 [introduced] Low (A-candidate, test gap): toast kind and exclusivity are not held
- Invariant 9 says "a failed request toasts an error", and invariant 8 says "toasts the result". The tests assert only that the text is present (`LoftRefreshMenuItem.test.tsx:89-91`, `LoftMetadataPanel.test.tsx:136,153-155`).
- Three mutations survive:
  - M9b: a refresh failure shown as a green success toast.
  - P9b: an STT failure shown as a success toast.
  - P9c: a successful STT that also shows "Failed to queue speech-to-text".
- The code under test is correct today (`LoftRefreshMenuItem.tsx:37`, `LoftMetadataPanel.tsx:70-72`). This is only a test gap.
- To reproduce, apply P9c and run the panel test file: 14/14 pass.

### F2 [introduced] Low (B): the `⋮` "Refresh metadata" entry is offered on a `.loft` with no metadata row, and always fails there
- The entry is gated only by `mimeType === LOFT_MIME` (`LoftRefreshMenuItem.tsx:41`).
- The refresh endpoint returns 404 "Metadata not found" when `loft_metadata` has no row (`backend/router.py:236-240`).
- A user who opens such a `.loft` (for example one copied in rather than created through the import) sees the entry. Choosing it gives two toasts: "Refreshing metadata", then "Failed to refresh metadata". Refresh cannot create the row, so retrying never helps.
- Parent `9ea30ee^`: the refresh button rendered only after `if (!metadata) return null` (parent `LoftMetadataPanel.tsx:61` before `:86`), so the action was unreachable in this state.
- Evidence is from the code on both sides. The tree was not switched to the parent, because the addon files are symlinked into core and the brief said not to move the addon tree.
- No invariant is broken. Recorded for the triage.

### F3 [introduced] Low (B): a failed badge retry is now silent
- `refreshLoft` now throws on a non-2xx response (`api.ts:85`).
- The badge's `handleRefresh` (`LoftMetadataPanel.tsx:56-64`) catches the error and only resets the spinner. It shows no toast, while the menu path toasts "Failed to refresh metadata".
- Parent: `refreshLoft` resolved on HTTP errors. A failed retry therefore spun for 3 s and re-read, and the badge stayed as it was.
- Now the spinner stops at once and nothing tells the user the retry was refused.
- B2-B5 (re-read, spinner set and clear) survive. Invariant 10 asks only that the refresh is triggered, so this breaks no invariant.
- Reproduced in the scratch test: `refreshLoft` rejects, the badge is clicked, and no toast appears. The code path confirms it.

### F4 [pre-existing] Info: the 3 s re-read timer is not cleared on unmount
- `rereadLater`'s `setTimeout` (`LoftMetadataPanel.tsx:46-52`) is never cleared.
- Scratch reproduction: render the panel, `notifyLoftRefreshed("f1")`, unmount, then advance 3 s. `getLoftMetadata` is called a second time after unmount, a request whose result is discarded.
- No wrong-file data can appear: `FileDetailContent.tsx:14` keys `FileDetailContainer` by `fileId`, so a file change remounts the panel.
- The same untracked timer existed at parent `LoftMetadataPanel.tsx:41`. This commit adds a second trigger (the menu notify) to the same shape.

### F5 [introduced] Low (test gap): the emitter's unsubscribe is held only by test order
- Removing `listeners.delete(listener)` (`loftRefresh.ts:29`) is killed only because listeners leaked from earlier panel tests in the same file inflate `getLoftMetadata`'s call count.
- With `-t "re-reads"` alone, and with the MenuItem file, the mutation survives.
- A leaked listener would fire the handler of an unmounted panel on every later refresh.
- To reproduce: remove line 29, then run `pnpm vitest run src/addons/media_import/LoftMetadataPanel.test.tsx -t "re-reads"`. Result: 1 passed.

### F6 [introduced] Low (B, prose that misleads a check): the invariants name an entry label that does not exist
- `invariants.md` item 8 and the "Joined path" line (the R-5 hand check) look for "Transcribe from audio".
- The offered label is `t("generateStt")` (`LoftMetadataPanel.tsx:81`): "Generate captions with speech-to-text" / "音声認識で字幕を生成".
- Someone doing the R-5 check by that text would report the entry missing, or "fix" the label.
- Suggest deleting the quoted label from the invariants or replacing it with the offer id `media_import.transcribe`. The code is not wrong.

### Checked, no finding
- **Toasts on a phone:** `ToastProvider` is mounted in `app/layout.tsx:70`, fixed at `z-[100]`, above `MobileInspectorSheet` (`z-40`).
- **Menu item after `onRequestClose`:** the menu subtree unmounts (`FileActions.tsx:275`). The rest of the click handler uses only the provider-owned `toast`, a module-level notify and the component's props, so the toasts and the notify still fire.
- **Double toasts on refresh:** the menu path shows start plus failure, or start only. The panel's re-read toasts nothing.
- **`ja`/`en`:** the key sets are identical. Every `t()` key used by the two components exists in both, and the merged `src/messages/*.json` contains the new keys.
- **A second `refreshLoft` caller outside media_import:** none.
- **`slots.ts` and `router.py` consistency:** no frontend test checks that `slots.ts` matches the manifest. This gap was already there before this commit; no finding.

TOTAL: 6 findings
