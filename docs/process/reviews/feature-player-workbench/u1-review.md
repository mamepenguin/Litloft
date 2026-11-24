# Review: intelligence 958ddf6 (diff b3bed32..958ddf6), SPEC-ADDON-099

Threat model: personal tool, single user. A = silently wrong in normal use.

## Findings

### 1. Scenes that is on when it mounts (or when the file changes) never reports `true` again: it disappears and its toggle never comes back
- Where: frontend/ScenesSection/ScenesSectionContainer.tsx:129-131 (layout-effect `false`), :193 (availability fetch skipped when `hostShowsRef.current`), :245-249 (`loadNative` on active), :251-263 (on active->false, `requestGeneration += 1` discards the in-flight response).
- What goes wrong: when the host mounts Scenes with `active: true` (Scenes is in the stored list `L` and its availability is still unanswered, which counts as available), the sequence is: layout effect reports `false` -> host hides it -> `active` becomes `false`. Meanwhile the mount effect skipped the availability request (because `hostShowsRef` was true) and the active effect started `loadNative`. The active->false transition then bumps `requestGeneration`, so `loadNative`'s response is dropped by the generation check and `onAvailability(true)` is never called. Nothing re-requests: the file-change effect's deps do not change and the active effect needs `hostShows`. Scenes stays `false` for this mount. Per SPEC-CORE-085 terms (shown = on and not answered false) and "Each has a toggle only when it has something to show" (I10), the panel and its toggle vanish. Because `L` still holds `scenes`, the same thing happens on every later page load and on every next-file navigation. The reader cannot turn Scenes on again, or turn it off, from the UI.
- Condition: the reader turns Scenes on, then opens another video (next file, or reload). The same happens in the narrow form when the Scenes tab is the selected tab in an open inspector at mount or file change.
- Frequency 8, impact 8: a feature is gone with no UI path back. It is noticeable that Scenes is missing, but nothing says why.
- Evidence: a scratch harness (outside the repo) with a host that follows the spec (`active = on && availability !== false`, stable reporter, availability reset on file change) rendering the real `ScenesSection`. Config: /private/tmp/claude-502/-Users-libre-Sources-video-share/61e623b8-c332-4378-bd97-679da1c13a63/scratchpad/rt/vitest.config.ts, test: .../scratchpad/rt/scenes.rt.test.tsx.
  - Mount with on=true: reports `[false]` only, 1 clip-timestamps call, availability ends `false`.
  - Next file with on=true: reports `[false]` only, 1 call, availability ends `false`.
  - The same harness with on=false: reports `[false,true,false,true]`, correct.
- Why the acceptance tests miss it: ScenesSectionPanel.test.tsx drives `active` as a fixed prop and never feeds the component's own `false` back into `active`. The "answers false on mount" and "one request before first active" cases use `active: false` only. The labelledByHost case mounts with `active: true` and checks only that the slider renders; it never checks that `true` was reported.
- Fix direction: the availability request has to survive an active->false flip, or the mount/file-change availability request has to be sent unconditionally (at most one per mount and file, which I10 allows) on its own generation counter, separate from `requestGeneration`.

- Addendum to 1: a `.loft` hits the same failure. Its mount request runs on the file-change generation, and the active->false bump at :260 discards it. Harness: "loft on at page load" reports `[false]` only and ends `false`. Toggling on from off works (`[false,true,true]`), so the failure needs `active: true` at mount or at a file change.

### 2. Detailed summary reports `true` but draws nothing when a knowledge note is the active summary and no AI summary exists
- Where: frontend/DetailedSummarySection.tsx:176-181 (`canShow` is true on `hasActiveSummary` alone), against the render at :477 (`!data?.available && !status && !reason` -> `return null`) and :549 (`!data?.available` -> `return null`). The dormant line (:852) lives inside `DetailedSummaryBody`, which is reached only when `data.available`.
- What goes wrong: SPEC-ADDON-099 step 3 says the summary reports `true` only when it draws the generating row, the failed row, the dormant line or a body. Here the component reports `true` and renders `null`. The host gives it a toggle, and turning it on shows an empty card with only the host's label. The same happens with `hasActiveSummary` plus `insufficient_content`: it reports `true` and draws the "not enough content" line, which the spec counts as nothing to show.
- Condition: a video whose active summary is a knowledge note the reader wrote or chose, with no AI detailed summary generated (or with too little content for one).
- Frequency 3, impact 3: an empty panel and a toggle that leads nowhere; the reader can turn it off.
- Evidence: code path above. `canShow` should require what the render actually draws, for example `hasActiveSummary && data?.available`, with the insufficient case excluded.

### 3. The dormant state draws its own "AI Detailed Summary" heading under the host's label
- Where: frontend/DetailedSummarySection.tsx:852-858. The `labelledByHost` branch was added only to the body header (:911); the dormant branch still renders its own `<h2>` title.
- What goes wrong: with `labelledByHost`, the panel shows the host's "Detailed summary" label and then a second "AI Detailed Summary" heading. I10 says "With `labelledByHost`, neither draws its own header".
- Condition: a video whose knowledge note is the active summary and whose AI summary exists, with the panel on.
- Frequency 3, impact 1 (cosmetic duplicate title).
- Evidence: code path. No test covers dormant with `labelledByHost`.

