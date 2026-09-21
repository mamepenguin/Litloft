#!/usr/bin/env bash
# Prose-truth lint. See docs/developer-guide/contributing.md#prose-truth-lint.
set -euo pipefail

# The verdict is a model's, so it moves with the tool. Pinned so that two runs
# a month apart disagree about the code and not about the linter.
readonly JEV_LINT_VERSION=0.5.0

# Not a gate: `rules`, `--dry-run` and `replay` send nothing and want no key.
# Whether this invocation is one of those is jev-lint's judgement, not ours.
if [ -z "${TYPESAFE_API_KEY:-}" ]; then
  echo "TYPESAFE_API_KEY is unset; anything that sends a request will fail." >&2
fi

cd "$(git rev-parse --show-toplevel)"

# Anything passed through is the whole command: `check`, `run <rule>`,
# `rules`, `--dry-run`, and so on.
if [ "$#" -gt 0 ]; then
  exec npx -y "jev-lint@${JEV_LINT_VERSION}" "$@"
fi

base="${JEV_LINT_BASE:-}"
if [ -z "$base" ]; then
  for candidate in origin/develop develop origin/main main; do
    if git rev-parse --verify --quiet "$candidate^{commit}" >/dev/null; then
      base="$candidate"
      break
    fi
  done
fi
if [ -z "$base" ]; then
  echo "No base branch found. Set JEV_LINT_BASE to the ref to diff against." >&2
  exit 2
fi

echo "jev-lint review --base $base" >&2
exec npx -y "jev-lint@${JEV_LINT_VERSION}" review --base "$base"
