# Triage: r4

## Warnings

- core.hooksPath is '/Users/libre/Sources/video_share/.githooks', so the pre-push hook in .githooks does not run in this clone; fix: git config core.hooksPath .githooks
- R-5 ran at 819742a011a215bca78534721b095e8a6e6578f7, and these files changed since: docs/admin-guide/monitoring.md, docs/developer-guide/known-issues.md; run R-5 again if any of them changes what a user sees

## Trajectory

This run:
- claude-deep: No. This round adds no branch, state or prediction to production code, and it is the first round with no production change at all. fa12b3689 changes tests only and 9e230c67e changes docs only. 2dc144dd4 and 058f0d7b5 record r3 and the ship decision, going by their subjects and the resulting files. Looking back: r2 added the 'unknown' state, plus a branch and a prediction that the next startup retries; r3 removed part of it by moving the non-regular case back to absent, and added only the reused_row local that its reorder needed. This round adds no sibling to any of those. It also ends the oscillation on the non-file rule by recording the outcome as I22, with I23 settling the scan-detected move, so a state that had stayed unspecified is now written down instead of being changed again. The test edits remove a weakness rather than add to it: two blanket exception guards go, replaced by asserted statuses and reach flags, and one new helper, _staged_upload, replaces duplicated setup. The design is not being patched. What remains is a short list of carried edge cases with no specific ruling, none of them reachable in ordinary use by my reading except the delivery-window addon rewrite, which the spec expects.
- claude-read: No. This round adds no branch, state or prediction to production code, and it changes no production code at all. 2dc144dd4 and 058f0d7b5 are records, fa12b3689 is tests only and 9e230c67e is docs only. The r2 round added the 'unknown' state, and the r3 round shrank it by moving the non-regular case back to absent. This round adds no state, and it records both rulings as I22 and I23, which ends the oscillation over the unknown/absent boundary that r3 reported. The test round also removes something: the two `try/except Exception: pass` blocks are gone. Its additions are assertions, one helper split out of `_upload_png`, and one new test that pins an ordering the previous round had already implemented. Those additions check existing behaviour and predict nothing new. The two findings here are small test gaps on code that was already right. On this evidence the design is not being patched.

