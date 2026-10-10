# configure.py keeps the GUI-owned config files

SPEC-ID: SPEC-CORE-004
SPEC-ID: SPEC-CORE-005

Approval:

## Summary

Re-running `python3 configure.py` on an install that has finished `/setup` can wipe
every password and every drive name with one "y" to an `Overwrite?` prompt. It writes
`[]` to `passwords.json` and `drives.json`, the backend then reseeds the drives from the
mounts under their directory names, and every protected drive becomes public with no
error anywhere. That happened on the production install on 2026-10-07. `configure.py`
only needs these files to exist, so the single-file bind mounts do not become
directories; their contents belong to `/setup` and `/admin/settings`.

This change makes `configure.py`:

- never overwrite an existing `passwords.json`, in any state (SPEC-CORE-004);
- once `data/setup_completed` exists, leave an existing `drives.json` as it is without
  asking, and say that a changed mount is updated in `/admin/settings`
  (SPEC-CORE-004);
- once `data/setup_completed` exists, leave an existing
  `addons/intelligence/search-config.yml` as it is without asking (SPEC-CORE-005).

`drives.json` and `search-config.yml` keep today's prompt before setup is completed,
because the documented way to change mounts during first run is to re-run
`configure.py` and reset `drives.json` to `[]` so the backend reseeds it. Resetting
`passwords.json` is never part of a documented flow, so it is protected in every state.

It is for the one operator of an install, who re-runs `configure.py` to add a mount,
change the port, or enable an addon.

## Required items

### 1. Normal flow

1. The operator runs `python3 configure.py` in the repository root.
2. It asks the same questions as today (drive mounts, port, addons).
3. It prints the "Files to generate" summary, then asks "Generate files?".
4. It writes `event-hooks.json` and asks about `docker-compose.override.yml` as today.
5. It handles the three files by the state table in item 3. A file kept without a
   prompt gets one printed line that names it and says it was kept. A file kept because
   the operator answered no to its prompt prints nothing, as today.
6. When `drives.json` is kept without a prompt, the kept line for it also says that a
   mount added, removed or renamed in this run has to be added, fixed or removed under
   Drives in `/admin/settings`. `configure.py` does not read the entries of
   `drives.json` for this; the line is the same on every such run.
7. `.env` and the rest of the run are unchanged.

### 2. Failure cases

- `drives.json` cannot be parsed: it is kept by existence alone, so nothing changes for
  it. (`ExistingConfig` already tolerates this when reading defaults.)
- A file that exists as a directory (the bind-mount footgun): in a "keep, no prompt"
  cell it is kept and the kept line is printed, with no crash. In a prompted cell
  (before setup) behaviour is unchanged: a "y" still raises `IsADirectoryError`. The
  operator removes the directory by hand, as the docs already say.
- `data/` does not exist (a fresh clone): `setup_completed` is absent, so the pre-setup
  rows apply.
- The run is aborted at "Generate files?": nothing is written and no warning is printed,
  as today.

### 3. States

The decision depends on whether `data/setup_completed` exists and whether the file
exists. The summary in step 3 uses the same table as the write step.

| setup_completed | file exists | passwords.json | drives.json | search-config.yml (intelligence on) |
|---|---|---|---|---|
| no | no | write `[]` | write `[]` | copy the example |
| no | yes | keep, no prompt | ask, default n; `[]` on yes | ask, default n; copy on yes |
| yes | no | write `[]` | write `[]` | copy the example |
| yes | yes | keep, no prompt | keep, no prompt, with the step 6 note | keep, no prompt |

`configure.py` never creates or removes `data/setup_completed`.

Summary lines ("Files to generate"): a file that will be written keeps today's line. A
file that will be kept is listed as `<name>  (kept — edited in /admin/settings)` for
`passwords.json` and `drives.json`, and `addons/intelligence/search-config.yml  (kept)`.
A file that will be prompted keeps today's line. The line for a written file is
today's line in both states.

### 4. Data read and written

- Read: `data/setup_completed`, `passwords.json`, `drives.json` and
  `addons/intelligence/search-config.yml`, each for existence only. (`ExistingConfig`
  still reads `drives.json` entries for the prompt defaults, as today.)
