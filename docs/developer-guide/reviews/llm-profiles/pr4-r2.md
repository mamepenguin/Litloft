# PR-4 round 2 — LLM profiles admin GUI (fix commits)

Reviewed: intelligence `56ac547fb076d7082f555740927d9c9ffa346686` (fix commits `847e583`, `cf748a1`,
`56ac547` on top of `b59f6a5`), checkout `addons/intelligence`, branch `feat/llm-profiles-gui`.
Invariants: `invariants.md` including the PR-4 r1 revision (13, 14).

Baseline at the SHA: `vitest run src/addons/intelligence/Admin` 92 passed; `tsc --noEmit` clean;
`tests/test_admin_router.py` 44 passed. `git status` of the addon clean after every mutation and at
the end.

Reproductions R1–R5 were run as a temporary vitest file in the core frontend tree (both sections
rendered against a fake server that stores what `PUT /admin/llm` receives and, like
`app/llm_routing.py:170` `_require_profile`, answers 400 when `routing.features` names a profile the
body does not have). The file was deleted afterwards.

## Verification of F1–F11

| r1 | closed? | reproducing mutation(s) | result |
|---|---|---|---|
| F1 sections overwrite each other | yes, on one page | S1 Features patches its mount-time `llm` instead of latest; S2 LLM `bodyOnto(base, base, …)`; S3 no notify; S5 Features reloads even when dirty; S8 `withFeatureChoices` ignores latest features; B1 rename does not re-point features; B9 features taken from base | all killed (`AdminLLMSettingsTogether.test.tsx`) |
| F2 missing `api_key_env` saved as `LLM_API_KEY` | yes | K1 missing key loads as `LLM_API_KEY`; K2 new profile starts `LLM_API_KEY`; K3 `null` written as `LLM_API_KEY`; K4 choice "none" maps to shared | all killed |
| F3 YAML key on legacy view | yes (warning, save not blocked, per the user) | Y1 warning never shown; Y2 warning without `legacy`; BK1 `api_key_source` not view-only (raw GET body saved back → rejected); BK2 yaml checked before env; BK3 no key → `"yaml"` | all killed |
| F4 half-success reported as failure | yes | P1 no reload after routing saved / modes failed; P2 partial message replaced by plain error; P3 LLM reload failure reported as save failure; P4 Features reload-failure message dropped; P5 LLM outcome only after reload | all killed |
| F5 unresolved saved value shown as another option | yes | V1 off-host fallback option removed; V2 missing fallback option removed; V3 missing feature profile option removed; V4 `fallbackMissing` never set; B8 `fallbackMissing` not written back | all killed |
| F6 untouched save ≠ GET | yes | M8 knobs dropped; M10 missing `offhost` → false; M11 agentic false; M12 output language `auto`; M19 saved default ignored; C12, C13, C24; B3 untouched profile rebuilt from draft; K5 (M7 analogue) `keySuffixOf` returns env unchanged | all killed |
| F7 new profile `offhost: true` | yes | M23, K2 | killed |
| F8 modes + profile together | yes | C2 modes not PUT, C7 outcome prefers `savedNow` | killed |
| F9 key-presence rules | yes | M18, C19, C21 | killed |
| F10 destinations only while matching | yes | C9 | killed |
| F11 prefix hidden from AT | yes | A1 prefix dropped from `aria-describedby`; K5 | killed |

## Mutation table

Frontend rows: one edit under `addons/intelligence/frontend/`, `vitest run
src/addons/intelligence/Admin`, then `git checkout -- .`. Backend rows (BK*): one edit in
`app/routers/admin.py`, `pytest tests/test_admin_router.py` in `intelligence-addon-test`.