Earlier runs:
- r2 / claude-deep: Only one round since r1 changes production code: 3ba3a824c. The other three commits are tests (e22ce7a75) or review records (1da095a54, 134c1042a), so no earlier fix round exists for this one to repeat. That round adds one state, 'unknown', to _reach_key, plus one early-exit branch in the migration loop and the prediction that the next startup retries such a row. It answers r1's stat-error finding directly and does not rework an earlier patch, so this is not yet a design being patched. It also removes things: the migration leaves thumbnail.py, along with its SQLAlchemy and models imports and thumbnail.py's allow-list entry, and fileops._cleanup_empty_parents is gone in favour of prune_empty_dirs. The added state is not in the spec's state table and has no recorded revision. It also leaves a pointer that may never repair itself when a non-file sits at the path, so a further round around this state should be read as a warning sign.
- r2 / claude-read: There has been one round of fixes since r1, so no earlier fix round exists for this one to repeat. Commit 1da095a54 records r1 and 134c1042a records a second R-5 run; both are documents only. e22ce7a75 adds tests only, including predictions for the 'unknown' behaviour that the next commit implements. 3ba3a824c adds one state and branch to the migration: _reach_key gains an 'unknown' key beside 'inode' and 'absent', and the loop gains a keep-and-warn branch. That is a fourth per-row outcome beside moved, repointed and emptied, and the spec's state table was not revised to include it. The same commit also removes things: the migration's dependencies leave thumbnail.py, thumbnail.py drops out of the os.replace allow-list, and the duplicate fileops._cleanup_empty_parents goes. So this round adds one state and removes structure. It does not show the pattern of a design being patched repeatedly, though a further stat or non-regular special case in the migration would start that pattern.
- r3 / claude-deep: Production code changed in one commit this round, 72877969e; 0154854d8 and 819742a01 are tests, and e80f61d56 and 58e9d36d6 are review records. The round adds no new migration state or branch. It narrows the 'unknown' state r2 added: a non-regular file moved from unknown back to absent, so the keep-and-warn branch now serves only stat errors. That edge has now changed in every round: treated as absent at r1, kept as unknown at r2 with a test pinning it, and absent again at r3 with that test replaced. No human ruling or spec revision records any of the three, so this one rule is oscillating, although the patching does not spread. The upload change is a reorder, not an addition: the ghost delete moved after the generator and into the existing try, and one new local, reused_row, replaced the `existing is None` predicate, because `existing` is now reassigned inside the try. That predicate change is a consequence of the reorder rather than a new behaviour. The tests are additive and include a correction to a test written in the same round (819742a01), which fixed a copy case that never reached the ghost, and the blanket except that hid it remains. No earlier prediction is repeated. Overall this round removes more behaviour than it adds, and I do not read the design as being patched, but the stat-error state is still unspecified after three runs.
- r3 / claude-read: Production code changed in one commit this round, 72877969e; 0154854d8 and 819742a01 are tests and 58e9d36d6 is a record. That commit adds no migration state or branch, and it shrinks one: the non-file case leaves 'unknown' for 'absent'. This is a reversal, not an addition. The same input was absent at r1's head, unknown at r2's head and absent again now, and the test pinned at r2 was rewritten to the opposite outcome. So the case was decided twice without a recorded ruling, while 'unknown' itself survives for stat errors and is still not in the spec. In upload.py the round moves the ghost delete back behind the generator and adds one local flag, `reused_row`, because `existing` is cleared partway through. That is a small cost of reordering, not a new state, and no earlier round added one like it. The r2 fix round's prediction about retrying an unknown row still stands and gains no sibling. On this evidence the design is not being patched repeatedly: the migration's state count fell this round and the production diff is small. The test side does repeat a weakness: the copy case needed a follow-up commit to reach its target (819742a01). A further change to the unknown or absent boundary would be the warning sign, and it should follow a recorded ruling rather than another finding.

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: Carried from r1, in neither the spec nor I22/I23: two rows naming one absent or non-regular path string are both emptied at thumbnail_migration.py:93-98 even if a slot exists, where I10 repoints a row with a slot. I found no ordinary way to reach this. It was listed at r3, before the recorded ship decision.; Carried from r2, in neither the spec nor I22/I23: an upload over a reused row whose commit fails leaves the slot holding the new file's picture while the row rolls back (upload.py:280-283, :363). It was listed at r3, before the recorded ship decision.; Carried from r1: with the old addon pin, Media Import's caption retry rewrites .loft rows to path form with a new mtime and ETag, so each startup repeats the move until the addon PR lands (decisions.md, first run, item 5). The spec's Delivery entry says only that such a write migrates at the next startup.
- claude-deep: Carried from r1, with no specific ruling: two rows in one ('absent', rel) group are both emptied at thumbnail_migration.py:93-98 even if a slot exists, whereas I10 repoints a row with a slot. I still found no ordinary way to reach it, because a shared group commits its emptied pointers before unlinking.
- claude-deep: Carried from r2, with no specific ruling: an upload over a reused row whose commit fails leaves the slot holding the new file's picture while the row rolls back (upload.py:280-283, :363). The landed file stays on disk, so for a .by-id row the picture matches the file on disk. For a path-form or Markdown pointer the new slot is stranded until a later upload or migration reuses it.
- claude-deep: Carried from r1, with no specific ruling: with the old addon pin, Media Import's caption retry rewrites .loft rows to path form with a new mtime and ETag, so each startup repeats the move during the delivery window (decisions.md first run, item 5). The Delivery entry says only that such a write migrates at the next startup.
- claude-deep: Carried from r3: slot.is_file() at thumbnail_migration.py:125 and the prune at :122 sit outside the OSError guards, so an examine error there stops the whole run instead of failing one row as I22 does at a pointer. main.py:278 logs it and the next start retries. It needs an unsearchable .by-id directory or parent.
- claude-read: Carried from r1, in neither the spec nor I22/I23: two rows naming one absent or non-regular path string are both emptied at thumbnail_migration.py:93-98 even if a slot exists, where I10 repoints a row with a slot. I found no ordinary way to reach this. It was listed at r3, before the recorded ship decision.
- claude-read: Carried from r2, in neither the spec nor I22/I23: an upload over a reused row whose commit fails leaves the slot holding the new file's picture while the row rolls back (upload.py:280-283, :363). It was listed at r3, before the recorded ship decision.
- claude-read: Carried from r1: with the old addon pin, Media Import's caption retry rewrites .loft rows to path form with a new mtime and ETag, so each startup repeats the move until the addon PR lands (decisions.md, first run, item 5). The spec's Delivery entry says only that such a write migrates at the next startup.

