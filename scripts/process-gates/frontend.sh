#!/usr/bin/env bash
# Frontend gate for scripts/process/precheck.sh: vitest, tsc and eslint in frontend/,
# run only when the change touches frontend/ or an addon's frontend/.
#
# The change is everything since the merge base with base_ref (process/process.conf,
# default origin/develop), plus uncommitted and untracked files.
set -uo pipefail

root="$(git rev-parse --show-toplevel)" || exit 1
cd "$root" || exit 1

base="$(sed -n 's/^[[:space:]]*base_ref[[:space:]]*=[[:space:]]*//p' process/process.conf 2>/dev/null | tail -n 1)"
base="${base:-origin/develop}"

if mb="$(git merge-base "$base" HEAD 2>/dev/null)"; then
  files="$(
    git diff --name-only "$mb"
    git ls-files --others --exclude-standard
  )"
  if ! grep -qE '^(frontend/|addons/[^/]+/frontend/)' <<<"$files"; then
    echo "frontend-gate: skipped, no change under frontend/ or addons/*/frontend/ since $base"
    exit 0
  fi
else
  # An unknown base runs the gate rather than skipping it.
  echo "frontend-gate: cannot resolve $base; running everything"
fi

cd frontend || exit 1
node scripts/merge-addon-messages.mjs >/dev/null || exit 1
# The gate's expect_regex reads vitest's summary line, which colour codes would split.
NO_COLOR=1 pnpm exec vitest run || exit 1
pnpm exec tsc --noEmit || exit 1
pnpm lint || exit 1