| id | file | mutation | want | result |
|---|---|---|---|---|
| S1 | Features | patch onto own `llm`, not latest | kill | killed (1) |
| S2 | LLM | `bodyOnto(base, base, current)` | kill | killed (1) |
| S3 | store | no `notify` after save | kill | killed (2) |
| S4 | LLM | reload on notify even when dirty | kill | killed (1) |
| S5 | Features | reload on notify even when dirty | kill | killed (1) |
| S6 | both | listeners do not skip their own writer | live | live |
| S7 | store | `withFeatureChoices` keeps `""` entries | kill | killed (1) |
| S8 | store | `withFeatureChoices` ignores latest features | kill | killed (2) |
| S9 | store | notify before the PUT | kill | killed (2) |
| S10 | store | `resetLLMDocument` does not notify | kill | **live** (N5) |
| B1 | model `bodyOnto` | rename does not re-point features | kill | killed (1) |
| B2 | model `bodyOnto` | deleted profile's feature entries kept | kill | killed (1) |
| B3 | model `bodyOnto` | untouched profile written from draft | kill | killed (1) |
| B4 | model `bodyOnto` | untouched profile taken from base, not latest | kill | **live** (N2) |
| B5 | model `bodyOnto` | profiles present only in latest dropped | kill | **live** (N2) |
| B6 | model `bodyOnto` | `output_language` always the draft's | kill | **live** (N2) |
| B7 | model `bodyOnto` | unknown routing keys dropped | live | killed (round-trip test holds them; fine) |
| B8 | model `bodyOnto` | `fallbackMissing` not written | kill | killed (1) |
| B9 | model `bodyOnto` | features from base, not latest | kill | killed (1) |
| B10 | model `bodyOnto` | deleted profile still written | kill | killed (1) |
| K1–K5 | model | see F2 / F6 / F11 above | kill | killed |
| KE1 | ProfileFields | key-choice select ignored | kill | killed (2) |
| Y1, Y2 | LLM | see F3 | kill | killed |
| P1–P5 | both | see F4 | kill | killed |
| V1–V4 | Cards / FeatureProfileCell / model | see F5 | kill | killed |
| M8, M10, M11, M12, M19, M23 | model | as r1 | kill | killed |
| C2, C7, C9, C12, C13, C19, C21, C24 | as r1 | as r1 | kill | killed |
| M18 | model | `keyPresenceKnown` ignores a changed env | kill | killed (2) |
| A1 | ProfileFields | prefix description dropped | kill | killed (1) |
| D1 | model `isDirty` | always false | kill | killed (1) |
| D2 | model `isDirty` | always true (LLM never reloads on notify) | kill | **live** (trajectory) |
| L1 | both | never unsubscribe | live | live |
| L2 | Features | never reload on notify | kill | killed (2) |
| L3 | LLM | never reload on notify | live | live (trajectory) |
| BK1 | admin.py | `api_key_source` not view-only | kill | killed (1) |
| BK2 | admin.py | yaml checked before env | kill | killed (1) |
| BK3 | admin.py | no key → `"yaml"` | kill | killed (1) |

## Findings

### N1 — MEDIUM — [introduced] — B (A-candidate: inv 13 holds literally, the user is stuck) — a dirty Features section keeps a profile list the LLM section has since renamed or deleted, and every save of it fails

`AdminFeaturesSettingsSection.tsx:150-156`: on an LLM save the Features section skips `reloadLLM()`
when it has unsaved choices, so it keeps not only its draft (`assigned`) but also `llm` — the
profile names its select offers and the saved routing its diff is computed against.

- R1: Features → Summaries = `claude` and "When AI summary (short) runs" = on_index (unsaved). LLM
  → rename `claude` → `sonnet` → Save (200). Features → Save → `PUT /admin/llm` routing
  `{"default":"local","features":{"summaries":"claude"}}` → 400 "…names unknown profile claude".
  The mode PUT is never sent (routing goes first). Afterwards the select still offers
  `["Default (local)","local","claude (off-host)"]` — no `sonnet` — and the section is not
  reloaded, so every retry is the same 400 until the page is reloaded; the mode change cannot be
  saved at all while the choice is kept.
- R2: same with LLM → Delete `claude` → Save. Same 400, `claude (off-host)` still offered.

Nothing the user saved is undone, but the section the design keeps "safe" is now the one that
cannot save. Suggested fix (not applied): on notify, always refresh `llm`/`exposure` and keep only
the user's changed entries of `assigned` (rebase them: drop or show as "no such profile" a choice
naming a profile that no longer exists, which V3's option already renders). That removes the
Features dirty branch instead of adding one.

### N2 — MEDIUM — [introduced] — A-candidate (brief: two tabs must never undo a save) — patch-onto-latest undoes another tab's default, fallback, rename and delete

`model.ts` `bodyOnto` always writes `default` and `local_fallback` from the draft (i.e. from the
base this tab loaded), and a base profile missing from latest is re-added by the second loop
(`for (const p of draft.profiles) if (!placed.has(p.id)) …` with `entryOf` falling back to
`storedProfile(base.profiles[baseName])`).

