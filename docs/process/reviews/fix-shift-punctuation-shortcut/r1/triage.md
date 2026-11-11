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

## Needs a human

### unspecified_behavior

Note: On non-US layouts, a Ctrl/Alt+Shift chord that produces a character in the US table is rewritten to the US unshifted face. For example, JIS Shift+2 gives '"', which becomes "'", and JIS Shift+; gives '+', which becomes '='. Shifted characters that are not in the table (for example JIS Shift+7, which gives "'") pass through unchanged.; On macOS, Option+Shift chords produce dead-key or special characters that are not in the table, so they are not mapped.
- claude-read: On non-US layouts, a Ctrl/Alt+Shift chord that produces a character in the US table is rewritten to the US unshifted face. For example, JIS Shift+2 gives '"', which becomes "'", and JIS Shift+; gives '+', which becomes '='. Shifted characters that are not in the table (for example JIS Shift+7, which gives "'") pass through unchanged.
- claude-read: On macOS, Option+Shift chords produce dead-key or special characters that are not in the table, so they are not mapped.

## Findings

A: 0
B: 2
C: 0

### claude-read:F1 — bucket B, LOW, open

Claim: The change edits normalizeKey, the single normalizer that ShortcutsProvider uses to dispatch every registered shortcut. No invariants file declares a touch-point list, so this shared dispatch path, and through it every Ctrl/Alt+Shift binding in core and in addons, falls outside any declared touch point.
Impact: Every chord pressed with Shift plus Ctrl/Cmd or Alt is now normalized differently. That covers ctrl+shift+f (GlobalSearch), ctrl+shift+k and ctrl+shift+\ (addons/knowledge Editor), and any future Alt+Shift binding. On a non-US layout, a chord whose shifted character appears in the US-keyed table is rewritten to the US unshifted face. For example, JIS Ctrl+Shift+2 produces '"', which is rewritten to ctrl+shift+'. So a binding written for a non-US key face would silently fail to match. No current binding is affected.
Evidence: frontend/src/lib/shortcuts.ts:85-89 holds a table keyed by US-layout shifted characters. shortcuts.ts:107-113 applies it whenever shiftKey is held together with the primary modifier or Alt. frontend/src/components/ShortcutsProvider.tsx:81 is the only caller, and it handles every context. A grep for ctrl/alt bindings finds three Shift chords: ctrl+shift+f (GlobalSearch.tsx:166,188), ctrl+shift+k (addons/knowledge/frontend/Editor.tsx:1151) and ctrl+shift+\ (Editor.tsx:1170).
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F2 — bucket B, INFO, open

Claim: The new core unit test in frontend/src/lib/__tests__/shortcuts.test.ts walks the filesystem of addons/*/frontend and frontend/src, which reaches the addon source trees from a core lib test. No touch-point list names these trees.
Impact: The result of a core test now depends on addon source files and on how their bindings are written. Only double-quoted `key: "..."` literals are scanned. A binding written with single quotes, a template literal or a constant is skipped without notice. A binding under a __tests__ directory is skipped as well. So the guard can pass while a real binding goes unchecked.
Evidence: shortcuts.test.ts (new) shiftPunctuationBindings() resolves `../addons` from the frontend root, skips node_modules and __tests__, and matches /\bkey:\s*("(?:[^"\\\n]|\\.)*")/g. The only guard against a vacuous pass is expect(chords.length).toBeGreaterThan(0).
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: I did not run the test suite, so I have not confirmed that the new tests pass or that __dirname resolves under the vitest config.
- claude-read: I did not inspect the content of commit 6dfe55339 on its own. I reviewed the diff as provided.
- claude-read: I did not check real browser e.key values for Cmd+Shift+\ on macOS or for JIS layouts.
- claude-read: I did not check bindings that are defined outside a double-quoted `key:` literal (constants, template strings, addon manifests).
- claude-verify: Did not run the vitest suite, so the tests passing at this commit was not confirmed by execution.
- claude-verify: Did not check the in-app run recorded in decisions.md, or its logs and screenshots.
- claude-verify: Did not check behaviour on non-US layouts such as JIS beyond what the code comment says.

TOTAL: 2 findings
