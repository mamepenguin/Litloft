# Triage: r1

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 1

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- open_c claude-read:R1-autopurge-shared-drives
- unspecified_behavior
- unspecified_behavior

## Needs a human

### open_c (claude-read:R1-autopurge-shared-drives)

Question: Without --with-drives, a cloned stack's backend deletes real files on the shared drives on its own, with no user action: at every startup and every 24 h after, purge_expired_trash physically deletes every file that the cloned DB lists as trashed for more than TRASH_RETENTION_DAYS. That DB is a snapshot that never sees later changes made in the main checkout.
Impact: A file trashed in the main checkout shortly before `clone` and restored there afterwards is still expired trash in the clone. The clone's next `up`, or a later daily pass, unlinks the restored file from the shared drive without any message. The main stack's DB then holds a row for a missing file. PROJECT.md says the drives only need cloning for a run that 'moves, trashes, purges or uploads files', so a reader would not expect this risk from a run that only reads.
Evidence: backend/app/main.py:288 starts purge_expired_trash at every startup; main.py:138-159 loops every 86400 s; main.py:96 calls physical_delete, and backend/app/services/fileops.py:674-675 unlinks the file on the drive. scripts/dev/r5_stack.py plan_overlay only redirects drive binds when with_drives is set, so the backend mounts /Users/.../video_share/videos read-write. decisions.md records that the cloned DB held 3 expired trash rows and that 'the startup auto-purge runs on every `up` even without --with-drives'.
Recommendation: When drives are not cloned, have the clone's backend skip the purge (or mount the drives read-only), or have `clone` refuse while the cloned DB holds trash rows near or past the cutoff. Update the PROJECT.md bullet so it no longer implies that a read-only run is safe.
Note: Without --with-drives, a cloned stack's backend deletes real files on the shared drives on its own, with no user action: at every startup and every 24 h after, purge_expired_trash physically deletes every file that the cloned DB lists as trashed for more than TRASH_RETENTION_DAYS. That DB is a snapshot that never sees later changes made in the main checkout.

### unspecified_behavior

Note: Without --with-drives, the clone's backend runs its own startup work against the shared drives: the expired-trash purge (physical unlink), rmdir of folders left empty after a purge, and scan_all_drives.; snapshot_live_db picks the first read-write mount that contains the DB (a stable sort over the order docker inspect returns). For a DB under data/addons/<addon>, this can be the backend container rather than the addon container that writes it.; Run outside a git repository, the script ends in a CalledProcessError traceback instead of an r5-stack message (noted in decisions.md).; If the base compose config later gains a bind that writes the main checkout's state, verified_env makes `down` and `destroy` refuse, so the script cannot stop the stack and the user has to use docker compose by hand.
- claude-read: Without --with-drives, the clone's backend runs its own startup work against the shared drives: the expired-trash purge (physical unlink), rmdir of folders left empty after a purge, and scan_all_drives.
- claude-read: snapshot_live_db picks the first read-write mount that contains the DB (a stable sort over the order docker inspect returns). For a DB under data/addons/<addon>, this can be the backend container rather than the addon container that writes it.
- claude-read: Run outside a git repository, the script ends in a CalledProcessError traceback instead of an r5-stack message (noted in decisions.md).
- claude-read: If the base compose config later gains a bind that writes the main checkout's state, verified_env makes `down` and `destroy` refuse, so the script cannot stop the stack and the user has to use docker compose by hand.
- claude-verify: The background trash auto-purge in a cloned stack without --with-drives acts on shared drive files using a stale DB snapshot.
- claude-verify: plan_overlay maps each rw single-file bind to files_dir/src.name. Two such binds with the same basename from different directories would share one clone file (r5_stack.py:258).

### unspecified_behavior

Note: The background trash auto-purge in a cloned stack without --with-drives acts on shared drive files using a stale DB snapshot.; plan_overlay maps each rw single-file bind to files_dir/src.name. Two such binds with the same basename from different directories would share one clone file (r5_stack.py:258).
- claude-read: Without --with-drives, the clone's backend runs its own startup work against the shared drives: the expired-trash purge (physical unlink), rmdir of folders left empty after a purge, and scan_all_drives.
- claude-read: snapshot_live_db picks the first read-write mount that contains the DB (a stable sort over the order docker inspect returns). For a DB under data/addons/<addon>, this can be the backend container rather than the addon container that writes it.
- claude-read: Run outside a git repository, the script ends in a CalledProcessError traceback instead of an r5-stack message (noted in decisions.md).
- claude-read: If the base compose config later gains a bind that writes the main checkout's state, verified_env makes `down` and `destroy` refuse, so the script cannot stop the stack and the user has to use docker compose by hand.
- claude-verify: The background trash auto-purge in a cloned stack without --with-drives acts on shared drive files using a stale DB snapshot.
- claude-verify: plan_overlay maps each rw single-file bind to files_dir/src.name. Two such binds with the same basename from different directories would share one clone file (r5_stack.py:258).

## Findings

A: 0
B: 2
C: 1

