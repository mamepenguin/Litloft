# PR-4 round 3 — LLM profiles admin GUI (fix commit `150b7cc`)

Reviewed: intelligence `150b7cc4795272e87ba2dc4f7bb7e3f6054a5aef` on its own (parent `56ac547`),
checkout `addons/intelligence`, branch `feat/llm-profiles-gui`. Diffs read: `b59f6a5`, `847e583`,
`cf748a1`, `56ac547`, `150b7cc`. Invariants: `invariants.md` including the PR-4 r1 revision
(13, 14). Round-2 supervisor decision: one writer for `/admin/llm` (brief `pr4-fix2.md`).

Baseline at the SHA: `vitest run src/addons/intelligence/Admin` 92 passed (LLM 58, Features 7);
`tsc --noEmit` clean. Only `AdminLLMSettingsSection.tsx` / `llm-settings/api.ts` call
`saveLLM`/`resetLLM`; no other frontend file references `/admin/llm` (grep over the addon frontend
and core `frontend/src`). Backend `PUT/DELETE /admin/features` touch only `features_overrides`.

Reproductions (R*) were run as a temporary vitest file in the core frontend tree
(`frontend/src/addons/intelligence/`), deleted afterwards.

## 1. Round-2 items

| r2 | status | evidence |
|---|---|---|
| N3 two saves in flight | **closed** for what it was (two sections writing one document): the sections now write different documents (`/admin/llm` vs `/admin/features`). A second click in the LLM section is refused | N3a: Save `disabled` without `busy` → killed ("a second click while a save is in flight sends nothing"). N3b: Reset `disabled={false}` → **live** (G5) |
| N6 reset reload failure says "Saved" | **closed** | N6: `resetReloadFailed` → `reloadFailed` → killed ("reverting whose reload fails says it was reverted, not saved") |
| N1 dirty Features keeps a stale profile list | **unreachable**: the Features section holds no profile list, routing or `/admin/llm` data | N1: Features `reload()` also fetches `/admin/llm` → killed ("a save writes the modes, never /admin/llm"); grep: the only `saveLLM`/`resetLLM` caller is `AdminLLMSettingsSection.tsx:114` |
| N2 patch-onto-latest undoes another tab's save | **not unreachable** — reached in a simpler and total form. See G1 | R1: two LLM sections on one fake server. Tab A renames `claude`→`sonnet`, sets default `sonnet`, Save → PUT routing `{"default":"sonnet","features":{"rag":"sonnet"}}`, profiles `local, sonnet`. Tab B changes only the output language, Save → PUT routing `{"default":"local","features":{"rag":"claude"}}`, profiles `local, claude`, `output_language: ja`. Everything tab A saved is reverted (no duplicate profile this time, unlike r2's R3) |
| N4 edit wiped by notify-reload | the cross-section shape is **unreachable** (no notification). The same-section shape — an edit made while one's own save is in flight is wiped by the post-save reload — exists and is **[pre-existing]** since `b59f6a5` (G4) | R4: PUT held; Output language changed to `ja` while saving (selects are not disabled); PUT resolves → "Saved. Applied now.", select back to `auto`, one PUT, no message |
| N5 reset does not notify | **unreachable** in its form (Features shows no LLM data). The reverse direction exists: a Features save does not refresh the LLM section's "off" labels (G2) | R3 |
| N7 partial save discards mode edits | **unreachable**: Features is one PUT; on failure no reload runs (`AdminFeaturesSettingsSection.tsx:109-119`), on success the reload shows what was saved | P4 below; code read |

## 2. Round-1 F1–F11 after the restructure