- Written: the same three files, only in the cells of item 3 that say write or copy.
- Unchanged: `docker-compose.override.yml` handling, `.env`, `event-hooks.json`, and
  everything under `data/`.

### 5. External services

None. `configure.py` calls no service; `docker compose up` at the end is unchanged.

### 6. Authorization

None. It is a local script run by whoever has a shell in the install directory, as
today.

### 7. Effect on existing features

- Backend startup seed (`backend/app/services/drive_seed.py`): it reseeds only when
  `drives.json` is exactly `[]`. After setup a re-run no longer produces that `[]`, so it
  no longer replaces the drive list with directory names. Before setup it behaves as
  today.
- Adding a mount after setup (`docs/admin-guide/settings-gui.md`): re-run, rebuild, then
  **Add drive** in `/admin/settings`. It never relied on the reset, so it still works.
- Removing or renaming a mount after setup: `drives.json` keeps the old entry, which now
  points at a path that is not mounted. The step 6 note tells the operator to fix it in
  `/admin/settings`. Before this change a "y" reseeded instead, losing every name and
  group.
- Changing mounts during first run (`docs/getting-started/first-run-setup.md`):
  unchanged for `drives.json`.
- Running the wizard again (`first-run-setup.md`, delete `data/setup_completed`), and an
  install from before the marker existed that runs the new `configure.py` before its
  backend first boots: `passwords.json` is protected in both, because it is kept in every
  state. `drives.json` and `search-config.yml` keep today's prompt there.
- `ExistingConfig._load` reads default slugs from `drives.json`. A kept file now feeds
  those defaults on every re-run, as it already does when the operator answers no. An
  entry whose mount was removed and not yet removed in `/admin/settings` raises the
  default drive count, and its host path defaults to `<repo>/videos`; the step 6 note is
  what tells the operator to clean it up.
- `first_run` (the address printed at the end) reads the same marker; it is unchanged.
- Restoring defaults on purpose: the operator writes `[]` or copies the example by hand,
  as `docs/reference/configuration.md` already describes.

### 8. Error behavior

No new errors. The operator sees the kept lines, including the step 6 note, on stdout.
Nothing new is logged by the backend.

### 9. User-visible behavior

- The `passwords.json already exists. Overwrite?` prompt is gone in every state.
- After setup, the `drives.json` and `search-config.yml` `Overwrite?` prompts are gone.
- Each file kept without a prompt prints one line naming the file and saying it was
  kept. For `passwords.json` and `drives.json` the line says they are edited in
  `/admin/settings`; for `drives.json` it adds the step 6 note.
- The "Files to generate" summary follows item 3.
- Before setup, `drives.json` and `search-config.yml` prompts and output are unchanged.
- Docs that say `configure.py` always writes `[]` to these files, or that a "y" resets
  them, are corrected.

### 10. Non-functional

Stdlib only, as `configure.py` is today. No new dependency, no new file.

## Touch points

- `configure.py` (risk zone HIGH): the `drives.json`, `passwords.json` and
  `search-config.yml` write blocks, the "Files to generate" summary, and the module
  docstring. The
  shared `check_overwrite` helper stays as it is, because the
  `docker-compose.override.yml` prompt keeps using it.
- `tests/test_configure.py`, `tests/test_configure_presentation.py`,
  `tests/configure_scenarios.py`, `tests/fixtures/configure/`: scenarios with and
  without `data/setup_completed`. The existing fixtures do not create the marker and
  stay byte-identical except where an existing `passwords.json` would have been
  prompted.
- `CLAUDE.md` (Docker section) and `.claude/rules/design-decisions.md` (Access control):
  the sentence that `configure.py` always generates an empty `passwords.json` /
  `drives.json`.
- `docs/reference/configuration.md`, `docs/admin-guide/docker-compose.md`,
  `docs/admin-guide/settings-gui.md`, `docs/getting-started/installation.md`,
  `docs/addons/intelligence.md`: what a re-run writes.
- `docs/developer-guide/known-issues.md`: the "Re-running `configure.py` over a
  hand-edited override" entry, narrowed to the override prompt and the pre-setup
  `drives.json` / `search-config.yml` prompts.
- No protected path is edited.