### unspecified_behavior

Note: Carried from r1, with no specific ruling: two rows in one ('absent', rel) group are both emptied at thumbnail_migration.py:93-98 even if a slot exists, whereas I10 repoints a row with a slot. I still found no ordinary way to reach it, because a shared group commits its emptied pointers before unlinking.; Carried from r2, with no specific ruling: an upload over a reused row whose commit fails leaves the slot holding the new file's picture while the row rolls back (upload.py:280-283, :363). The landed file stays on disk, so for a .by-id row the picture matches the file on disk. For a path-form or Markdown pointer the new slot is stranded until a later upload or migration reuses it.; Carried from r1, with no specific ruling: with the old addon pin, Media Import's caption retry rewrites .loft rows to path form with a new mtime and ETag, so each startup repeats the move during the delivery window (decisions.md first run, item 5). The Delivery entry says only that such a write migrates at the next startup.; Carried from r3: slot.is_file() at thumbnail_migration.py:125 and the prune at :122 sit outside the OSError guards, so an examine error there stops the whole run instead of failing one row as I22 does at a pointer. main.py:278 logs it and the next start retries. It needs an unsearchable .by-id directory or parent.
- claude-deep: Carried from r1, with no specific ruling: two rows in one ('absent', rel) group are both emptied at thumbnail_migration.py:93-98 even if a slot exists, whereas I10 repoints a row with a slot. I still found no ordinary way to reach it, because a shared group commits its emptied pointers before unlinking.
- claude-deep: Carried from r2, with no specific ruling: an upload over a reused row whose commit fails leaves the slot holding the new file's picture while the row rolls back (upload.py:280-283, :363). The landed file stays on disk, so for a .by-id row the picture matches the file on disk. For a path-form or Markdown pointer the new slot is stranded until a later upload or migration reuses it.
- claude-deep: Carried from r1, with no specific ruling: with the old addon pin, Media Import's caption retry rewrites .loft rows to path form with a new mtime and ETag, so each startup repeats the move during the delivery window (decisions.md first run, item 5). The Delivery entry says only that such a write migrates at the next startup.
- claude-deep: Carried from r3: slot.is_file() at thumbnail_migration.py:125 and the prune at :122 sit outside the OSError guards, so an examine error there stops the whole run instead of failing one row as I22 does at a pointer. main.py:278 logs it and the next start retries. It needs an unsearchable .by-id directory or parent.
- claude-read: Carried from r1, in neither the spec nor I22/I23: two rows naming one absent or non-regular path string are both emptied at thumbnail_migration.py:93-98 even if a slot exists, where I10 repoints a row with a slot. I found no ordinary way to reach this. It was listed at r3, before the recorded ship decision.
- claude-read: Carried from r2, in neither the spec nor I22/I23: an upload over a reused row whose commit fails leaves the slot holding the new file's picture while the row rolls back (upload.py:280-283, :363). It was listed at r3, before the recorded ship decision.
- claude-read: Carried from r1: with the old addon pin, Media Import's caption retry rewrites .loft rows to path form with a new mtime and ETag, so each startup repeats the move until the addon PR lands (decisions.md, first run, item 5). The spec's Delivery entry says only that such a write migrates at the next startup.

## Findings

A: 0
B: 5
C: 0

### claude-deep:TEST-8 — bucket B, LOW, open

