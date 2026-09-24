# Contributing

Litloft is developed mainly for personal use, but pull requests are welcome. Reviews are best-effort. If you are unsure whether a feature fits, open an issue first.

## Before you start

- Read the [architecture](architecture.md) and the [Internal API policy](addon-dev.md#internal-api-policy). Most "not in core" decisions come from them.
- Read the rules in `.claude/rules/`, starting with `design-decisions.md`. `CLAUDE.md` at the repo root says which rule file applies to which part of the code.

## Branches and commits

- Branch off `develop` with a descriptive name (`feat/scene-search-toggle`, `fix/upload-resume-race`), and open the pull request against `develop`.
- Use Conventional Commits:

  ```
  <type>: <short summary>

  <body: what changed and why>
  ```

  Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`.
- Write commit messages, PR descriptions and issues in English.
- A change to an addon is committed in the addon's own repository first; see the Git section of `CLAUDE.md`.

## Pull requests

The description says what changed and why, links the issue if there is one, and says how it was verified. Keep it short (see `.claude/rules/comments.md`).

## Checks

CI runs on every pull request. Run the same checks locally before opening one:

```bash
# Backend tests (inside Docker)
docker build -f backend/Dockerfile.test -t litloft-test .
docker run --rm litloft-test

# Frontend
cd frontend
node scripts/merge-addon-messages.mjs
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e:layout
pnpm test:e2e:components
```

Read the exit code, not the pass count; see [Flake hygiene](testing.md#flake-hygiene). CI also enforces coverage floors; see [testing](testing.md).

## Tests

Every pull request includes tests for the behaviour it changes:

- Bug fix: a regression test that fails before the fix and passes after it.
- New feature: unit and integration tests, and a browser test if it is user-visible.
- Refactor: existing tests still pass.

## Comments

Follow `.claude/rules/comments.md`: comment only what a reader could get wrong after reading the code. `scripts/jev-lint.sh` asks a model whether the comments, names and test titles on your branch still match the code:

```bash
scripts/jev-lint.sh                                # diff against origin/develop
scripts/jev-lint.sh check frontend/src --dry-run   # show the plan and cost only
```

It needs `TYPESAFE_API_KEY` and is not run by CI. Treat each finding as a claim to check against the code; if the prose is wrong, delete it. `.jev-lint.yaml` lists the enabled rules.

## Documentation

A change that users, operators or addon developers can observe updates the matching page under `docs/` in the same pull request. `CLAUDE.md` has the table of which change goes on which page. Internal refactors need no doc change.

## Translations

- Edit core strings only in `frontend/src/messages-core/<locale>.json`. `frontend/src/messages/` is generated and gitignored.
- Addon strings live in the addon's own `frontend/messages/<locale>.json`.
- To add a locale, add it to `locales` in `frontend/src/i18n/config.ts` and create `messages-core/<locale>.json`.

See [frontend development → i18n](frontend-dev.md#i18n).

## New addons

Follow [addon development](addon-dev.md). A new addon:

- lives in its own repository, with its own README and tests;
- is added to core as a submodule under `addons/` (plus an example service block, for an independent service);
- gets a page under `docs/addons/`.

## Security

Do not report a security issue in a public issue. Contact the maintainer privately.

## License

By contributing, you agree that your changes are licensed under the project's license (`LICENSE` at the repo root).

## See also

- [Architecture](architecture.md)
- [Backend development](backend-dev.md)
- [Frontend development](frontend-dev.md)
- [Testing](testing.md)