## Invariants

I1. A run of `configure.py` that reaches the file-writing step leaves an existing `passwords.json` byte-for-byte unchanged, whatever the operator answers, with or without `data/setup_completed`.
I2. With `data/setup_completed` present, a run that reaches the file-writing step leaves an existing `drives.json` byte-for-byte unchanged, whatever the operator answers.
I3. With `data/setup_completed` present and intelligence enabled, a run leaves an existing `addons/intelligence/search-config.yml` byte-for-byte unchanged, whatever the operator answers.
I4. No prompt asks whether to overwrite `passwords.json`; with `data/setup_completed` present, no prompt asks whether to overwrite `drives.json` or `search-config.yml`.
I5. Whenever `drives.json` or `passwords.json` is absent when the file-writing step runs, it exists as a regular file containing `[]` afterwards; whenever intelligence is enabled and `search-config.yml` is absent, it is a copy of the example afterwards; both with or without `data/setup_completed`.
I6. Without `data/setup_completed`, an existing `drives.json` or `search-config.yml` is replaced only when the operator answers yes to its `Overwrite?` prompt, and the prompt's default is no.
I7. Every file kept without a prompt prints a line naming that file, and the "Files to generate" summary lists it as kept rather than as generated.
I8. When `drives.json` is kept without a prompt, the run prints a line that points to `/admin/settings` for drives whose mount was added, removed or renamed.
I9. `configure.py` neither creates nor removes `data/setup_completed`.
I10. Whenever `configure.py` writes `docker-compose.override.yml`, it mounts `./passwords.json:/app/passwords.json` read-write, with or without `data/setup_completed`.
I11. A file in a "keep, no prompt" cell that exists as a directory does not stop the run: it is left in place and the run completes.

## Checked, no action

- **Key everything on the file existing, regardless of setup state.** Rejected for
  `drives.json`: during first run the documented way to change mounts is to re-run
  `configure.py` and reset `drives.json` so the backend reseeds it. Adopted for
  `passwords.json`, which no documented flow resets.
- **Key on file contents (a non-empty file is kept).** Not needed: `passwords.json` is
  kept whenever it exists, and a seeded `drives.json` is non-empty before setup too, so
  contents cannot tell a seed from the operator's settings.
- **Back up the file before overwriting instead of refusing.** Rejected: after setup
  there is no reason for `configure.py` to write these files, and a backup the operator
  does not know about still leaves every drive public until they find it.
- **`docker-compose.override.yml` overwrite prompt.** Kept. It is `configure.py`'s own
  output, and the documented way to add a mount is to let it overwrite the override.
- **`.env`.** Already preserved: existing secrets and the setup token are read back and
  rewritten with the same values, and `LLM_API_KEY` changes only on an explicit yes.
- **`event-hooks.json`.** Generated from the addon manifests on every run with no
  interaction; it holds no operator settings.
- **A kept file that is a directory.** Pre-existing; the docs already tell the operator
  to remove it. Not handled here.
- **Comparing `drives.json` entries with the configured mounts and warning per drive.**
  Rejected: it needs a slug rule for nested paths (`/admin/settings` accepts any
  directory), a defined mount set when the override prompt is declined, and handling for
  malformed entries, all to name a drive the operator just removed themselves. A fixed
  note covers removed, renamed and added mounts alike.
- **Stop `ExistingConfig` from reading slugs from `drives.json` after setup.** Not done
  here. Before setup the seeded entries equal the mounts, and after setup a stale entry
  is what the step 6 note asks the operator to clean up. Changing where the defaults come
  from also changes the regenerated override and intelligence's `DRIVE_MOUNTS`.
- **The written-file lines after setup still mention `/setup`** (only reached when a file
  is missing after setup). Left as today; the footgun guard is the point of that write.
- **The data directory mounted somewhere other than `data/`.** The marker is looked up
  at `data/setup_completed`, as `first_run` already does; such an install sees the
  pre-setup rows, and `passwords.json` is still kept.
- **The sidebar does not refresh after unlocking (the unlock page navigates with
  `router.push` and never asks the sidebar to reload `authStatus`).** A separate defect
  found while investigating; not the cause of this incident. It needs its own change.