Claim: No test decides the `reused_row` predicate in complete_upload's failure branch, on either side: a failed upload over a reused row, or a failure inside the trashed-ghost branch before `existing` is cleared.
Impact: Changing the predicate leaves every test green. If it became unconditional, a failed upload over a Missing row would remove that row's own slot while the rollback keeps its pointer, so the row shows the placeholder until the next scan, and a .loft or still-Missing row keeps it longer. If it reverted to `existing is None`, a failure in the ghost's delete or tag cleanup would strand a slot under an id no row holds. The current code is correct, and the effect is limited to a cache file after an uncommon failure.
Evidence: backend/app/services/upload.py:272 sets the flag and :363 tests it. In test_thumbnail_slots.py, test_upload_with_a_new_id_whose_commit_fails_leaves_no_slot has no existing row. The upload case of test_an_operation_that_fails_before_its_commit fails at upload.py:360, after `existing = None` at :296, and does not assert the new slot is gone. TestUploadOverReusedRow (seed at :234) only completes successful commits. A search of the thumbnail_slots and upload test files for 'reused' and 'vanish' finds only that seed.
Repro: not_reproduced (read-only reviewer). Predicted mutations, each predicted to survive: replace `if not reused_row:` at upload.py:363 with `if True:`; replace it with `if existing is None:`.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a case that fails a reused-row upload before its commit and asserts the row's slot still exists, and assert in the ghost failure case that no slot other than the ghost's remains.

</details>

### claude-deep:TEST-9 — bucket B, LOW, open

Claim: test_two_spellings_of_one_file_count_as_shared asserts the emptied pointers but not that the file is gone, so it does not check the removal half of I8 for two spellings.
Impact: If the unlink loop stopped covering every spelling, a hard-linked picture would stay in the cache under its second name with no row naming it, at a cost in disk only, and the test would stay green. On a folding mount one unlink is enough, so a user would not see a wrong picture.
Evidence: backend/tests/test_thumbnail_slots.py:899-913 asserts both pointers are None and .by-id is empty, and never reads `first` or the alias path. backend/app/services/thumbnail_migration.py:100-103 unlinks each distinct string. test_rows_sharing_one_file_lose_the_pointer_and_the_file covers removal for one spelling only.
Repro: not_reproduced (read-only reviewer). Predicted mutation: at thumbnail_migration.py:100 iterate only over `{members[0][1]}`; predicted to survive.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Assert that both `first` and the alias path no longer exist after the restart.

</details>

### claude-read:R4-TEST-1 — bucket B, LOW, open

Claim: No test fails if the migration stops preserving `updated_at`, although `_set_pointer` holds that column on purpose and spec section 9 promises no ordering change.
Impact: If the hold is dropped, the first start after the upgrade stamps every migrated row with the upgrade time. Listings sorted by `updated_at` reorder, and the relative date in the file list and Trash views changes for the whole library. Every test stays green. The current code is correct.
Evidence: backend/app/services/thumbnail_migration.py:49 sets `updated_at=File.updated_at`. backend/app/models.py:90-92 declares `onupdate=lambda: datetime.now(UTC)` on that column, so an UPDATE without the explicit value bumps it. backend/app/routers/drives.py:670 accepts `updated_at` as a sort key, and frontend/src/components/FileListRow.tsx:163 and frontend/src/components/trash/TrashFileList.tsx:149 show it. A search of backend/tests/test_thumbnail_slots.py for `updated_at` finds nothing, and that is the only test file that references `migrate_thumbnail_slots`.
Repro: not_reproduced (read-only tools). Predicted mutation: remove `updated_at=File.updated_at` at thumbnail_migration.py:49; all tests are predicted to stay green.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> In a sole-owner migration test, set a known updated_at on the row, restart, and assert the value is unchanged for a moved row and an emptied row.

</details>

### claude-read:R4-TEST-2 — bucket B, LOW, open

Claim: test_two_spellings_of_one_file_count_as_shared asserts only that both pointers are empty, not that the file is gone under either name, so the removal half of I8 is untested when two strings reach one file.
Impact: If the shared-file removal handled only one spelling, the other name would keep the old picture in the cache under a path no row names, and no test would notice. It costs disk only and shows the user nothing wrong. The current code removes every spelling.
Evidence: backend/app/services/thumbnail_migration.py:100-106 unlinks each distinct string in the group. backend/tests/test_thumbnail_slots.py:899-913 holds the first file in `first` and the alias path in `b.thumbnail_path`, and then asserts only the pointers and that `.by-id` holds nothing. test_rows_sharing_one_file_lose_the_pointer_and_the_file asserts removal, but its rows use one string.
Repro: not_reproduced (read-only tools). Predicted mutation: replace the loop's set at thumbnail_migration.py:100 with `{members[0][1]}`. test_two_spellings is predicted to pass with `alias.jpg` still on disk, and the other tests use one spelling, so the mutant is predicted to survive.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Assert that neither `first` nor the alias path exists after the restart.

