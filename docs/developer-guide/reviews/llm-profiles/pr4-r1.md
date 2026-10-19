# PR-4 round 1 — LLM profiles admin GUI

Reviewed: intelligence `b59f6a522281bc92ceb510a5c538906bbe0469df` (parent `b00539a`), checkout
`addons/intelligence` on `feat/llm-profiles-gui`. Tests: `pnpm exec vitest run
src/addons/intelligence/Admin` (57 green at the SHA), `pnpm exec tsc --noEmit`.

## Touch points reached that are not in the list

The list names `frontend/AdminLLMSettingsSection.tsx` and `frontend/AdminFeaturesSettingsSection.tsx`
and `/admin/llm`, `/admin/features`. The diff also reaches:

1. **`GET /admin/llm/exposure`** — read by both sections (destinations, off-host-only warning). Not
   listed; it is read-only, so no write invariant, but it is the only input to the spec-13 warning.
2. **`PUT /admin/llm` from the Features section.** The list pairs the Features section with
   `/admin/features`; it now also writes the whole profiles+routing document (`profiles:
   llm.profiles` from its own mount-time GET). Two independent writers of one document on one page
   (`admin-intelligence-sections` stacks `admin-features` then `admin-llm`,
   `addons/intelligence/manifest.json`). This is where F1 lives.
3. **The key-env default for a profile that has no `api_key_env`** (`llm-settings/model.ts`
   `keySuffixOf`/`keyEnvOf`). `app/llm_routing.py` `_build_profile` deliberately gives such a profile
   *no* key (PR-1 r2 F2d / r5 V11); the GUI's round-trip turns it into `LLM_API_KEY`. Inv 12 is met
   literally but the PR-1 decision it sits beside is not in the list. F2.
4. **YAML `llm.api_key` on the legacy view.** `_llm_view` reports `api_key_present` from
   `base.api_key` (YAML or env); a profile saved by the GUI reads the env only. Inv 4's
   "first save changes nothing" crosses this. F3.

Candidates for a missing invariant: (2) "a save from one section does not revert what the other
section saved", (3) "a profile the GUI did not touch keeps its key source".

## Mutation table

Each row: one edit, `vitest run src/addons/intelligence/Admin`, then `git checkout -- .`. Files are
under `addons/intelligence/frontend/`.

