# Project facts

What is specific to Litloft. The process documents under `docs/process/` read this file;
the project's own design rules are in `.claude/rules/` (see the Rules index in
`CLAUDE.md`).

## What the project is

Litloft is a file manager and video streaming web app for a home LAN, run with Docker
Compose. One person runs it for their household; addons (git submodules under `addons/`)
add AI, sync and import features, and an iOS app wraps the web UI.

## Threat model

A personal tool. Its single user writes the inputs and the configuration, and no
adversary exists. A defect is what silently passes a check or silently gives a wrong
result in normal use; misuse and crafted input are out of scope.

Litloft is a home-LAN personal tool with first-party addons only, so this model applies
as written.

## Stack

- Backend: FastAPI on Python 3.12, SQLite through SQLAlchemy, ffmpeg. Tests are pytest
  and run inside Docker only (`backend/Dockerfile.test`); local Python is not supported.
- Frontend: Next.js 16 (App Router, TypeScript), Tailwind CSS v4, pnpm. Tests are
  vitest on jsdom plus Playwright suites in `frontend/e2e-layout/`,
  `frontend/e2e-components/` and `frontend/e2e-epub/`.
- `mcp-server/`: TypeScript, vitest.
- `ios/`: a Swift app around the web UI, XCTest in `ios/LitloftTests/`.
- Addons: separate repositories under `addons/` with their own tests and CI.

## How to run the gates

`scripts/process/precheck.sh --profile local` runs one project gate,
`scripts/process-gates/frontend.sh`. It runs `merge-addon-messages`, vitest, `tsc` and
eslint in `frontend/` only when the change since the merge base with `base_ref` (plus
uncommitted and untracked files) touches `frontend/` or `addons/*/frontend/`; otherwise
it prints `frontend-gate: skipped`. It needs `frontend/node_modules` (`pnpm install` in
`frontend/`) and, for addon frontends, `./setup-addons.sh`.

The backend tests are not a local gate: they need Docker and run in `ci.yml`, as do the
coverage floors and the Playwright suites. `process.yml` runs precheck with the `ci`
profile, which has no project gate, because `ci.yml` already runs the frontend checks.

Wait for CI inside the turn, with a bound, rather than polling:

```bash
timeout 3600 gh pr checks <PR> --watch --fail-fast
```

Right after a push no check is registered yet, so a loop that waits for `pending` to
disappear exits without having waited.

## Review in this project

- `scripts/process/review.sh` is the default review.
- A large or load-bearing change also gets a mutation review from a fresh subagent: it
  breaks the implementation one change at a time in a worktree at the fixed SHA,
  declares `want=kill` or `want=live` first, records whether a test failed, restores the
  tree and fixes nothing. Its report ends in `TOTAL: N findings` and goes in the same
  `docs/process/reviews/<topic>/` directory. The kit's `mutate` role is not yet
  supported, so this runs on the Agent path.
- Review one pull request at a time: implement, review, then the next.
- When briefing a reviewer, name the conventions the change touches: `CLAUDE.md` and the
  `.claude/rules/` files from its Rules index. For anything visual, add `DESIGN.md` and
  the `@theme inline` block in `frontend/src/app/globals.css`.
- A security review names the project's trust boundaries: the drive boundary and access
  control (`.claude/rules/design-decisions.md`), the Internal API and
  `CORE_INTERNAL_SECRET` (`.claude/rules/internal-api-policy.md`), and the addon proxy's
  `X-Lit-Drive` and policy checks.
- Layout, spacing and overflow need a named instruction to measure in a real browser.
  jsdom lays nothing out, and matching the text of a stylesheet cannot verify a layout.
  `frontend/e2e-layout/` measures real boxes against static fixtures in CI.
- Review records written before the kit stay in `docs/developer-guide/reviews/<pr>/`;
  new ones go in `docs/process/reviews/<topic>/`. Findings that carry a design decision
  also go to hako.

