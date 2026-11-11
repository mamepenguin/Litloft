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

## Needs a human

### unspecified_behavior

Note: `_all: true` in a map overrides every feature value in all views, including the settings screens. Only `_all: false` is documented in docs/reference/configuration.md, and the `_all: true` case is pinned only by a fixture row.; Turning an addon on removes any stored `index` key from its map, including a hand-written `index: true`. This does not change the behaviour, because an absent key reads as on.; A hand-written `_all: true` map is reduced by off then on to its bare feature keys, so a feature it had been masking takes effect.
- claude-read: `_all: true` in a map overrides every feature value in all views, including the settings screens. Only `_all: false` is documented in docs/reference/configuration.md, and the `_all: true` case is pinned only by a fixture row.
- claude-read: Turning an addon on removes any stored `index` key from its map, including a hand-written `index: true`. This does not change the behaviour, because an absent key reads as on.
- claude-read: A hand-written `_all: true` map is reduced by off then on to its bare feature keys, so a feature it had been masking takes effect.
- claude-verify: The docs do not specify what `_all: true` in a map means or how the feature switches should behave with it. The code treats it as overriding every feature (config.py:148-149, adminConfig.ts:31).

### unspecified_behavior

Note: The docs do not specify what `_all: true` in a map means or how the feature switches should behave with it. The code treats it as overriding every feature (config.py:148-149, adminConfig.ts:31).
- claude-read: `_all: true` in a map overrides every feature value in all views, including the settings screens. Only `_all: false` is documented in docs/reference/configuration.md, and the `_all: true` case is pinned only by a fixture row.
- claude-read: Turning an addon on removes any stored `index` key from its map, including a hand-written `index: true`. This does not change the behaviour, because an absent key reads as on.
- claude-read: A hand-written `_all: true` map is reduced by off then on to its bare feature keys, so a feature it had been masking takes effect.
- claude-verify: The docs do not specify what `_all: true` in a map means or how the feature switches should behave with it. The code treats it as overriding every feature (config.py:148-149, adminConfig.ts:31).

## Findings

A: 0
B: 1
C: 0

### claude-read:CR-1 — bucket B, LOW, open

Claim: A feature switch in /admin/settings does nothing when the addon's stored map holds `_all: true`: the click saves successfully but the row stays on, with no error.
Impact: An owner who wrote `{"editor": false, "_all": true}` by hand in drives.json sees the feature on, presses its switch to turn it off, and the feature stays on with no message. Pressing the addon's own switch off and on afterwards removes `_all` and turns `editor` off. The UI never writes `_all: true`, so only a hand-edited config reaches this.
Evidence: frontend/src/lib/adminConfig.ts:31 returns `_all` before looking at the feature. frontend/src/app/admin/settings/AddonPolicySection.tsx:138 therefore reads current=true, and :145 stores `editor: false`, which leaves the map unchanged. backend/app/config.py:148 lets `_all` win, so the value on screen matches the backend but the switch cannot change it. toggleFeature is not in the diff, and no test presses a feature switch on such a map. The fixture case `_all true over a feature false` pins only the read.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Have toggleFeature drop `_all` from the map when it writes a feature, or treat `_all: true` as absent in isAddonFeatureOn and accept the parity table change.

</details>

## Not verified

- claude-read: I ran no tests, lint, type check or the app; every statement comes from reading the code, including the mutation reasoning and CR-1.
- claude-read: I read the working tree at the review head and did not inspect the commit objects, so I relied on the supplied diff for what changed.
- claude-read: The in-app record in decisions.md was read but not repeated, and its screenshots and logs were not opened.
- claude-read: I did not read every addon's policy client. Only intelligence's policy_client.py was read in full for the response handling, and knowledge, media_import and cloud-sync were only searched for raw drives.json access.
- claude-read: docs/process/spec-and-design.md was not read, so I did not confirm how a change with no invariants file should be treated.
- claude-verify: Nothing was executed: no tests were run and the UI was not driven, because this verifier has read-only tools. The reproduction is a code trace.
- claude-verify: Whether adminConfig.ts:31 is new in this diff or pre-existing was not checked, because git history and diffs are not readable with these tools.
- claude-verify: Whether the owner's real drives.json holds a `_all: true` map was not checked.
- claude-verify: Addon-side policy consumers were not read; addon lookups were only seen through grep and the internal drive-policy endpoint.

TOTAL: 1 findings
