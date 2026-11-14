# Triage: r2

## Warnings

- R-5 ran at 564cf63171242267b7339f2a23d7af61cb1b9f8c, and these files changed since: scripts/dev/r5_stack.py; run R-5 again if any of them changes what a user sees

## Trajectory

This run:
- claude-read: 672b795 replaced two parallel mechanisms with one shared helper, drive_sources. The first was the with_drives-only target set in plan_overlay; the second was the backend-name/target clause in shared_writes. The commit also removed the with_drives parameter from shared_writes, which is one less state. It added one branch: an uncloned rw drive becomes ro. On balance that round consolidated rather than patched. 8fbe25c added a second path, stop(), that goes around the check that the round before had tightened, because the stricter check made `down` unreachable. That fixes a consequence of the earlier round with a special case per command: the `compose` passthrough still has the old behaviour. So the second round shows mild patching around the check's scope ('guard only what starts'), and the rule is applied per entry point, not by what the compose subcommand does. Neither round added a new prediction about runtime state.

Earlier runs:
- none

C findings so far: 1

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: With --with-drives, shared_writes drops every drive source under .r5-stack (r5_stack.py:286). The merged backend config then points only at clones, so the drive list is empty and the pre-run check no longer guards any original drive path. The only protection for a non-backend service that writes an original drive is plan_overlay's redirect.; Without --with-drives, file operations in the clone (rename, upload, move) fail as HTTP 500s. decisions.md step (5) records that the rename dialog stays open with no error message. The developer sees a raw failure, not a message that the drives are read-only.; Without --with-drives, every startup and daily purge in the clone logs one exception per expired trash row and a 'left N file(s) behind' warning, because unlink raises EROFS. This log noise is expected, but nothing in the script mentions it.
- claude-read: With --with-drives, shared_writes drops every drive source under .r5-stack (r5_stack.py:286). The merged backend config then points only at clones, so the drive list is empty and the pre-run check no longer guards any original drive path. The only protection for a non-backend service that writes an original drive is plan_overlay's redirect.
- claude-read: Without --with-drives, file operations in the clone (rename, upload, move) fail as HTTP 500s. decisions.md step (5) records that the rename dialog stays open with no error message. The developer sees a raw failure, not a message that the drives are read-only.
- claude-read: Without --with-drives, every startup and daily purge in the clone logs one exception per expired trash row and a 'left N file(s) behind' warning, because unlink raises EROFS. This log noise is expected, but nothing in the script mentions it.
- claude-verify: Drive detection compares strings exactly, so a drives.json path with a trailing slash or other unnormalised form does not match its bind target. That drive is then not made read-only and the check does not flag it.
- claude-verify: The compose passthrough applies the mount check even to teardown subcommands (down, stop, rm).

### unspecified_behavior

Note: Drive detection compares strings exactly, so a drives.json path with a trailing slash or other unnormalised form does not match its bind target. That drive is then not made read-only and the check does not flag it.; The compose passthrough applies the mount check even to teardown subcommands (down, stop, rm).
- claude-read: With --with-drives, shared_writes drops every drive source under .r5-stack (r5_stack.py:286). The merged backend config then points only at clones, so the drive list is empty and the pre-run check no longer guards any original drive path. The only protection for a non-backend service that writes an original drive is plan_overlay's redirect.
- claude-read: Without --with-drives, file operations in the clone (rename, upload, move) fail as HTTP 500s. decisions.md step (5) records that the rename dialog stays open with no error message. The developer sees a raw failure, not a message that the drives are read-only.
- claude-read: Without --with-drives, every startup and daily purge in the clone logs one exception per expired trash row and a 'left N file(s) behind' warning, because unlink raises EROFS. This log noise is expected, but nothing in the script mentions it.
- claude-verify: Drive detection compares strings exactly, so a drives.json path with a trailing slash or other unnormalised form does not match its bind target. That drive is then not made read-only and the check does not flag it.
- claude-verify: The compose passthrough applies the mount check even to teardown subcommands (down, stop, rm).

