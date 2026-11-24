# Triage: r3

## Warnings

- R-5 ran at 564cf63171242267b7339f2a23d7af61cb1b9f8c, and these files changed since: scripts/dev/r5_stack.py; run R-5 again if any of them changes what a user sees

## Trajectory

This run:
- claude-read: 09e716a again changes the same prediction, which binds count as drives. 672b795 consolidated that prediction into drive_sources, and this commit widens it there: it adds the ancestor match and path normalisation. It adds no branch or state in the callers, so the fix stays inside the one helper and does not spread. Still, this is the third round that adjusts how drives are inferred from mount targets, and the inference still covers only one direction (it misses binds below a drive path). That is a sign the design is being patched one layout at a time instead of fixing a rule such as 'without --with-drives, every non-data backend directory bind is read-only'. 59d3c3f only adds documents and removes nothing. The per-entry-point bypass from 8fbe25c (stop()) was not extended to the compose passthrough, so the r2 inconsistency remains.

Earlier runs:
- r2 / claude-read: 672b795 replaced two parallel mechanisms with one shared helper, drive_sources. The first was the with_drives-only target set in plan_overlay; the second was the backend-name/target clause in shared_writes. The commit also removed the with_drives parameter from shared_writes, which is one less state. It added one branch: an uncloned rw drive becomes ro. On balance that round consolidated rather than patched. 8fbe25c added a second path, stop(), that goes around the check that the round before had tightened, because the stricter check made `down` unreachable. That fixes a consequence of the earlier round with a special case per command: the `compose` passthrough still has the old behaviour. So the second round shows mild patching around the check's scope ('guard only what starts'), and the rule is applied per entry point, not by what the compose subcommand does. Neither round added a new prediction about runtime state.

C findings so far: 1

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: A drive whose path lies under /app/data would make ./data a drive source. With --with-drives, the main data/ would then be cloned a second time, without a live-DB snapshot, into .r5-stack/drives/N-data. That clone goes unused because the data branch in plan_overlay takes precedence, so it only costs time and space.; With nested backend binds (a parent and a child that both hold drives), --with-drives clones the child separately as well. That clone is never mounted, because the child bind is redirected into the parent's clone.
- claude-read: A drive whose path lies under /app/data would make ./data a drive source. With --with-drives, the main data/ would then be cloned a second time, without a live-DB snapshot, into .r5-stack/drives/N-data. That clone goes unused because the data branch in plan_overlay takes precedence, so it only costs time and space.
- claude-read: With nested backend binds (a parent and a child that both hold drives), --with-drives clones the child separately as well. That clone is never mounted, because the child bind is redirected into the parent's clone.

## Findings

A: 0
B: 2
C: 0

### claude-read:R3-compose-passthrough-still-gated — bucket B, LOW, open

Claim: r2 finding R2-compose-passthrough-down-still-gated is unchanged. `r5_stack.py compose down`, `compose stop` and `compose rm` still go through verified_env and are refused while the overlay fails the check.
Impact: A user who stops the stack through the documented `compose ARGS...` passthrough gets the refusal and the stack keeps running. `down` works, and the failure is loud.
Evidence: scripts/dev/r5_stack.py compose() calls verified_env on every call, and main() sends every `compose` argument list there. Only `down` and `destroy` call stop(). Neither 09e716a nor 59d3c3f touches these paths.
Repro: not_reproduced: make the overlay fail the check, then run `r5_stack.py compose down`. Expected: exit 1 with 'the stack would still write the main checkout's state'.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Skip verified_env in the passthrough for subcommands that do not start containers (down, stop, kill, rm, ps, logs).

</details>

### claude-read:R3-drive-below-bind-target-missed — bucket B, LOW, open

Claim: drive_sources treats a backend bind as a drive only when the bind's target equals a drives.json path or is an ancestor of one. A bind whose target lies below a drive path, such as drive path /app/drives/media with host directories bound at /app/drives/media/a and /app/drives/media/b, is therefore still not recognised. It stays read-write and shared_writes does not flag it.
Impact: With that layout, a cloned stack without --with-drives keeps those parts of the shared drive writable. The snapshot DB's startup and daily trash purge, or any file operation, can then change shared files, and nothing reports it. The documented layouts (one bind per drive in docker-compose.override.yml.example:19-22 and in the configure fixtures) are not affected.
Evidence: scripts/dev/r5_stack.py drive_sources: `any(t == target or t.startswith(target.rstrip("/") + "/") for t in targets)` matches only drive paths at or below the bind target. With target=/app/drives/media/a and t=/app/drives/media, neither clause is true. plan_overlay then finds no drive for the bind; it is a directory, so the is_file branch is skipped and no overlay entry is written. shared_writes checks only is_under(src, d) against the same sources, so nothing is flagged.
Repro: not_reproduced: drives.json [{"path": "/app/drives/media"}]; in the override, bind `/host/a:/app/drives/media/a` on the backend; run `r5_stack.py clone`. Expected: clone succeeds and the merged config has no read_only on /app/drives/media/a.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Also count a bind as a drive when its target is under a drives.json path. Alternatively, without --with-drives, mount every backend directory bind outside data/ read-only.

</details>

## Not verified

- claude-read: I did not run the script, docker or compose. All checks come from reading the code.
- claude-read: I did not read the untracked docker-compose.override.yml, so I did not confirm the mount layout in use today.
- claude-read: I did not check how `docker compose config --format json` normalises bind targets, for example a double leading slash, which posixpath.normpath keeps.
- claude-verify: I did not run r5_stack.py or docker compose. Both conclusions come from reading the code.
- claude-verify: I did not check whether any test file covers drive_sources or the compose passthrough.
- claude-verify: I did not check the user's actual compose override files to see whether they contain a bind below a drive path.

TOTAL: 2 findings