| id | file | mutation | want | result |
|---|---|---|---|---|
| M1 | model.ts `removeProfile` | deleting the default keeps `defaultId` | kill | killed (1) |
| M2 | model.ts `removeProfile` | deleting the fallback keeps `fallbackId` | kill | live — equivalent: `bodyFromDraft` drops ids it cannot name (B) |
| M3 | model.ts `removeProfile` | deleting keeps feature entries pointing at it | kill | live — equivalent, same reason (B) |
| M4 | model.ts `updateProfile` | turning the fallback off-host no longer clears it | kill | killed (1) |
| M6 | model.ts `keyEnvOf` | empty suffix → `LLM_API_KEY_` | kill | killed (2) |
| M7 | model.ts `keySuffixOf` | return env unchanged (untouched `LLM_API_KEY_CLAUDE` saves as `LLM_API_KEY_LLM_API_KEY_CLAUDE`) | kill | **live** (F6) |
| M8 | model.ts `bodyFromDraft` | drop `...p.extra` (profile knobs like `temperature`) | kill | **live** (F6) |
| M9 | model.ts `bodyFromDraft` | drop `routing.extra` | kill | live — backend ignores unknown routing keys (B) |
| M10 | model.ts `profileDraft` | missing `offhost` → `false` | kill | **live** (F6, inv 3) |
| M11 | model.ts `profileDraft` | `agentic` always false | kill | **live** (F6) |
| M12 | model.ts `draftFromView` | `outputLanguage: "auto"` | kill | **live** (F6) |
| M13 | model.ts `drivesLeftWithoutAI` | drop the one-profile condition | kill | killed (1) |
| M14 | model.ts `drivesLeftWithoutAI` | count every destination, not only `skips` | kill | killed (1) |
| M15 | model.ts `invalidOf` | drop duplicate check | kill | killed (1) |
| M16 | model.ts `invalidOf` | drop key-suffix check | kill | killed (1) |
| M17 | model.ts `invalidOf` | drop name check | kill | killed (1) |
| M18 | model.ts `keyPresenceKnown` | always true | kill | **live** (F9) |
| M19 | model.ts `draftFromView` | ignore saved `routing.default`, take first profile | kill | **live** (F6) |
| M20 | model.ts `bodyFromDraft` | never write `local_fallback` | kill | killed (1) |
| M21 | model.ts `bodyFromDraft` | always write `features` (even `{}`) | kill | killed (3) |
| M22 | model.ts `nextProfile` | name counter starts at 1 | kill | live (B, cosmetic) |
| M23 | model.ts `nextProfile` | new profile `offhost: false` | kill | **live** (F7) |
| C1 | Cards.tsx | fallback select lists every profile | kill | killed (1) |
| C2 | Features | both modes and profile changed → modes not PUT | kill | **live** (F8) |
| C3 | Features | nothing changed → no PUT | kill | live (B) |
| C4 | Features | keep `""` (default) assignments in `features` | kill | killed (1) |
| C5 | Features | drop `default`/`local_fallback` from the routing it saves | kill | killed (1) |
| C6 | Features | drop `output_language` from the routing save | kill | killed (1) |
| C7 | Features | outcome prefers `savedNow` over `savedRestart` | kill | **live** (F8) |
| C8 | Features | profile column with one profile | kill | killed (1) |
| C9 | FeatureProfileCell | show destinations after the choice changed | kill | **live** (F10) |
| C10 | FeatureProfileCell | show destinations for a local profile | kill | live (F10; exposure has no `drives` for local, so near-equivalent) |
| C11 | FeatureProfileCell | swap `falls_back`/`skips` order | kill | killed (1) |
| C12 | FeatureProfileCell | `(off-host)` label only when `offhost === true` (missing key → plain name) | kill | **live** (F6, inv 3) |
| C13 | FeatureProfileCell | "Default (x)" ignores `routing.default` | kill | **live** (F6) |
| C14 | Features | profile select on non-LLM rows | kill | killed (1) |
| C15 | LLM | save enabled while invalid | kill | killed (3) |
| C16 | LLM | drop `aria-describedby` to the reason | kill | live (B) |
| C17 | LLM | single layout up to 2 profiles | kill | killed (10) |
| C18 | ProfileFields `KeyPresence` | show presence for a changed suffix | kill | **live** (F9) |
| C19 | ProfileFields `KeyPresence` | drop the Ollama "not needed" branch | kill | **live** (F9) |
| C20 | ProfileList | delete aria-label not entity-specific | kill | killed (1) |
| C21 | ProfileList `Summary` | never show the collapsed-row key warning | kill | **live** (F9) |
| C23 | ProfileFields | off-host switch does nothing | kill | killed (1) |
| C24 | ProfileFields | agentic switch does nothing | kill | **live** (F6) |
| C25 | LLM | outcome ignores `restart_required` | kill | killed (1) |
| C26 | LLM | revert button without overrides | kill | killed (1) |
| C27 | LLM | never fetch exposure | kill | killed (1) |
| C28 | Features | exposure failure rejects the whole load | live | live (Features tests never fail exposure; B) |

`pnpm exec tsc --noEmit`: clean at the SHA. `git status` of the addon clean after every row.

## Findings

Reproductions F1, F2, F5 were run as a temporary vitest file (both sections rendered together
against a fake server that stores what `PUT /admin/llm` receives), then deleted.

### F1 — HIGH — [introduced] — A (inv 8 / inv 1) — the two sections overwrite each other's saves

`AdminFeaturesSettingsSection.tsx:130-139` PUTs `profiles: llm.profiles` and the rest of
`llm.routing` from its own mount-time GET; `AdminLLMSettingsSection.tsx:109` PUTs its draft, whose
`routing.features` also came from its mount-time GET. Both sit on one page
(`admin-intelligence-sections`, `layout="stack"`) and neither reloads after the other saves.

Reproduction (both sections rendered, profiles `local` (off-host false) + `claude`):
- F1a: Features → "Profile for AI summary (short)" = claude → Save (PUT routing
  `features: {summaries: "claude"}`). Then LLM section → change output language → Save. Second PUT
  routing = `{"default":"local"}`: the summaries assignment is silently reverted.
- F1b: LLM section → edit `local` → turn "Send off-host" on → Save (PUT `local.offhost: true`). Then
  Features → change a profile select → Save. Second PUT `local.offhost: false`: the off-host
  declaration the user just made is flipped back, so `local` is again used on `llm_cloud: false`
  drives (inv 1 through the GUI).
- F1c: LLM section renames `claude` → `sonnet` and saves; a later Features save PUTs profiles
  `[local, claude]` — the rename is undone, and any profile added in between is deleted.