## Tests and prose in this project

- A submodule pointer bump is an edit to every `file:line` citation into that addon.
  Not writing line numbers in comments is the cheaper prevention.
- `scripts/jev-lint.sh` asks a model whether each changed comment, docstring, name,
  error message and test title still matches the code. Run it before review on a branch
  that added or edited prose: `scripts/jev-lint.sh` (the diff against `origin/develop`),
  `scripts/jev-lint.sh check backend/app` (a whole tree), and `--dry-run` for the plan
  and the price. It needs `TYPESAFE_API_KEY`, its answers move between runs, and no merge
  is gated on it. Treat a finding as a claim; if the prose is wrong, delete it.
  `.jev-lint.yaml` says which rules are on.

## Risk zones and why

- Build, deployment and gates (`.github/`, `.githooks/`, `process/`,
  `scripts/process-gates/`, Dockerfiles, `docker-compose*.yml`): CRITICAL. A mistake
  here silences every other check or breaks every install.
- `configure.py`: HIGH. It writes the override and the `drives.json` and
  `passwords.json` mounts that every install starts from.
- Access control and the drive boundary (`backend/app/auth.py`,
  `backend/app/routers/auth.py`, `backend/app/services/safepath.py`): HIGH. A missing
  check exposes a locked drive, and nothing else notices.
- The addon trust boundary (`backend/app/routers/internal.py`,
  `backend/app/routers/addon_proxy.py`): HIGH. An Internal API write can corrupt any
  drive.
- Data the filesystem cannot regenerate (`backend/app/services/scanner.py`,
  `backend/app/services/fileops.py`, `backend/app/database.py` with its migrations):
  HIGH. Watch history, tags, comments and transcripts live only in the DB, and the
  scanner decides when a file becomes missing.
- Modifiers for deletion, concurrency and schema changes promote a change to HIGH or
  CRITICAL wherever it is.

## Human zones

None. Litloft has no human code review: one developer works on it with agents, and
review is automated. A design judgment and a change to a protected path still need the
user, as `docs/process/risk-and-human-review.md` states.

## agent_cannot_verify

- The iOS app on a real device: orientation, full-screen playback, Picture in Picture,
  background audio, Now Playing controls.
- Audio and video as heard and seen: sync, subtitle timing, picture quality.
- Playback over the real home LAN and on other household devices.
- Addon calls to real third-party services (cloud sync providers, external LLM APIs).

## Where invariants live

In the spec, under `## Touch points` and `## Invariants`. Invariants are lines that start
with `I<N>.` (for example `I4. A finding without a claim is rejected.`). Revisions made
after approval go in `docs/process/reviews/<topic>/invariants.md`, whose `spec:` line names
the spec.

Every change also respects `.claude/rules/design-decisions.md`.

## Where specs live

`docs/specs/`. The template is `docs/specs/TEMPLATE.md` and the ledger is
`docs/specs/INDEX.md`. Change this only together with `process/process.conf`.

Domains: `CORE` (backend, frontend, `mcp-server/`), `ADDON` (a core change made for an
addon, such as an Internal API endpoint, or an addon's own behavior when its repository
has no spec location) and `IOS` (the iOS app). A SPEC-ADDON row cited by an addon's tests
counts only once the core pins the addon commit that carries the citation, so it becomes
`implemented` with the pointer bump, not with the addon's own merge.

The specs in `docs/superpowers/specs/` predate this and are a local, gitignored archive.

## Shared state a `mutate` run could touch

- `data/`: `.cmux/setup` symlinks the main checkout's `data/` into a new worktree, so a
  stack or test started there writes the real SQLite DB and thumbnails.
- Docker: containers, the `litloft-test` image tag, and ports 3000 and 8000. Two stacks
  sharing `data/` must not run at once.
- The addon submodules under `addons/`, which are separate repositories.

## known_issues_file

`docs/developer-guide/known-issues.md`
