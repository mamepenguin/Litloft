# Triage: r1

## Warnings

- core.hooksPath is '/Users/libre/Sources/video_share/.githooks', so the pre-push hook in .githooks does not run in this clone; fix: git config core.hooksPath .githooks

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

Note: A kept null-origin row is displayed under Related files, not Links to this file, until Y is saved (groupRelations.ts:10).; A missing Y (missing_since set) counts as a Markdown source because _markdown_source_ids applies no active filter, so its row waits as a trashed note's row does. No test pins this.; A pre-origin (Y, X) row where Markdown Y never linked X, such as one written by an addon before origins existed, now also waits for Y's save rather than going on X's save.; A pre-origin seed row from a Markdown source to a note (source, note) now survives the note's uncited save and waits for the source's save. The existing seed tests use only a video source.
- claude-read: A kept null-origin row is displayed under Related files, not Links to this file, until Y is saved (groupRelations.ts:10).
- claude-read: A missing Y (missing_since set) counts as a Markdown source because _markdown_source_ids applies no active filter, so its row waits as a trashed note's row does. No test pins this.
- claude-read: A pre-origin (Y, X) row where Markdown Y never linked X, such as one written by an addon before origins existed, now also waits for Y's save rather than going on X's save.
- claude-read: A pre-origin seed row from a Markdown source to a note (source, note) now survives the note's uncited save and waits for the source's save. The existing seed tests use only a video source.
- claude-verify: A kept pre-origin row (Y, X, NULL) for a live link is listed under Related files, while docs/user-guide/tags-and-relations.md:64 describes that section as relations made some other way, such as by an addon. It moves to Links to this file only after Y's next save.
- claude-verify: A pre-origin row from a Markdown note is now kept on X's save whatever Y's file says, because the code does not read Y's content. A row Y's file does not back stays listed on X until Y is saved.
- claude-verify: Missing Markdown sources are kept like trashed ones, because _markdown_source_ids applies no active-file filter. Only the trashed case has a test.

### unspecified_behavior

Note: A kept pre-origin row (Y, X, NULL) for a live link is listed under Related files, while docs/user-guide/tags-and-relations.md:64 describes that section as relations made some other way, such as by an addon. It moves to Links to this file only after Y's next save.; A pre-origin row from a Markdown note is now kept on X's save whatever Y's file says, because the code does not read Y's content. A row Y's file does not back stays listed on X until Y is saved.; Missing Markdown sources are kept like trashed ones, because _markdown_source_ids applies no active-file filter. Only the trashed case has a test.
- claude-read: A kept null-origin row is displayed under Related files, not Links to this file, until Y is saved (groupRelations.ts:10).
- claude-read: A missing Y (missing_since set) counts as a Markdown source because _markdown_source_ids applies no active filter, so its row waits as a trashed note's row does. No test pins this.
- claude-read: A pre-origin (Y, X) row where Markdown Y never linked X, such as one written by an addon before origins existed, now also waits for Y's save rather than going on X's save.
- claude-read: A pre-origin seed row from a Markdown source to a note (source, note) now survives the note's uncited save and waits for the source's save. The existing seed tests use only a video source.
- claude-verify: A kept pre-origin row (Y, X, NULL) for a live link is listed under Related files, while docs/user-guide/tags-and-relations.md:64 describes that section as relations made some other way, such as by an addon. It moves to Links to this file only after Y's next save.
- claude-verify: A pre-origin row from a Markdown note is now kept on X's save whatever Y's file says, because the code does not read Y's content. A row Y's file does not back stays listed on X until Y is saved.
- claude-verify: Missing Markdown sources are kept like trashed ones, because _markdown_source_ids applies no active-file filter. Only the trashed case has a test.

## Findings

A: 0
B: 2
C: 0

### claude-read:F1 — bucket B, LOW, open