- R3: tab B (LLM section) loads `{local, claude}`, default `local`. Tab A saves rename `claude` →
  `sonnet`, default `sonnet`, `local_fallback: local`. Tab B changes only the output language →
  Save → PUT profiles `local, sonnet, claude` (renamed profile resurrected as a duplicate), routing
  `{"default":"local"}` (tab A's default reverted, its fallback removed).
- R3b: tab A deletes `other`; tab B's unrelated save PUTs profiles `local, claude, other` — the
  deletion is undone.

The parts of the two-tab protection that do work are unheld: B4 (untouched profile taken from base
instead of latest), B5 (profiles added elsewhere dropped), B6 (output language always the draft's)
all survive, because every test has one writer per field.

Suggested fix (not applied): write only what this tab changed relative to its base — `default` /
`local_fallback` only when they differ from base; a base profile untouched in the draft and absent
from latest stays absent; a rename applies only when latest still has the base name. Add one
test with the server document changed between load and save (the fake server in
`AdminLLMSettingsTogether.test.tsx` already allows it) asserting a declared body.

### N3 — LOW — [introduced] — B — two saves in flight together lose one, and the lost one says "applied now"

`store.ts` `saveLLMPatch` is GET-latest then PUT with nothing serialising two calls. R4: Features →
Summaries = `claude`, LLM → output language `ja`, press both Saves in the same tick. Both GETs read
the old document; the LLM PUT lands second: final routing `{"default":"local"}`, output language
`ja`. The Features section shows "Saved. Profile choices are applied now." while its choice is
gone (the select then reloads to Default). The window is one GET+PUT round trip, so a user has to
be quick. Suggested fix: chain `saveLLMPatch` calls on one module-level promise so the second GET
runs after the first PUT.

### N4 — LOW — [introduced] — B — an edit made while the notify-reload is in flight is wiped

R5: LLM saves; while the Features section's `reloadLLM()` GET is pending (not dirty when the
notification arrived), the user picks Summaries = `claude`; the response lands and `applyLLM`
resets `assigned` → select back to Default, with no message. Same shape: responses are not
ordered, so a notify-reload issued before a Features save can land after that save's own
`reload()` and show the older routing. Nothing on the server is undone (the next save diffs
against what is displayed). N1's fix (rebase `assigned` on every refresh) covers this too.

### N5 — LOW — [introduced] — B — "reset notifies the other section" is unheld

S10 (`resetLLMDocument` without `notify`) survives. After "revert" in the LLM section the Features
section would keep showing the pre-reset profile choices. Suggested fix: a Together row — LLM
reset, then assert the Features select reflects the reset document.

### N6 — LOW — [introduced] — B — a reset whose reload fails says "Saved"

`AdminLLMSettingsSection.tsx:129-133` uses `t("reloadFailed")` for both kinds; the English text is
"Saved, but reloading failed…", shown after a *reset*. Suggested fix: a `resetReloadFailed` key, or
wording that does not name the action.

### N7 — LOW — [introduced] — B — after "choices saved, modes could not be saved" the mode edits are discarded from the screen

`AdminFeaturesSettingsSection.tsx:185-191` reloads after a partial save (P1 holds it), and
`reload()` resets `modes` to the server's values. The message says the modes could not be saved,
but the selections the user made are gone, so a retry means redoing them. Suggested fix: after a
partial save, refresh only the LLM half (`reloadLLM`) and keep `modes`.

### Checked, no finding

- Inv 14 / F2: every path to `api_key_env: "LLM_API_KEY"` is an explicit "LLM_API_KEY" choice or
  the legacy profile (decided). Untouched profiles are copied from latest (B3 killed), a `null`
  key is omitted (K3 killed), a new profile starts at none (K2 killed). A non-prefixed saved env is
  sent back only when the profile is edited, and the server rejects it (inv 12).
- F3 precedence: `app/config.py:1028-1030` lets the env key override YAML, matching
  `api_key_source` checking env first (BK2 killed).
- Both sections dirty, save A then B (one tab): each patch lands on the latest document; the four
  Together tests hold it.
- Listener leaks: both effects unsubscribe on unmount; L1 (never unsubscribe) is live because no
  test remounts, but the cleanup is present and a leaked listener only calls a setter on an
  unmounted component.
- A failed PUT does not notify (the `await` throws before `notify`), so no stale "saved"
  notification.

## Trajectory

Round 1 added, in one commit, a module store with a listener set and a GET before every PUT
(state + ordering), a dirty prediction in each section (`isDirty`, `sameRecord(assigned, saved)`),
`fallbackMissing` (state), a three-way key choice (state), and partial-outcome branches. `56ac547`
fixes a regression `847e583` introduced (the new view field broke raw save-back) — a fix to a
fix, small.

The store does **not replace** the two per-section loads: each section still fetches and holds its
own `view`/`llm` (`loadLLMView` is an alias of `fetchLLM`). It adds a notification channel and two
"skip when dirty" predictions on top of them. Two of the added parts are not doing work:

- The LLM section's subscription (L3, D2 live): since `bodyOnto` reads `routing.features` from
  latest, reloading the LLM section after a Features save changes nothing it displays or sends
  (it only collapses the expanded profile). Its dirty check exists only to stop that reload from
  wiping a draft. Both can be deleted.
- The Features section's dirty skip is where N1 and N4 come from: it predicts that keeping the
  stale document is safe, and the next case (rename/delete) shows it is not. Fixing N1 by adding
  another branch (e.g. "reload unless dirty, but refresh names") would be the second round in a
  row adding a prediction; rebasing `assigned` on every refresh removes the prediction instead.

N2 has the same shape inside `bodyOnto`: it predicts which fields the other writer can change and
takes those from latest, and writes the rest from base. A "write only what this draft changed vs
its base" rule would replace the per-field predictions with one.

TOTAL: 7 findings