| r1 | still meaningful? | mutation still killed | killing test |
|---|---|---|---|
| F1 sections overwrite each other (inv 13) | yes, as "one writer" | N1 (Features touches `/admin/llm`); I13a features dropped from body; I13b body features overwritten by base's; I13e unresolved id written; I13f table `onChange` ignored | Features "never /admin/llm"; LLM "feature choices save in the LLM body…", "renaming a profile carries its routing references", "deleting a profile drops…" |
| F2 key choice / missing `api_key_env` (inv 14) | yes | I14b `null` → `LLM_API_KEY`; I14c missing loads as `LLM_API_KEY`; K4 "none" → shared; KE1 key select ignored; K5 `keySuffixOf` returns env; I14e any base profile counted untouched | "key choice none saves…", "profile lan loads with key choice Do not use a key", "a new profile starts off-host and reads no key" |
| F3 YAML key notice | yes | Y1 notice never shown; Y2 notice without `legacy` | "the YAML key notice: …" |
| F4 partial-success messages | only where a save and a reload can disagree (both sections) | P3 LLM reload failure reported as save failure; P5 outcome only after reload; P4 Features reload-failure message dropped; RL no reload after save | "a save whose reload fails says it was saved", Features "a save whose reload fails still reports the save" |
| F5 stale references shown as such | yes (fallback, and feature routes now in the LLM table) | V1 off-host fallback option; V2 missing fallback option; V3 missing feature option; V4 `fallbackMissing` never set; B8 not written back; I13d missing route turned into an id | "a saved fallback naming … is shown as it is", "a saved feature naming no profile is shown as it is and saved back" |
| F6 untouched round-trip | yes | I14a untouched profile rebuilt; I14d view-only keys kept; RK unknown routing keys dropped; M19 saved default ignored; M10, M11, OL | "an untouched save sends back what GET returned" |
| F7 new profile off-host | yes | M23 | "a new profile starts off-host…" |
| F8 modes + profile in one save | **moot**: no single save covers both now | — | — |
| F9 key-presence rules | yes | M18 | "key presence: …" |
| F10 destinations only while matching | yes; the rule moved from `value === savedValue` to `effectiveProfileName` | C9 match check dropped → killed. EFF default-routed rows never resolve → **live** (G3). C9b `offhost` check dropped → live, declared live (non-off-host exposure entries carry no `drives`) | "destinations disappear once the row's choice differs…" |
| F11 prefix description for AT | yes | A1 | "the key-name input says what it saves as to assistive tech" |

New-logic rows: DIM1 off never set, DIM2 tristate `"false"` not off, DIM4 modes never read → killed; DIM3 dimming class removed → live (colour only; the label is held, which is what a reader relies on — not a finding). TBL1 empty feature list, TBL2 table shown/hidden at the wrong count, DEF default option loses its name → killed.

## 3. What this commit could have broken