Claim: When note X is saved linking back to Markdown note Y, Y's pre-origin row (Y, X) is still deleted even if Y's file still links X, so a live backlink stays unlisted until Y is next saved, while the commit removes the only known-issues entry describing that behavior.
Impact: With mutual links recorded before origins existed, X's page shows Y only under Links from this file and omits Links to this file, and Y's page omits Links from this file. Nothing tells the user why, and known-issues.md no longer lets them recognize it. Saving Y restores the row. This is limited to pre-origin rows and heals itself.
Evidence: backend/app/services/markdown_relations.py:167 subtracts target_ids from waiting_for_source, so the row falls through to db.delete at :181. backend/tests/test_relation_ownership.py:226-233 seeds source.md with 'See [[target]]' and pins only the (target, source) row. docs/process/reviews/fix-pre-origin-link-survives-save/decisions.md step 4 records that Y still says [[X]] and X's page does not list Y under Links to until Y is next saved. The diff deletes the known-issues entry, and docs/developer-guide/known-issues.md:6-9 and :22-23 say reachable defects are listed and a row is removed when fixed or when it is decided not to fix it. The test comment at test_relation_ownership.py:222 says Y is listed 'once on X's page for each direction', but the assertion at :233 allows one direction only.
Repro: not_reproduced by this reviewer (read-only). Traced from the code and matches decisions.md step 4: Y contains [[X]], set (Y, X) origin to NULL, save X with [[Y]], then GET /api/files/X/relations returns only (Y, outgoing, markdown).
Introduced: pre-existing
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Keep a narrowed known-issues entry for the link-back case, and delete the misleading sentence in the test comment at test_relation_ownership.py:222.

</details>

### claude-read:F2 — bucket B, INFO, open

Claim: No invariants file exists, so there is no touch-point list to compare against, and every place the diff reaches is by definition outside a declared list.
Impact: No separate user-visible defect. The places reached have no declared list covering them, so a reader cannot check the change's scope against one.
Evidence: Edited directly: backend/app/services/markdown_relations.py, backend/tests/test_relation_ownership.py, docs/developer-guide/known-issues.md. Reached through the shared sync function: backend/app/routers/files.py:1701 (content save), backend/app/routers/drives.py:881 (create/recover), backend/app/services/markdown_image_import.py:458 (image import). Reached through rows that now persist: backend/app/routers/files.py:1996 (public listing), frontend/src/components/FileDetail/related/groupRelations.ts:10 (a null-origin row renders under Related files, not Links to this file), and backend/app/routers/internal.py:612 and :647 with its addon consumers (addons/knowledge/app/routers/connections_graph.py:160, addons/intelligence/app/rag/tools/get_related_files.py:93). New runtime dependency: markdown_relations.py:110 lazily imports fileops._is_markdown_file. That predicate has the same logic as files.py:130.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: No tests or mutations were run; the tools were read-only and all behavior was traced by reading.
- claude-read: The R-5 walk in decisions.md and its logs and screenshots were not independently checked.
- claude-read: Which addon code, if any, actually writes kind=related rows between Markdown files, and in which direction. A search of addons/knowledge/app for the client's create_file_relation found only its definition, and other addons were not searched for it.
- claude-read: Whether SQLite foreign-key cascade is enabled in production for rows whose source file is physically deleted.
- claude-read: Frontend rendering beyond groupRelations.ts.
- claude-verify: No tests were run and the app was not started; the claims were reproduced by tracing the code by hand, because only Read, Glob and Grep were available.
- claude-verify: The commit diff and the message of commit c1abf4dc8 were not read, so the removal of the known-issues entry rests on comparing the worktree with the main checkout, and whether the commit states why it was removed is unknown.
- claude-verify: The screenshots and logs cited in decisions.md, which are outside the repository, were not read.
- claude-verify: The downstream handling in connections_graph.py after line 184 and in get_related_files.py beyond the grep results was not read in full.

TOTAL: 2 findings