### 4. With `labelledByHost`, the Visual Index progress, spinner and scene count are no longer drawn anywhere
- Where: frontend/ScenesSection/ScenesSectionPresenter.tsx:170-218. The whole header button is dropped under `labelledByHost`. `visual.count`, `visual.progress` ("3 / 10", Processing/Updating) and `visual.spinner` (built at ScenesSectionContainer.tsx:709-714) were rendered only inside that button. The body (:220-358) never reads them.
- What goes wrong: in the panel, after the reader presses **Create scenes**, the model enters row 1 (staged in flight, no active run): no action, no note, no marks. The action row disappears and nothing shows that a run is in progress, for the minutes it takes. In row 2 the "Updating n / m" text and the count also disappear. The spec only asks for no header button and no collapse; it does not ask to drop the run status, and `## Checked, no action` does not list it.
- Condition: generating or regenerating the Visual Index from the Scenes panel.
- Frequency 3, impact 3: the reader cannot tell whether the click did anything. The marks appear when the run finishes.
- Evidence: code path. No test renders a staged/progress state with `labelledByHost`.

### 5. Detailed summary applies a response for an earlier file, which now also drives availability (pre-existing race, newly consequential)
- Where: frontend/DetailedSummarySection.tsx:191-196 (`fetchData` sets `data`/`loaded` with no fileId or generation check), called from the file-change effect :203-227 and the WS effect :239-243. `pollUntilDone` has a token; `fetchData` does not.
- What goes wrong: if the previous file's GET resolves after the file change, its data is shown for the new file and `canShow` is computed from it. If it resolves after the new file's response, the old file's summary stays on screen for the new file and the reported availability follows the old file. SPEC-ADDON-099 states "applies no response for another file" only for Scenes, but the same failure now reaches the host's toggle.
- Condition: pressing next/previous twice quickly, or a slow response for the first file. On a LAN, out-of-order responses are rare.
- Frequency 1, impact 8 (silently the wrong summary for the open file).
- Evidence: code path. The race predates this diff; the diff adds `onAvailability(canShow)` on top of it.

### 6. Tests that pass without showing what they claim
- frontend/ScenesSection/__tests__/ScenesSectionPanel.test.tsx (b3bed32), "draws no header or collapse of its own when the host labels it, and shows its body while active": it mounts with a fixed `active: true` that never reacts to the component's own `false`. It passes while finding 1 makes the same scenario fail under a spec-conforming host. No acceptance or implementation test closes the loop (onAvailability -> active).
- frontend/DetailedSummaryPanel.test.tsx (b3bed32), "answers true for the dormant line": it uses `generated` (available) data, so it cannot catch finding 2 (active summary plus no AI summary). Nothing tests dormant with `labelledByHost` (finding 3).
- frontend/DetailedSummaryPanelStates.test.tsx:118-142: the "absent" key-binding row passes `labelledByHost: true` (which forces expanded). It does not exercise the real file-detail-sections case (no `active`, no `labelledByHost`, collapsed by default). The keys there are still gated by `collapsed` as before, so this is a coverage gap, not a defect.
- Frequency/impact: these are detector gaps for findings 1-3; score them with those findings.

### 7. Places the diff reaches that Touch points does not name
- frontend/DetailedSummaryPanelStates.test.tsx (new test file). Touch points names `frontend/DetailedSummarySection.tsx` and the `ScenesSectionManifest` test, not this file.
- frontend/ScenesSection/__tests__/ScenesSectionRequests.test.tsx, ScenesSectionSeek.test.tsx and helpers.tsx are covered by `frontend/ScenesSection/*`. TranscriptSection.tsx, messages and manifest.json are named.
- Frequency 0, impact 1 (bookkeeping only).

## Checked, no finding
- Detailed summary window keys: both the `useShortcuts` Escape and the window keydown listener are gated on `active !== false` (:768, :772). With `active` absent, the behaviour is as before (still gated by `collapsed`). No other window listener in the file.
- Regression with no new props: Scenes with no `active`/`onAvailability` takes `panel = false`, so a native video sends no mount request and the header/expand path is unchanged. The manifest no longer puts `scenes` in `file-detail-sections`. Detailed summary in `file-detail-sections` (no `active`) keeps its header, collapse and key gating.
- Scenes native request counts: off at mount gives 1 `clip-timestamps` and no visual-index or pictures (confirmed in the harness: `calls 2` across two files while off). Each activation gives `clip-timestamps` plus `visual-index`, as revised SPEC-ADDON-089 I6 allows. Pictures are requested only in view `expanded`, which needs `shown`.
- Scenes fileId races: the mount, `loadNative`, action and visual paths are all guarded by `requestGeneration`/`visualGeneration`, and file change bumps both.
- Transcript: `active` re-keys `isHidden`. That re-runs the mount put-back effect on each `active` change, but its cleanup-then-setup pair saves before it recalls, so `following` and the place are preserved. All 90 Transcript tests pass.
- All 15 touched test files pass at 958ddf6 (371 tests): `pnpm exec vitest run src/addons/intelligence/DetailedSummaryPanel src/addons/intelligence/ScenesSection src/addons/intelligence/TranscriptSection.test.tsx src/addons/intelligence/DetailedSummary`.

TOTAL: 7 findings
