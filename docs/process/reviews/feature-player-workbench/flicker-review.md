# Review: flicker fixes (core 016aa51a0..25bd0b227, intelligence 81bb56b..289d723)

Scratch evidence: /private/tmp/claude-502/-Users-libre-Sources-video-share/61e623b8-c332-4378-bd97-679da1c13a63/scratchpad/rt6/
(own vitest config; run from frontend/ with `pnpm exec vitest run --config <rt6>/vitest.config.ts`).
Committed tests run read-only and pass: WorkbenchPendingEntry (3), SidebarProviderHydration (4), TranscriptSection (91).

## F1. Transcript: the file-change `false` is never followed by `true` when both files have a transcript (latent)

- Where: addons/intelligence/frontend/TranscriptSection.tsx:442-453 (new `useLayoutEffect(..., [fileId])`, then the old `useEffect(..., [hasAnything])`).
- What goes wrong: on a file change in a reused mount, the layout effect reports `false`. The chunk/word/external
  state is not cleared on a file change (lines 322-345, 347-366): it is replaced only when the new fetch resolves. So
  going from one transcribed file to another, `hasAnything` stays `true` the whole time and the passive effect never
  fires again. The last report for the new file is `false`, and the Transcript toggle and panel are gone even though
  the file has a transcript. Before this commit the host reset its reports on the file change, so silence read as
  available and the result was right.
- Trigger: a host that keeps one TranscriptSection mount across a file change. The new effect's own comment says that
  is the case it handles. Core does not do this today: `FileDetailContent.tsx:32` keys `FileDetailContainer` by
  `fileId`, and the slot is the only host (`slots.ts:23`), so every file gets a fresh mount.
- Frequency: 0 today. It becomes ~8 (every next video in a queue of transcribed files) as soon as a host reuses the mount.
- Impact: 8 (the panel silently disappears for a file that has a transcript).
- Evidence: rt6/transcript-file-change.rt6.test.tsx renders fileId a, waits for `true`, then rerenders fileId b, where
  both return chunks. Reports: `[["a",false],["a",false],["a",true],["b",false]]`, and the test fails with
  `expected ['b', false] to deeply equal ['b', true]`.
  The new addon test only covers the first mount. Nothing covers a file change.
- Fix options: clear the cues on a file change so `hasAnything` goes `false` and back to `true`, or drop the `[fileId]`
  dependency and report `false` on mount only, which is all core needs today.

## F2. Test gap: the "sibling inside Suspense" property of RenderedSignal is not tested on the production (lazy) shape

- Where: frontend/src/components/AddonSlot.tsx:100-103 (`RenderedSignal` inside `<Suspense>`). Tests:
  WorkbenchPendingEntry.test.tsx (`moduleWith(Silent | AnswersFalse)`) and e2e-components/stubs/addons.ts (`TranscriptSlot`).
- What goes wrong: every new test hands SlotEntryRenderer a plain component. Production slot components are
  `React.lazy` (intelligence `slots.ts:23`: `"transcript": lazy(() => import("./TranscriptSection"))`), and even a
  cached module suspends on first render until the lazy chunk resolves. Only that suspension makes the Suspense
  placement matter. If RenderedSignal moved outside the `<Suspense>`, or into the fallback, pending would clear while
  the lazy chunk is still loading. A silent entry would then be drawn, and the transcript would remove it a frame
  later: the original flicker. Every new unit test and the e2e test would still pass, because nothing in them suspends.
- Trigger (for the missed defect): a full load of a video page with a stored panel, i.e. the reported bug.
- Frequency of the missed defect: 8. Impact: 3 (panel and player cap flicker, which is visible and self-correcting).
- Evidence that the current code is right on the lazy path: rt6/lazy-pending.rt6.test.tsx uses the real
  SlotEntryRenderer, useSlotAvailability, buildWorkbenchPanels and Workbench, with a lazy component released after mount.
  The per-commit `available` values are `[false,false]` for an entry that answers false at layout, and `[false,true]`
  for a silent one. Both pass.