## Findings

A: 0
B: 2
C: 0

### claude-read:R2-compose-passthrough-down-still-gated — bucket B, LOW, open

Claim: 8fbe25c removes the mount check from `down` and `destroy` only. `r5_stack.py compose down`, `compose stop` and `compose rm` still go through verified_env and are refused while the overlay fails the check.
Impact: A user who stops the stack through the documented `compose ARGS...` passthrough gets 'the stack would still write the main checkout's state' and the stack keeps running. This is the case 8fbe25c meant to fix, reached through another command. It fails loudly.
Evidence: r5_stack.py:362-364 `compose()` always calls verified_env. main() at :416-417 sends `compose` to it whatever the arguments are. Only the `down` and `destroy` paths call stop() (:368-371, :389, :419).
Repro: not_reproduced: make the overlay fail the check (as in decisions.md step 7), then run `r5_stack.py compose down`. Expected exit 1 with the refusal, and the containers stay up.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Skip the check in the passthrough for subcommands that do not start containers (down, stop, kill, rm, ps, logs), or document that `down` is the only way to stop a stack whose overlay fails the check.

</details>

### claude-read:R2-drive-detection-by-exact-target — bucket B, LOW, open

Claim: Both the read-only rewrite in plan_overlay and the drive clause in shared_writes recognise a drive only when a backend bind's target equals a drives.json `path` exactly (drive_sources, scripts/dev/r5_stack.py:231-238). A drive mounted through a parent bind, such as `/host/drives:/app/drives` with drives.json paths `/app/drives/<slug>` (the layout drive_seed.seed_drives_from_mounts is built for), is therefore not treated as a drive. It stays read-write and the pre-run check does not flag it.
Impact: With that mount layout, a clone stack without --with-drives keeps the shared drives writable. The startup and daily trash purge from r1 can then unlink files on the shared drive that the main checkout restored, and neither `clone` nor `up` reports anything. The layout in use today (decisions.md: per-drive targets /app/drives/default and /app/drives/test_images) is not affected.
Evidence: r5_stack.py:237 uses `vol["target"] in targets`. plan_overlay:263 and shared_writes:296 test only `is_under(src, d)` against those sources. A directory bind under the main checkout that is not data/ and not a matched drive falls through every branch at :265-275 and every clause at :293-297. backend/app/services/drive_seed.py:52-71 seeds drives.json as `{root}/{slug}` from subdirectories of DRIVES_MOUNT_ROOT (/app/drives), so a single parent mount is a layout the app supports.
Repro: not_reproduced: in docker-compose.override.yml, bind a host directory that holds drive folders to /app/drives, with drives.json listing /app/drives/a. Then `r5_stack.py clone` and `compose config`: the /app/drives bind has no read_only and clone succeeds.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Treat a bind as a drive when its target equals a drives.json path or is an ancestor of one. Or, without --with-drives, make every backend bind outside data/ and outside the single files read-only.

</details>

## Not verified

- claude-read: I did not run the script, docker or compose. All checks are static reading.
- claude-read: I could not read docker-compose.override.yml (untracked in this worktree), so the drive mount layout comes from decisions.md.
- claude-read: I did not check whether the intelligence or other addon services fail or degrade on a read-only drive, beyond decisions.md saying all 4 containers were healthy.
- claude-read: I did not check where upload temp files and HEIC conversion caches are written for every code path, beyond physical_delete and decisions.md step (6).
- claude-verify: I did not run the script or docker compose, so the behaviour comes from reading the code only.
- claude-verify: I did not confirm that the worktree files match commit 8fbe25c byte for byte. The git status at session start showed only untracked docs, so I assumed they do.
- claude-verify: I did not check how `docker compose config --format json` normalises bind targets, for example trailing slashes.

TOTAL: 2 findings