- **Inv 13, new shape.** Features save sends only `PUT /admin/features` (N1 killed; the backend
  handlers write `features_overrides` only). LLM save keeps the feature choices: in the table
  (I13a/b/f killed), across a rename (REN: features named by the base name → killed), and in the
  single layout where the table is hidden (draft carries `routing.features` from GET; "deleting
  the default profile leaves the single layout…" kills I13b/I13e). An LLM save never PUTs
  `/admin/features` (asserted in "feature choices save in the LLM body…"). Holds.
- **Inv 14, new shape.** `bodyOf` writes an untouched profile as `storedProfile(base…)` (I14a,
  I14d, I14e killed); a `null` key is omitted (I14b killed). Holds.
- **Deleted `bodyOnto`, same tab twice.** R6: GET with an unknown profile field (`temperature`),
  an unknown profile (`keep: {provider, weird}`), an unknown routing key (`later_key`) and two
  feature routes. Rename `claude`→`sonnet`, Save; then change output language, Save. PUT 1 and
  PUT 2 are identical except `output_language` (`auto` → `en`); both keep `temperature`, `keep`
  with `weird`, `later_key`, and `rag: sonnet` / `summaries: keep`. When the reload after save 1
  fails, `view` stays the old base and the draft stays the user's: a renamed/edited profile is
  "touched" and written from the draft, the rest from the old base — the same body as save 1.
  Nothing is lost in one tab. Top-level keys other than `profiles`/`routing`/`output_language`
  are not modelled by `LLMUpdate` on the server either (`admin.py` `LLMUpdate`), so the body
  cannot lose one.
- **Two tabs.** Lost wholesale — G1.
- **`removeProfile` without a features filter.** Redundant, confirmed. R2 (three profiles,
  `rag: claude`, delete `claude`): the select's value is `p1` with no matching option; React
  selects the first non-disabled option, so it reads "Default (local)" (`selectedIndex 0`), and
  the PUT routing is `{"default":"local"}` because `bodyOf` drops a route whose id resolves to no
  profile (I13e killed). Restoring the filter (RM1) is live — equivalent, as declared. Ids are
  never reused (`new${seq}`), so a stale `{id}` cannot attach to a later profile.
- I13c (`setFeatureRoute("")` stores `{id:""}` instead of deleting) is live and equivalent for the
  same reason: `bodyOf` drops it.

## Mutation table

One edit under `addons/intelligence/frontend/`, `pnpm exec vitest run src/addons/intelligence/Admin`
from core `frontend/`, then `git checkout -- .`. `git status` clean after the run.

| id | file | mutation | want | got |
|---|---|---|---|---|
| N3a | LLM section | Save `disabled` ignores `busy` | kill | killed (1) |
| N3b | LLM section | Reset `disabled={false}` | kill | **live** (G5) |
| N6 | LLM section | reset reload failure uses `reloadFailed` | kill | killed (1) |
| N1 | Features | `reload()` also GETs `/admin/llm` | kill | killed (1) |
| I13a | model `bodyOf` | `features` never written | kill | killed (4) |
| I13b | model `bodyOf` | base `routing.features` overwrite the draft's | kill | killed (4) |
| I13c | model `setFeatureRoute` | `""` stored as `{id:""}` | kill | live — equivalent (declared live on re-run) |
| I13d | model `draftFromView` | missing route turned into `{id:""}` | kill | killed (1) |
| I13e | model `bodyOf` | unresolved id written as the id | kill | killed (2) |
| I13f | LLM section | table `onChange` ignored | kill | killed (3) |
| I14a | model `bodyOf` | untouched profile rebuilt from draft | kill | killed (1) |
| I14b | model `profileBody` | `null` key → `LLM_API_KEY` | kill | killed (3) |
| I14c | model `profileDraft` | missing key loads as `LLM_API_KEY` | kill | killed (3) |
| I14d | model `storedProfile` | view-only keys kept | kill | killed (2) |
| I14e | model `bodyOf` | every base profile counted untouched | kill | killed (6) |
| RK | model `bodyOf` | unknown routing keys dropped | kill | killed (1) |
| OL | model `bodyOf` | output language from base | kill | killed (2) |
| K4 | model `keyEnvFor` | "none" → `LLM_API_KEY` | kill | killed (1) |
| KE1 | ProfileFields | key-choice select ignored | kill | killed (2) |
| K5 | model `keySuffixOf` | returns the env unchanged | kill | killed (1) |
| Y1 | LLM section | YAML notice never shown | kill | killed (1) |
| Y2 | LLM section | YAML notice without `legacy` | kill | killed (1) |
| P3 | LLM section | reload failure rethrown as save failure | kill | killed (2) |
| P5 | LLM section | outcome only after reload | kill | killed (1) |
| P4 | Features | reload-failure message dropped | kill | killed (1) |
| RL | LLM section | no reload after save | kill | killed (1) |
| V1 | Cards | off-host fallback option removed | kill | killed (1) |
| V2 | Cards | missing fallback option removed | kill | killed (1) |
| V3 | FeatureRoutingTable | missing feature option removed | kill | killed (1) |
| V4 | model | `fallbackMissing` never set | kill | killed (1) |
| B8 | model `bodyOf` | `fallbackMissing` not written | kill | killed (1) |
| M10 | model | missing `offhost` → false | kill | killed (2) |
| M11 | model | agentic always false | kill | killed (2) |
| M19 | model | saved default ignored | kill | killed (1) |
| M23 | model `nextProfile` | new profile `offhost: false` | kill | killed (1) |
| M18 | model `keyPresenceKnown` | ignores a changed env | kill | killed (2) |
| A1 | ProfileFields | prefix dropped from `aria-describedby` | kill | killed (1) |
| C9 | FeatureRoutingTable | destinations regardless of the row's choice | kill | killed (1) |
| C9b | FeatureRoutingTable | `offhost` check dropped | live | live |
| EFF | model `effectiveProfileName` | default-routed row → `undefined` | kill | **live** (G3) |
| REN | model `bodyOf` | feature named by its base name | kill | killed (3) |
| RM1 | model `removeProfile` | also filter features naming the id | live | live |
| DIM1 | FeatureRoutingTable | `off` always false | kill | killed (2) |
| DIM2 | api `fetchOffFeatures` | only boolean `false` is off | kill | killed (1) |
| DIM3 | FeatureRoutingTable | dimming class removed | kill | live (colour only; not a finding) |
| DIM4 | LLM section | modes never read | kill | killed (2) |
| TBL1 | LLM section | table given no features | kill | killed (8) |
| TBL2 | LLM section | single layout at ≤2 profiles | kill | killed (35) |
| DEF | FeatureRoutingTable | default option without the name | kill | killed (1) |

## Findings

### G1 — MEDIUM — [introduced vs `56ac547`; same as `b59f6a5`] — raise to supervisor (B if two tabs are out of scope; C if they are in) — a save from a second tab reverts everything the first tab saved

N2 was a two-*tab* finding, not a two-section one, so it does not go away with one writer. With
`bodyOnto` deleted, `bodyOf(base, draft)` writes the whole document from the tab's own load. R1:
tab A's rename, default and feature re-point are all reverted by tab B's unrelated output-language
save, with "Saved. Applied now." in both tabs. At `56ac547` the same sequence reverted the default
and resurrected the renamed profile as a duplicate but kept the features (r2 R3); at `b59f6a5` it
was this same whole-document overwrite. The brief's "N2 goes away with the second writer" does not
hold.

Nothing in invariants 1–14 names tabs (13 is about sections), so this is not an A by the declared
list. If the supervisor wants it covered, the shape that adds no prediction is a version check
on the server: `GET /admin/llm` returns the overrides file's `updated_at` (already written by
`write_profiles`), the PUT carries it, and a mismatch answers 409 "changed elsewhere, reload". That
is one branch, server side, replacing any merge.

