# Triage: r4

## Warnings

- R-5 ran at 564cf63171242267b7339f2a23d7af61cb1b9f8c, and these files changed since: scripts/dev/r5_stack.py; run R-5 again if any of them changes what a user sees

## Trajectory

This run:
- claude-read: 486eb96 only adds review documents. c216434 removes more than it adds. It drops the round-by-round inference of which binds are drives as a safety mechanism: the `drive is not None and not read_only` branch is gone, and so are the three-clause `shared` predicate and the uncloned-drive list in shared_writes. In their place is one layout-independent rule: every read-write bind outside .r5-stack becomes read-only, and the check flags any that is not. Drive detection is now used only to choose what --with-drives clones. It also replaces the per-entry-point bypass stop() from 8fbe25c with one path through compose(). This round ends the pattern r2 and r3 identified, in which 672b795, 09e716a and the r3-proposed fix each widened the same drive prediction. It does add one new prediction, the NON_STARTING set keyed on args[0]. That is a classification of compose subcommands, and future rounds could patch it the same way, for leading global options or for exec/config/restart. On balance, this round removed a branch and a state rather than repeating one.

Earlier runs:
- r2 / claude-read: 672b795 replaced two parallel mechanisms with one shared helper, drive_sources. The first was the with_drives-only target set in plan_overlay; the second was the backend-name/target clause in shared_writes. The commit also removed the with_drives parameter from shared_writes, which is one less state. It added one branch: an uncloned rw drive becomes ro. On balance that round consolidated rather than patched. 8fbe25c added a second path, stop(), that goes around the check that the round before had tightened, because the stricter check made `down` unreachable. That fixes a consequence of the earlier round with a special case per command: the `compose` passthrough still has the old behaviour. So the second round shows mild patching around the check's scope ('guard only what starts'), and the rule is applied per entry point, not by what the compose subcommand does. Neither round added a new prediction about runtime state.
- r3 / claude-read: 09e716a again changes the same prediction, which binds count as drives. 672b795 consolidated that prediction into drive_sources, and this commit widens it there: it adds the ancestor match and path normalisation. It adds no branch or state in the callers, so the fix stays inside the one helper and does not spread. Still, this is the third round that adjusts how drives are inferred from mount targets, and the inference still covers only one direction (it misses binds below a drive path). That is a sign the design is being patched one layout at a time instead of fixing a rule such as 'without --with-drives, every non-data backend directory bind is read-only'. 59d3c3f only adds documents and removes nothing. The per-entry-point bypass from 8fbe25c (stop()) was not extended to the compose passthrough, so the r2 inconsistency remains.

C findings so far: 1

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: A read-write bind whose host source does not exist (for example passwords.json bound in the override while the main checkout lacks it) is rewritten into a long-syntax read-only overlay entry with no `bind.create_host_path`. Whether compose keeps the base entry's create_host_path when it merges by target decides between two outcomes: `up` fails with 'bind source path does not exist', or Docker creates a directory outside .r5-stack.; Binds outside the main checkout that a service needs to write (for example a host model cache or a socket directory added in a future override) are now silently made read-only. That service then fails at run time rather than at `clone`.; Non-bind volumes (named volumes, external volumes) are neither redirected nor checked. They are isolated only because the compose project name defaults to the worktree directory name. A COMPOSE_PROJECT_NAME in the symlinked .env, or a top-level `name:`, would make the clone share them, or the containers themselves, with the main stack.; `compose config`, `compose exec` and `compose restart` go through the check and are refused while the overlay fails it, although they start nothing new.
- claude-read: A read-write bind whose host source does not exist (for example passwords.json bound in the override while the main checkout lacks it) is rewritten into a long-syntax read-only overlay entry with no `bind.create_host_path`. Whether compose keeps the base entry's create_host_path when it merges by target decides between two outcomes: `up` fails with 'bind source path does not exist', or Docker creates a directory outside .r5-stack.
- claude-read: Binds outside the main checkout that a service needs to write (for example a host model cache or a socket directory added in a future override) are now silently made read-only. That service then fails at run time rather than at `clone`.
- claude-read: Non-bind volumes (named volumes, external volumes) are neither redirected nor checked. They are isolated only because the compose project name defaults to the worktree directory name. A COMPOSE_PROJECT_NAME in the symlinked .env, or a top-level `name:`, would make the clone share them, or the containers themselves, with the main stack.
- claude-read: `compose config`, `compose exec` and `compose restart` go through the check and are refused while the overlay fails it, although they start nothing new.

## Findings

A: 0
B: 2
C: 0

### claude-read:R4-file-copy-basename-collision — bucket B, LOW, open

Claim: plan_overlay copies every read-write single-file bind under the main checkout to .r5-stack/files/<basename> and skips the copy if that path already exists. Two such binds with the same basename from different directories therefore both mount whichever file was copied first.
Impact: A service would silently read the wrong configuration file in the cloned stack. No error or warning is raised. None of the files bound read-write in the shipped layouts (drives.json, passwords.json) share a basename today, so a user hits this only after adding such a bind.
Evidence: scripts/dev/r5_stack.py:278-282: `new = files_dir / src.name; if not new.exists(): shutil.copy2(src, new)`. The second bind with the same name reuses the first copy. shared_writes (:293-) skips anything under .r5-stack, so the check does not catch it.
Repro: not_reproduced: bind ./a/config.json and ./b/config.json read-write (both under the main checkout) into two services, then run `clone`. Expected: both overlay entries point at .r5-stack/files/config.json, which holds a's content.
Introduced: pre-existing
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Mirror the path relative to the main checkout under files/ (files/<relpath>) instead of using the basename.

</details>

### claude-read:R4-non-starting-by-first-arg — bucket B, LOW, open

Claim: compose() decides whether to skip the check by looking only at args[0]. A passthrough that puts a global compose option before the subcommand, such as `compose --profile x down` or `compose --ansi never stop`, is still refused while the overlay fails the check.
Impact: This is a narrower version of the r2/r3 passthrough issue. Stopping a stack whose overlay fails the check with a leading global option prints the refusal and leaves the stack running. The failure is loud, and the top-level `down` works.
Evidence: scripts/dev/r5_stack.py compose(): `if args and args[0] in NON_STARTING:`. Every other argument list goes through verified_env, which raises Abort when shared_writes reports problems.
Repro: not_reproduced: make the overlay fail the check, then run `r5_stack.py compose --profile x down`. Expected: exit 1 with 'the stack could still write outside .r5-stack/'.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Find the first argument that does not start with '-' (skipping option values), or document that global options must come after the subcommand.

</details>

## Not verified

- claude-read: I did not run the script, docker or docker compose. Everything here comes from reading the code.
- claude-read: I did not check how compose-go merges a long-syntax overlay bind over a short-syntax base bind with the same target, in particular whether bind.create_host_path is kept.
- claude-read: I did not read the untracked docker-compose.override.yml or .env in the main checkout, so I did not confirm the binds or the COMPOSE_PROJECT_NAME in use.
- claude-read: I did not check whether the backend or the addons write to any non-data bind at startup, which would now fail on the read-only mount.
- claude-verify: I did not run docker compose, so I could not check how real `compose config` output normalizes bind sources.
- claude-verify: I did not check the contents of docker-compose.override.yml, if the user has one locally.
- claude-verify: I did not search tests/ for coverage of r5_stack.py.

TOTAL: 2 findings