Suggested fix: one owner of the document. Either the Features section sends only a routing patch the
backend merges (a `PUT /admin/llm/routing/features`), or each section re-GETs `/admin/llm` just before
building its PUT and the PUT carries a version/etag the backend checks (409 on mismatch). Re-reading
alone still loses an edit the other section has in its unsaved draft, so the version check is the
part that holds.

### F2 — HIGH — [introduced] — A-candidate (PR-1 r2 F2d / r5 V11 decision; inv 12 met literally) — a profile with no `api_key_env` is saved with `LLM_API_KEY`

`model.ts:60-62` maps a missing `api_key_env` to suffix `""`, and `model.ts:56-58,197` writes `""`
as `LLM_API_KEY`. `nextProfile` (`model.ts:126`) also starts every new profile at `""`.
`app/llm_routing.py` `_build_profile` gives a profile without `api_key_env` no key at all, a choice
PR-1 made on purpose (a profile must not inherit another endpoint's key).

Reproduction: GET profiles `lan: {provider: openai_compatible, base_url: http://lan:8000/v1,
offhost: false}` (no `api_key_env`) + `claude`; press Save without touching anything → PUT
`lan.api_key_env = "LLM_API_KEY"`. From then on the shared cloud key goes as `Authorization: Bearer`
to the LAN server (`app/llm.py:456`, `api_key=config.api_key or "not-needed"`). The same for any
profile a user adds and leaves the key field empty: the prefix shown is `LLM_API_KEY_` with an empty
box, which reads as "no key", but saves as the shared key. Ollama is unaffected (its client sends no
key).

Suggested fix: keep "no key" representable — a draft `keyEnv: string | null`, `null` omitted from
the body; the empty box means "none" and an explicit choice (e.g. a "use LLM_API_KEY" option) means
the shared key. Add a round-trip row: a profile without `api_key_env` saves without it.

### F3 — MEDIUM — [pre-existing in `_llm_view`/PUT, made reachable by this GUI] — A (inv 4) — the legacy view shows the YAML key as present, and the first save drops it

`app/routers/admin.py` `_llm_view` legacy branch reports `api_key_present: bool(base.api_key)`,
where `base` merges YAML `llm.api_key` (documented in `search-config.yml.example:118` and
`docs/addons/intelligence.md:351`). After the GUI saves, `_build_profile` reads the key from
`environ["LLM_API_KEY"]` only. The single layout (`ProfileFields.tsx` `StaticKey` → `KeyPresence`)
shows "Set" because `savedKeyEnv === "LLM_API_KEY"`, so an install keeping its key in YAML presses
Save on the unchanged legacy view and every openai_compatible call starts failing without a key.
Inv 4 "saving the legacy view unchanged keeps … api key" does not hold for that install.

Suggested fix (raise rather than excavate): the view says where the key came from
(`api_key_source: "env" | "yaml"`), and the single layout shows "from search-config.yml — move it
to LLM_API_KEY before saving" and keeps Save disabled until then; or the backend refuses a PUT that
would drop a YAML-only key.

### F4 — MEDIUM — [introduced] — A-candidate — a save that half-succeeded is reported as a failure

`AdminFeaturesSettingsSection.tsx:130-145`: routing PUT succeeds and is applied at once, then the
modes PUT (or the `reload()`) throws → only "Save failed" is shown, the page is not reloaded, and the
routing that is now live is presented as unsaved. `AdminLLMSettingsSection.tsx:108-113` has the same
shape for `saveLLM` then `reload()`: a successful save followed by a failed GET shows "Could not
save" while the new profiles are already routing jobs. Nothing is left inconsistent on the server
(modes and routing are independent documents), but the user is told the opposite of what happened
and a retry resends stale state (see F1).

Suggested fix: report each write separately ("Profile choices saved; modes could not be saved: …")
and reload after any write that succeeded, even when a later step failed.

### F5 — LOW — [introduced] — B — a saved reference that matches no option is displayed as another choice

`Cards.tsx:94-106`: when the saved `local_fallback` names an off-host profile (the error view the
section is meant to repair), `draftFromView` keeps its id but the select has no such option, so the
DOM shows the first local profile. Reproduction: GET routing `local_fallback: "claude"` with
`error: "…must be offhost: false"` → the select reads "local" (DOM value `p0`) while the draft still
holds `claude`; Save → the same 400. The user sees the fix already applied. The Features cell has
the same shape for a `routing.features` name that no longer exists
(`FeatureProfileCell.tsx:65-77` shows "Default (x)").

Suggested fix: in `draftFromView`, drop a fallback that is not local (and feature names that do not
resolve) so the draft matches what is displayed and the first Save repairs it; or render the stale
value as a disabled option.

### F6 — MEDIUM — [introduced] — A (tests let inv 3 / inv 4 through) — nothing asserts that an untouched save reproduces the GET

Live: M7 (untouched `LLM_API_KEY_CLAUDE` saved as `LLM_API_KEY_LLM_API_KEY_CLAUDE`, which passes the
backend regex and silently loses the key), M8 (profile knobs such as `temperature` dropped), M10
(a profile without `offhost` saved as `offhost: false` — inv 3, the one mutation here that sends
content off-host), M11 / C24 (agentic lost / switch inert), M12 (`output_language` reset to `auto`),
M19 (saved `routing.default` ignored), C12 (missing `offhost` labelled local in the Features select),
C13. The legacy-save test uses a fixture where every one of these coincides with the mutant
(`agentic: false`, `output_language: "auto"`, explicit `offhost`, `api_key_env: "LLM_API_KEY"`, no
knobs).

Suggested fix: one parametrized round-trip table in `AdminLLMSettingsSection.test.tsx` — GET a view
whose profiles cover {no `offhost`, `agentic: true`, `api_key_env: LLM_API_KEY_X`, no
`api_key_env`, an extra knob}, routing default = the second profile, `output_language: "ja"`; press
Save untouched; `toEqual` a declared body (not one built from the fixture). Add one Features row for
a profile without `offhost`.

### F7 — MEDIUM — [introduced] — A (test lets inv 1 through) — a new profile's `offhost: true` default is not held

`model.ts:124` `offhost: true` is what keeps a just-added cloud profile off `llm_cloud: false`
drives; M23 (`offhost: false`) survives. Suggested fix: after "Add profile" → Save, assert the new
profile's body (`offhost: true`, and whatever F2 decides for the key).

### F8 — MEDIUM — [introduced] — A-candidate — changing modes and a profile together is untested

C2 (modes not PUT when a profile also changed) and C7 (outcome says "applied now" when a restart is
needed) both survive. The code handles it (`AdminFeaturesSettingsSection.tsx:141,143`), nothing
holds it. Suggested fix: one test changing both; assert both PUTs and the restart message.

### F9 — LOW — [introduced] — B — key-presence display rules are unheld

M18 / C18 (presence shown for a suffix the user just typed — the implementer's declared deviation),
C19 (Ollama "not needed" text), C21 (collapsed-row key warning) survive. User-visible: a wrong "Set"
next to a changed variable name. Suggested fix: a row table on `KeyPresence` over
(suffix changed?, present?, provider).

### F10 — LOW — [introduced] — B — "destinations only while the row matches the saved routing" is unheld

C9 survives: after changing a row's profile, the old destinations stay under it and describe a
routing that will no longer apply. Suggested fix: in the destinations test, change the select and
assert `feature-destinations` disappears.

### F11 — LOW — [introduced] — B — the key-name prefix is hidden from assistive tech

`ProfileFields.tsx:123-125` marks `LLM_API_KEY_` `aria-hidden` and the input's label/help never
state it, so a screen-reader user hears an empty "API key environment variable" field and cannot
tell that `WORK` means `LLM_API_KEY_WORK` or that empty means `LLM_API_KEY` (F2). Suggested fix: put
the prefix in the accessible description (e.g. help text "Saved as LLM_API_KEY_<value>").

### Checked, no finding

- Rename/delete: ids are stable and `bodyFromDraft` resolves names at save, so a rename carries
  `default`, `local_fallback` and `features` (test kills M1/M4/M20/M21); M2/M3 are equivalent
  mutants because unresolved ids are dropped at save.
- `local_fallback` → off-host: the select lists only local profiles (C1 killed), and turning the
  fallback off-host clears it (M4 killed). The server rejects the rest.
- `api_key_present` sent back by the Features section is stripped by `_LLM_VIEW_ONLY_KEYS`.
- Invariant 12: every value the GUI can write matches `^LLM_API_KEY(_[A-Z0-9]+)*$` (`KEY_SUFFIX_RE`
  plus the prefix), and the server re-checks it.
- Selected state: the expanded profile uses `border-accent`, no fill; icon-only Delete and the Edit
  buttons carry entity-specific labels that contain the visible text. Several primary Saves on the
  one settings page predate this change ([pre-existing]).

TOTAL: 11 findings
