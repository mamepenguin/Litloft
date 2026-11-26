# Spec review 2: docs/specs/subtitle-sidecars.md at 41e943277

Fresh `spec-design-reviewer`; recorded here by the author, one line per finding with how it
was resolved.

1. The byte-identical "left as is" target was still an owner change by the definition. Fixed: the owner-change definition exempts it.
2. A folder upload of subtitles and videos refused every video after the first (an orphan gaining an owner was an owner change). Fixed: owner change now means a sidecar that has owners ending up under a different stem; an orphan gaining an owner, and same-stem owners, are not owner changes. Flagged to the human with the approval.
3. I2 listed copy, which skips names. Fixed: copy removed from I2; I15 added.
4. `sidecar_errors` shape per endpoint, UI, invariant. Fixed in the API contract; I16 added; purges log only.
5. Selection bar move and paste missing. Fixed: `SelectionBar`, `ClipboardProvider` in 185.8 and touch points; notice beside `pasteFailed`.
6. Rename and create entry points missing; message text. Fixed: entry list and message table in 185.8; `RenameDialog`, `useInlineRename` added.
7. `ConfirmDialog` must change; SPEC-CORE-120 I13. Fixed: optional props, default unchanged.
8. Batch rename 409 with mixed codes. Fixed: `subtitle_conflict` listing every name.
9. Batch move `errors[]` shape. Fixed: `error` stays a string holding the code, plus `names`.
10. Statuses for non-video, `.loft`, trashed, missing, invalid language, missing fields, stale 404, 500. Fixed in the API contract and 185.8.
11. Language labels and `ja`/`jpn`. Fixed: labels translated on the frontend; 2-letter codes offered; 3-letter equivalents count as the same language.
12. Track shown after add or delete of another. Fixed: tracks keyed by file name.
13. Revived and retired rows. Resolved by the narrowed owner-change definition (same name, same stem).
14. Upload classification at init, `.loft`, no re-check. Fixed in 184.6.
15. Answers after navigating away. Fixed in States; I19.
16. Invariants missing. Fixed: I15–I20.
17. Sidecar order when the stem shrinks. Fixed: dependency order, temporary name for a cycle.
18. Undrawn states, empty-state count, phone padding. Moved to Checked, no action as following existing components; flagged to the human.
19. iOS share extension retry. Accepted in Checked, no action.
20. SPEC-CORE-030 I10 contradicted. Fixed: added to Revises.

TOTAL: 20 findings