</details>

### claude-deep:SCOPE-3 — bucket B, INFO, open

Claim: Commit 9e230c67e adds two rows to known-issues.md, while the touch-point list says only that four rows are removed there.
Impact: No user effect. Both rows describe behaviour that the code and the recorded run support: the async upload route calls the generator directly, and a scan raises on an unwritable cache. Only the planned reach is understated.
Evidence: docs/developer-guide/known-issues.md:119-121 adds the rows. The spec's Touch points read 'docs/developer-guide/known-issues.md: four rows removed'. backend/app/routers/uploads.py:73-81 is `async def` and calls complete_upload directly. decisions.md first run item 9 records the scan's 500 and that origin/develop does the same. decisions.md's ship line accepts SCOPE-2 but predates this commit's rows and does not name them.
Repro: Read the 9e230c67e diff against the Touch points section.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Record the two rows in a touch-point revision. The text needs no change.

</details>

## Not verified

- claude-deep: I ran nothing: no tests, mutations or application. Every mutation outcome here is predicted from reading the code, including my claim that the new tests pass and fail as described.
- claude-deep: Git objects were not read. I read the working tree and took it to be commit 9e230c67e from the status snapshot. I saw diffs only for fa12b3689 and 9e230c67e. For 2dc144dd4 and 058f0d7b5 I relied on their subjects, r4/fixes.txt and the current invariants.md and decisions.md.
- claude-deep: The evidence directory cited in decisions.md is outside this worktree, so its observations are taken as a record and not checked.
- claude-deep: The Media Import half of I15 and SPEC-ADDON-040, which are not at this commit.
- claude-deep: The Intelligence reconcile and the frontend beyond search hits on thumbnail paths; I confirmed only that the addon code hits I read treat the column as an opaque value.
- claude-deep: The scan-and-upload IntegrityError window was not exercised, and I did not establish how often a scan commits inside a generation window.
- claude-deep: Inode stability on case-folding, FUSE or network cache mounts, and migration timing against the healthcheck window on a large library.
- claude-deep: Test files other than test_thumbnail_slots.py were searched by pattern for the gaps above and not read in full.
- claude-read: I ran nothing: no tests, mutations or application. Every mutation outcome here is predicted from reading the code, including that the tests in fa12b3689 pass.
- claude-read: Git objects were not read. I took the working tree as the reviewed commit from the status snapshot. Commits 2dc144dd4 and 058f0d7b5 were not shown as diffs, so I read their result in invariants.md and decisions.md only.
- claude-read: The evidence directory cited in decisions.md is outside this worktree. Its observations are quoted as a record and not checked.
- claude-read: Media Import's change and its tests, which are not at this commit, so the first half of I15 and SPEC-ADDON-040 are unchecked.
- claude-read: Whether a scan that raises PermissionError on an existing row loses the rest of that drive's scan, and how scan_all_drives handles it.
- claude-read: Inode stability on case-folding, FUSE or network cache mounts, and migration timing against the healthcheck window on a large library.
- claude-read: That the INDEX.md approval hash matches the spec; computing it needs a command.
- claude-read: Test files other than test_thumbnail_slots.py were not read in full; statements about them rest on searches and earlier records.
- claude-verify: Nothing was run: no tests, no mutations and no application. Every mutant outcome is inferred from reading the code.
- claude-verify: Git objects were not read, so the working tree was taken to be commit 9e230c67e from head.txt and the status snapshot, and the rows' attribution to that commit is indirect.
- claude-verify: The evidence files cited in decisions.md under the scratchpad directory were not opened.
- claude-verify: Whether prune_empty_dirs can raise at thumbnail_migration.py:122, outside the try block, was not checked.
- claude-verify: The addon tests and addon code were not examined.

TOTAL: 5 findings