- Fix: make one row of WorkbenchPendingEntry (or the e2e stub's `transcript`) a `lazy()` component gated on a promise.

## F3. Design (to the human): "pending" changes the spec's toggle rule, and the spec was not revised

- Where: frontend/src/components/FileDetail/workbench/panels.tsx:170-171. Against
  docs/specs/player-workbench.md:
  - SPEC-CORE-085 step 2, line 133: "An addon entry that has not answered is treated as available, as today."
    The change contradicts this most directly.
  - I1: "exactly one toggle per panel-list item that has not answered `false`".
  - §2 Failure cases: "An addon entry never reports: it is available by silence … It gets a toggle".
  - SPEC-CORE-089 step 1: "listed when silent".
  - §10 Layout shift: "An addon entry that stays silent is shown". This still holds, but only once the entry has rendered.
- What changes: an entry that has not rendered yet now has no toggle, although it has not answered `false`.
  While the module loads, this is the intended fix. But pending never ends for an entry that never renders:
  a module import that fails (for example a chunk that went stale after a rebuild while the tab was open), or a module
  with no component under the entry's id. Before this change such an entry had a toggle that opened an empty panel.
  Now it has none. That is arguably better, but it is not what I1 or §2 say, and SPEC-CORE-036 I12 ("silence means
  available") now holds only after the entry renders.
- Frequency: 10 for the transient load window (by design). The permanent case is about 1. Impact: 1.
- Ask: revise I1 and §2 to say "rendered and has not answered `false`", or approve the deviation.

## Checked, no finding

- Silence still means available once rendered: the Workbench renders every item, hidden ones included
  (Workbench.tsx:106-138), and unlisted inspector tabs stay mounted (inspector/tabs.ts:11). A hidden container still
  renders, so RenderedSignal fires. A silent entry becomes available before paint, because a setState in a layout
  effect is flushed synchronously. Scratch: `[false,true]`.
- File change: FileDetailContent keys the container by fileId, so a new useSlotAvailability starts each file. Nothing
  leaks across files, and pending clears before paint because the module and lazy chunk are cached.
  `onRendered` is stable per key (renderedFor caches it), and RenderedSignal reading the first callback from a ref is sound.
- Form change (wide to stacked or phone): the `rendered` map survives the remount, so pending does not come back.
  The transcript's re-answer on remount behaves as it did before.
- Never-ending pending in normal use: a cached module goes through Suspense and then signals (lazy scratch test).
  `awaitingForm` renders neither surface, but nothing is shown then.
- Every `player-side` entry gives its first answer at layout, so the pending gate is enough for all of them.
  The intelligence manifest is the only one with `player-side` entries: transcript, scenes and detailed-summary.
  Each top-level lazy component calls `onAvailability(false)` in a `useLayoutEffect([fileId])`:
  ScenesSectionContainer.tsx:129-135, DetailedSummarySection.tsx:171-173, TranscriptSection.tsx:444-446.
  That layout effect runs before RenderedSignal's in the same commit. None of the three files uses
  `lazy(`, `use(` or `Suspense`, and neither do Transcript's imported core modules (ConfirmDialog, DialogPortal,
  useWebSocket, ime, mediaClock, sourceCapture). So no inner boundary lets RenderedSignal commit early, and no
  re-suspension re-runs the `[fileId]` layout `false` without the passive `true`.
- Inspector selection while pending (narrow forms): `selectRequest` comes only from opening and closing Find
  (useFindInFile.ts:271, 290). On close it goes back to the tab that was selected, which was listed. No load-time
  request targets a `player-side` tab, so dropping a request for an unlisted tab does not happen in normal use.
- inspector-tabs (Ask) receive no `onRendered` and are still listed only on `true`. The collection surface
  (FileDetailPresenter.tsx:135-190) always renders its Workbench, so it behaves like the canonical page.
- Providers: a context provider emits no DOM, so server HTML and the first client render are identical. Theme timing is
  unchanged: applyTheme was always in a passive effect, and layout.tsx has no inline theme script.
  Profile consumers: the progress hooks (playback, epub, pdf, text, archive) read `hasProfileRef` when the read
  actually happens, after the content loads. DriveHome re-runs on `nickname` behind a pageLoadRef guard.
  useFolderFiles and highlightStore both re-run on hasProfile. None loses the second, correct-nickname pass that the
  old remount gave them. `wroteNickname`: no child calls setNickname or clearNickname from a mount effect (the only
  caller is ProfileSection's user actions), so the guard is never used today. That is harmless.
- Tests fail without the fix: the old ProfileProvider and ThemeProvider (from `git show 016aa51a0:...`) mount their
  child twice (rt6/old-providers.rt6.test.tsx: `PROFILE mounts 2`, `THEME mounts 2`), so `mounts === 1` catches them.
  WorkbenchPendingEntry, measured: a copy with `isPending: () => false` (rt6/pending-mutant.rt6.test.tsx) fails all
  three cases. The e2e test was not run (no browser allowed). By reasoning it fails before the fix: the stored panel
  is drawn while pending, removed when the stub answers `false` at layout, then drawn again. The module-delay seam lives only in the fixture stub of `@/lib/addons`, and the rest of the path
  (SlotEntryRenderer and the hooks) is production code. Its limit is F2.

TOTAL: 3 findings