### G2 — LOW — [introduced] — B — a Features save does not refresh the "Off (Feature toggles)" labels in the LLM section

`offFeatures` is read only by the LLM section's own `reload()` (mount, its save, its reset). R3:
both sections on one page; Features → "When AI question answering (Ask) runs" = off → Save
("Saved. Restart required…"); the LLM table's `rag` row still has no "Off" label until the page
reloads or the LLM section saves. Nothing is saved wrong. Suggested: leave it (record only) —
the fix that refreshes it is the cross-section notification this round removed.

### G3 — LOW — [introduced] — B — destinations for an off-host feature routed by the default are unheld

`effectiveProfileName` is new: for a row with no explicit route it resolves the draft's default.
Mutant EFF (always `undefined` for such rows) survives because every destinations test routes the
feature explicitly. Real behaviour is right — R5: default `claude` (off-host), no
`routing.features`, exposure for both features on `claude` → two destination lists; switching the
default select to `local` → zero. This is the common "everything to one cloud profile" setup.
Suggested: one row in the existing destinations test with the routing `{default: "claude"}` and no
`features`.

### G4 — LOW — [pre-existing since `b59f6a5`] — B — an edit made while a save is in flight is discarded without a message

`run()` awaits the PUT and then `reload()`, which replaces the draft with `draftFromView(next)`;
the inputs and selects are not disabled while `busy`. R4: Output language changed during the PUT
→ after "Saved. Applied now." it reads `auto` again and nothing was sent. The window is one PUT
plus one GET. Suggested: disable the editing controls while `busy !== null`, or ledger it.

### G5 — LOW — [pre-existing since `b59f6a5`] — B — "Reset is refused while a save is in flight" is unheld

The code disables Reset on `busy !== null` (`AdminLLMSettingsSection.tsx:259`), but N3b
(`disabled={false}`) survives: the new double-click test presses Save only. A reset racing a save
would let whichever request lands last decide whether overrides exist while the screen reports
the other. Suggested: in the same test, assert the Reset button is disabled while the PUT is held
(needs `overrides_present: true` in that GET).

### Checked, no finding

- Japanese and English message files have the same keys; every key the new code uses exists
  (`resetReloadFailed`, `routing.featureOff`, `features.profilesNote`, `routing.columns.*`,
  `routing.profile*`). Every `LLM_FEATURES` name has a `settings.features.fields.<name>.label`.
- `fetchOffFeatures` failing leaves `offFeatures` `null`: no row is labelled off, the table still
  works (the GET is `.catch(() => null)`).
- A route naming a missing profile in the single layout cannot be changed there (the table is
  hidden) and the save sends it back, which the server rejects; same for `fallbackMissing`. This
  was already so at `56ac547` (`bodyOnto` kept unknown names) and the user can add a second
  profile to reach the table. Not raised.
- Layout of the table inside the routing card (column widths, overflow at phone width) was not
  judged: jsdom lays nothing out.

## 4. Trajectory

Read in order: `b59f6a5` (GUI, two sections each writing `/admin/llm` from their own load) →
`cf748a1` (added a module store with a listener set and GET-before-PUT, two subscriptions, two
"skip when dirty" predictions, `bodyOnto`'s per-field predictions about which fields the other
writer owns, `fallbackMissing`, three-way key choice, Features partial-outcome branches) →
`56ac547` (small backend fix to a fix) → `150b7cc`.

`150b7cc` is +530/−902. It **removes** `store.ts` (module state, listeners, notify ordering), both
subscriptions, `isDirty` and the Features `sameRecord`/`changedEntries` dirty predictions,
`bodyOnto` with its rename/delete mapping against a re-fetched document, the Features `llm`/
`exposure`/`assigned` state, the Features outcome variants `savedNow`/`savedRestart` and the
partial-save branch, `FeatureProfileCell`, and the two-section test file. It **adds** a
`FeatureRoute` union in the draft (`{id}` | `{missing}`, replacing name strings, and the reason
renames and deletions need no mapping now), `effectiveProfileName` (replaces `value ===
savedValue`, and now also notices a changed default), `offFeatures` state (the user's requested
label), and one branch for the reset-reload message (N6). Every addition is a replacement or a
requested feature; none handles a case the previous round failed to anticipate. This round
removed more branches, state and predictions than it added: **the design converged** for the
one-page, one-tab case.

What remains open is not a patching trail but a scope question the restructure exposed: two tabs
(G1). The previous merge did not solve it either; deciding whether it is in scope, and if so
answering it with a server-side version check rather than a client merge, is the supervisor's
call.

TOTAL: 5 findings
