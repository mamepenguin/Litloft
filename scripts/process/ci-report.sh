#!/usr/bin/env bash
# ci-report.sh [--root <dir>] [--base <ref>]
#
# For every topic with a file changed by the pull request (git diff <base>...HEAD under
# docs/process/reviews/<topic>/), takes the topic's highest-numbered run in the working tree
# (docs/process/reviews/<topic>/r<N>/verdict.json) and prints
# {"label": bool, "comment": markdown, "runs": [run directories]}. The label is true when any listed run's verdict is HUMAN_REVIEW_REQUIRED; the comment is that run's
# "## Needs a human" section of triage.md.
# The base is --base, else PROCESS_BASE_REF, else `base_ref` in process/process.conf, else
# origin/main.
# Exit: 0, or 2 on a usage error, an unreadable base or a malformed verdict.json.

set -u

die() { printf 'ci-report: %s\n' "$1" >&2; exit 2; }

# The last `base_ref = <ref>` in <root>/process/process.conf, trimmed; empty when there is none.
conf_base_ref() {
  [ -f "$1/process/process.conf" ] || return 0
  tr -d '\r' < "$1/process/process.conf" | sed -n 's/^[[:space:]]*base_ref[[:space:]]*=//p' | tail -n 1 \
    | sed 's/^[[:space:]]*//; s/[[:space:]]*$//'
}

ROOT=""; BASE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --root|--base)
      [ $# -ge 2 ] || die "$1 needs a value"
      case "$1" in --root) ROOT="$2" ;; --base) BASE="$2" ;; esac
      shift 2 ;;
    *) die "unknown argument: $1" ;;
  esac
done

[ -n "$ROOT" ] || ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
[ -d "$ROOT" ] || die "root is not a directory: $ROOT"
[ -n "$BASE" ] || BASE="${PROCESS_BASE_REF:-$(conf_base_ref "$ROOT")}"
[ -n "$BASE" ] || BASE=origin/main

DIFF="$(mktemp)" || die "cannot create a temporary file"
trap 'rm -f "$DIFF"' EXIT
git -C "$ROOT" -c core.quotepath=off diff --name-only -z "$BASE...HEAD" > "$DIFF" 2>/dev/null || die "cannot diff $BASE...HEAD"
CHANGED="$(tr '\0' '\n' < "$DIFF")"

# Topics with a changed file anywhere under docs/process/reviews/<topic>/, one per line.
TOPICS="$(printf '%s\n' "$CHANGED" | sed -nE 's#^docs/process/reviews/([^/]+)/.+$#\1#p' | LC_ALL=C sort -u)"

# newest_run <topic>: prints the highest-numbered r<N> directory that holds a verdict.json.
newest_run() {
  local d n best="" bestn=-1
  for d in "$ROOT/docs/process/reviews/$1"/r[0-9]*; do
    [ -f "$d/verdict.json" ] || continue
    n="${d##*/r}"
    case "$n" in *[!0-9]*) continue ;; esac
    if [ $((10#$n)) -gt "$bestn" ]; then bestn=$((10#$n)); best="$d"; fi
  done
  [ -z "$best" ] || printf 'docs/process/reviews/%s/%s\n' "$1" "${best##*/}"
}

RUNS=""
while IFS= read -r topic; do
  [ -n "$topic" ] || continue
  run="$(newest_run "$topic")"
  [ -z "$run" ] || RUNS="$RUNS$run"$'\n'
done <<EOF_TOPICS
$TOPICS
EOF_TOPICS

LABEL=false; COMMENT=""
while IFS= read -r run; do
  [ -n "$run" ] || continue
  verdict="$(jq -er .verdict "$ROOT/$run/verdict.json" 2>/dev/null)" || die "$run/verdict.json is not a valid verdict"
  [ "$verdict" = HUMAN_REVIEW_REQUIRED ] || continue
  LABEL=true
  if [ -f "$ROOT/$run/triage.md" ]; then
    section="$(awk '/^## /{p = ($0 == "## Needs a human")} p' "$ROOT/$run/triage.md")"
    [ -z "$COMMENT" ] || [ -z "$section" ] || COMMENT="$COMMENT"$'\n\n'
    COMMENT="$COMMENT$section"
  fi
done <<EOF_RUNS
$RUNS
EOF_RUNS

printf '%s' "$RUNS" | jq -R . | jq -s --argjson label "$LABEL" --arg comment "$COMMENT" \
  '{label: $label, comment: $comment, runs: (map(select(. != "")))}'
