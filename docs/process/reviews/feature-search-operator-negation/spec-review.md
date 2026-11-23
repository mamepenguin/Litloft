# Spec review r1 (spec-design-reviewer, at 73b198985)

The reviewer had no write tool; its report was saved by the author. Each finding with its
resolution in the spec.

1. App-target invariants contradicted (SPEC-ADDON-106 I4, reading I12b, SPEC-CORE-099 I6).
   Resolved: direct targets keep refusing new tokens (106 I4 and I12b hold); the member
   path accepts them; SPEC-CORE-099 I6 revised.
2. "No `in:` name" invariants now cover `-in:` queries (116 I7, 103 I3, 109 I12, 109 I1).
   Resolved: all four revised.
3. SPEC-CORE-044 I10 contradicted by the two menu entries. Resolved: revised.
4. App targets' negation guard wider than the parser; Video has none. Resolved: sending
   step 9 (direct targets refuse every new token, Video included; member path accepts).
5. Notes/Clips and ADDON-DEVELOPMENT sections missing. Resolved: Notes/Clips use the
   member path and `resolveAppTarget`, so no addon change; docs line names the sections.
6. Listing status codes and boolean strictness. Resolved: sending step 7, I10.
7. Excluded-tag caps. Resolved: no parser cap, as `tag:`; Failure cases state the 422;
   I10 restricted to folders, collections, kinds, `has:`.
8. Missing touch points (`SearchQueryHeader`, `useLauncherRows`, Ask page). Resolved:
   added; Ask behaviour in section 7.
9. Which surfaces get the entries. Resolved: search page and image-query page; Ask
   unchanged (SPEC-CORE-044 I10 revision).
10. Existing submenus and negated tokens. Resolved: menu step 3.
11. Refused state undefined. Resolved: sending step 1 and section 3.
12. No invariant for `filter` parity. Resolved: I11.
13. No invariant for folder-counts / shelves / tag-counts. Resolved: I2.
14. Touch points with no invariant. Resolved: I9 (save), I14, I15, I16; layout in
    `e2e-components`.
15. Addon wire shape against an older core. Resolved: SPEC-ADDON-177 step 2, Failure
    cases.
16. Cross-drive Tag rows for `has_tag`. Resolved: follows `tags`; Checked, no action.

TOTAL: 16 findings

# Spec review r2 (spec-design-reviewer, at 445943756)

1. Video counts only the direct target, so new-token Smart Collections would be disabled.
   Resolved: sending step 9 names `VideoAppHeader.tsx` and `useVideoApp.ts`; I17.
2. SPEC-CORE-059 I12b and SPEC-CORE-117 I8 contradicted. Resolved: both revised.
3. Revision lines for 116 I6, 109 I12, 044 I10 contradicted this spec. Resolved: reworded.
4. Precedence of impossible / failed / refused / evaluation and the `in:` key. Resolved:
   sending step 1, I18; SPEC-CORE-116 I4 and SPEC-CORE-138 I18 revised.
5. `epub` rejected by the addon. Resolved: the addon's kinds gain `epub`; I19.
6. 10,000-member cap for exclusion-only Smart Collections. Human decision (2026-11-23):
   accepted; stated in step 9, section 9 and the user guide line.
7. "Exactly as before" invariants of SPEC-CORE-115 and SPEC-CORE-093. Resolved: Checked,
   no action (scoped to their own changes).

TOTAL: 7 findings