### claude-read:R1-port-not-reserved — bucket B, LOW, open

Claim: free_port only checks whether a port can be bound when `clone` runs. It ignores ports already recorded in other worktrees' .r5-stack/env.json, so two worktrees cloned before either runs `up` both get 3101.
Impact: The second `up` fails with Docker's port-already-allocated error, and the user has to `destroy` and `clone --port N` again. This fails loudly, not silently.
Evidence: scripts/dev/r5_stack.py free_port binds 0.0.0.0:port and releases it immediately; cmd_clone writes the port into env.json, and nothing reads other worktrees' state.
Repro: not_reproduced: `clone` in worktree A, `clone` in worktree B, then `up` in A and `up` in B → B fails to publish 3101.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:R1-touchpoints-undeclared — bucket B, INFO, open

Claim: No invariants file and therefore no touch-point list is declared for this change, so every place it reaches is outside a declared list: the three edited paths (.gitignore, docs/process/PROJECT.md, scripts/dev/r5_stack.py), plus, at runtime, the main checkout's data/ (read and APFS-cloned), running containers of other stacks that mount it (docker exec / docker cp of a /tmp snapshot file), the shared drive directories, and the main checkout's drives.json/passwords.json (copied).
Impact: A later reviewer cannot tell planned reach from accidental reach. In particular, the runtime reach into other stacks' containers and onto the shared drives is not listed anywhere a person could approve it.
Evidence: docs/process/reviews/feature-r5-parallel-stacks/r1/classification.json lists zones .gitignore, docs/process/PROJECT.md and scripts/dev/r5_stack.py; no invariants file exists. scripts/dev/r5_stack.py snapshot_live_db runs `docker exec <container> python3 -c ...` and `docker cp` against any running container whose bind source is under or above main data/; clone_tree runs `cp -c -R` on main data/ and, with --with-drives, on every backend drive source; plan_overlay shutil.copy2s rw single-file binds under the main checkout.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Declare the touch points (including the runtime reach into other stacks' containers and the shared drives) if an invariants file is written for this change.

</details>

### claude-read:R1-autopurge-shared-drives — bucket C, MEDIUM, open

Claim: Without --with-drives, a cloned stack's backend deletes real files on the shared drives on its own, with no user action: at every startup and every 24 h after, purge_expired_trash physically deletes every file that the cloned DB lists as trashed for more than TRASH_RETENTION_DAYS. That DB is a snapshot that never sees later changes made in the main checkout.
Impact: A file trashed in the main checkout shortly before `clone` and restored there afterwards is still expired trash in the clone. The clone's next `up`, or a later daily pass, unlinks the restored file from the shared drive without any message. The main stack's DB then holds a row for a missing file. PROJECT.md says the drives only need cloning for a run that 'moves, trashes, purges or uploads files', so a reader would not expect this risk from a run that only reads.
Evidence: backend/app/main.py:288 starts purge_expired_trash at every startup; main.py:138-159 loops every 86400 s; main.py:96 calls physical_delete, and backend/app/services/fileops.py:674-675 unlinks the file on the drive. scripts/dev/r5_stack.py plan_overlay only redirects drive binds when with_drives is set, so the backend mounts /Users/.../video_share/videos read-write. decisions.md records that the cloned DB held 3 expired trash rows and that 'the startup auto-purge runs on every `up` even without --with-drives'.
Repro: not_reproduced: in the main stack, trash a file on drive 動画; wait until it is almost TRASH_RETENTION_DAYS old; run `r5_stack.py clone`; restore the file in the main stack; after the cutoff passes, run `r5_stack.py up` → the clone's backend purges the file from the shared videos directory.
Introduced: introduced
Reviewer bucket: C | Author bucket: 

<details><summary>Proposed fix</summary>

> When drives are not cloned, have the clone's backend skip the purge (or mount the drives read-only), or have `clone` refuse while the cloned DB holds trash rows near or past the cutoff. Update the PROJECT.md bullet so it no longer implies that a read-only run is safe.

</details>

## Not verified

- claude-read: Did not run the script or docker; all behaviour is from reading the code.
- claude-read: Did not confirm that docker compose merges the long-syntax overlay volumes over the short-syntax base by target in the installed compose version (decisions.md says this was observed).
- claude-read: Did not check whether scan_all_drives, drive_seed bootstrap or cleanup_abandoned_uploads write to the drive directories.
- claude-read: Did not check the value of TRASH_RETENTION_DAYS or whether the restore path changes deleted_at in a way that would affect the scenario.
- claude-verify: I did not run the script, docker or compose, so all checks are static reading only.
- claude-verify: I did not inspect docker-compose.override.yml, which is not tracked or was not found by grep, to confirm the drive bind sources directly. I relied on decisions.md step (4).
- claude-verify: I did not verify whether macOS `cp -c` fails or falls back to a full copy when a clone is impossible on the same volume.
- claude-verify: I did not check whether other services such as intelligence or knowledge also run purges or deletes against the drives.

TOTAL: 3 findings
