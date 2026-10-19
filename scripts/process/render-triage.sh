#!/usr/bin/env bash
# render-triage.sh <run-dir> [--earlier <dir>]... [--invariants <file>] [--second-run] [--spec-present]
# Writes <run-dir>/triage.md from the artifacts in <run-dir>, its verdict.json and the
# artifacts of each earlier run directory, and prints the path. The options are passed to
# validate-artifact.sh for the artifacts of <run-dir>; earlier runs are validated without them.
# Exit 1 when an artifact is invalid or verdict.json is missing or malformed, in which case
# no triage.md is left in <run-dir>; exit 2 on a usage error.

set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
VALIDATE="$HERE/validate-artifact.sh"

die_usage() { printf 'render-triage: %s\n' "$1" >&2; exit 2; }
die() { printf 'render-triage: %s\n' "$1" >&2; exit 1; }

command -v jq >/dev/null 2>&1 || die_usage "jq is required"

run=""
earlier_dirs=""
inv_file=""
second=false
spec=false
while [ $# -gt 0 ]; do
  case "$1" in
    --earlier)
      [ $# -ge 2 ] || die_usage "--earlier needs a directory"
      [ -d "$2" ] || die_usage "no such directory: $2"
      earlier_dirs="$earlier_dirs
$2"
      shift 2 ;;
    --invariants)
      [ $# -ge 2 ] || die_usage "--invariants needs a file"
      [ -f "$2" ] || die_usage "no such invariants file: $2"
      inv_file="$2"; shift 2 ;;
    --second-run) second=true; shift ;;
    --spec-present) spec=true; shift ;;
    -*) die_usage "unknown option: $1" ;;
    *)
      [ -z "$run" ] || die_usage "more than one run directory given"
      run="$1"; shift ;;
  esac
done
[ -n "$run" ] || die_usage "usage: render-triage.sh <run-dir> [--earlier <dir>]... [--invariants <file>] [--second-run] [--spec-present]"
[ -d "$run" ] || die_usage "no such directory: $run"
run="${run%/}"

rm -f "$run/triage.md"

[ -f "$run/verdict.json" ] || die "$run/verdict.json is missing"
jq -e '(.verdict | IN("FAIL", "HUMAN_REVIEW_REQUIRED", "PASS"))
       and (.reasons | type == "array") and (.findings | type == "array") and (.needs_human | type == "array")' \
  "$run/verdict.json" >/dev/null 2>&1 || die "$run/verdict.json is not a valid verdict"

tmp="$(mktemp -d)" || die "cannot create a temporary directory"
trap 'rm -rf "$tmp"' EXIT

# list_artifacts <dir>: the artifact files of a run directory, one per line
list_artifacts() {
  local f
  for f in "$1"/*.json; do
    [ -e "$f" ] || continue
    case "$(basename "$f")" in verdict.json|classification.json|fingerprint.json|usage.json) continue ;; esac
    printf '%s\n' "$f"
  done
}

# gather <dir> <out> <current|earlier>: validate every artifact of <dir>, write them as one JSON array
gather() {
  local f list="$tmp/list" reasons
  local -a vflags=() files=()
  if [ "$3" = current ]; then
    [ -z "$inv_file" ] || vflags+=(--invariants "$inv_file")
    [ "$second" = false ] || vflags+=(--second-run)
    [ "$spec" = false ] || vflags+=(--spec-present)
  fi
  list_artifacts "$1" >"$list"
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    if ! reasons="$(bash "$VALIDATE" "$f" ${vflags[@]+"${vflags[@]}"} 2>&1)"; then
      printf 'render-triage: %s is invalid:\n%s\n' "$f" "$reasons" >&2
      exit 1
    fi
    files+=("$f")
  done <"$list"
  if [ "${#files[@]}" -gt 0 ]; then
    jq -s . "${files[@]}" >"$2" 2>/dev/null || die "cannot read the artifacts in $1"
    local dup
    dup="$(jq -r '[.[].reviewer] | group_by(.) | .[] | select(length > 1) | .[0]' "$2" | head -n 1)"
    [ -z "$dup" ] || die "reviewer $dup appears in more than one artifact in $1"
  else
    echo '[]' >"$2"
  fi
}

gather "$run" "$tmp/current.json" current || exit 1

echo '[]' >"$tmp/earlier.json"
idx=0
printf '%s\n' "$earlier_dirs" >"$tmp/earlier-dirs"
while IFS= read -r d; do
  [ -n "$d" ] || continue
  idx=$((idx + 1))
  gather "$d" "$tmp/e$idx.json" earlier || exit 1
  jq --arg run "$(basename "${d%/}")" '{run: $run, artifacts: .}' "$tmp/e$idx.json" >"$tmp/e$idx.run.json"
  jq -s '.[0] + [.[1]]' "$tmp/earlier.json" "$tmp/e$idx.run.json" >"$tmp/earlier.next.json" && mv "$tmp/earlier.next.json" "$tmp/earlier.json"
done <"$tmp/earlier-dirs"

PROGRAM='
def sevrank: {"BLOCKER": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "INFO": 4}[.];
def or_none: if length == 0 then ["- none"] else . end;
def nl: gsub("\r\n?"; "\n");
def flat: gsub("[\r\n]+"; " ");
def quote($indent): nl | split("\n") | map($indent + (if length > 0 then "> " + . else ">" end)) | join("\n");
def labelled($label): nl as $v | if ($v | contains("\n")) then "\($label):\n" + ($v | quote("")) else "\($label): \($v)" end;
def entry($label): nl as $v | if ($v | contains("\n")) then "- \($label):\n" + ($v | quote("  ")) else "- \($label): \($v)" end;

{dir: $dir, verdict: $v[0], current: $c[0], earlier: $e[0]} as $in
| $in.verdict as $vd
| $in.current as $cur
| [$cur[] | .reviewer as $r | .findings[] | . + {reviewer: $r}] as $all
| ([$vd.findings[] | {key: ([.reviewer, .id] | tojson), value: .state}] | from_entries) as $state
| ([$all[] | select(.bucket_proposal.bucket == "C")] | length) as $cur_c
| ([$in.earlier[].artifacts[].findings[] | select(.bucket_proposal.bucket == "C")] | length) as $earlier_c

| def st: $state[[.reviewer, .id] | tojson] // "open";
  def lookup($ref): [$all[] | select(.reviewer == $ref.reviewer and .id == $ref.finding_id)] | .[0];

  def human_item:
    (if .ref then "\(.ref.reviewer):\(.ref.finding_id)" | flat else null end) as $refname
    | [
        "### \(.kind | flat)\(if $refname then " (\($refname))" else "" end)",
        "",
        (if .ref then
           (lookup(.ref) as $f
            | if $f == null then "Finding not found in the artifacts."
              else
                ($f.claim | labelled("Question")),
                ($f.impact | labelled("Impact")),
                ($f.evidence | labelled("Evidence")),
                (if $f | has("proposed_fix") then ($f.proposed_fix | labelled("Recommendation")) else empty end)
              end)
         else empty end),
        (if (.note | length) > 0 then (.note | labelled("Note")) else empty end),
        (if (.kind == "human_zone" or .kind == "protected_path") and (.paths | length) > 0
         then "Paths:", (.paths[] | "- " + flat) else empty end),
        (if .kind == "unspecified_behavior" then
           ($cur[] | select(.unspecified_behavior_found == true) | .reviewer as $r
              | .potential_unspecified_behavior[] | entry($r | flat))
         else empty end),
        ""
      ] | join("\n");

  def finding_block:
    [
      "### \(.reviewer | flat):\(.id | flat) — bucket \(.bucket_proposal.bucket), \(.severity), \(st | flat)",
      "",
      (.claim | labelled("Claim")),
      (.impact | labelled("Impact")),
      (.evidence | labelled("Evidence")),
      (.repro | labelled("Repro")),
      "Introduced: \(.introduced)",
      "Reviewer bucket: \(.bucket_proposal.bucket) | Author bucket: ",
      (if has("proposed_fix") then
         "",
         "<details><summary>Proposed fix</summary>",
         "",
         (.proposed_fix | quote("")),
         "",
         "</details>"
       else empty end),
      ""
    ] | join("\n");

  [
    "# Triage: \($in.dir)",
    "",
    "## Trajectory",
    "",
    "This run:",
    ([$cur[] | select(.role == "read" and ((.trajectory // "") | length > 0)) | (.reviewer | flat) as $l | .trajectory | entry($l)] | or_none | join("\n")),
    "",
    "Earlier runs:",
    ([$in.earlier[] | .run as $run | .artifacts[] | select(.role == "read" and ((.trajectory // "") | length > 0)) | ("\($run) / \(.reviewer)" | flat) as $l | .trajectory | entry($l)] | or_none | join("\n")),
    "",
    "C findings so far: \($cur_c + $earlier_c)",
    "",
    "## Verdict",
    "",
    "Verdict: \($vd.verdict)",
    "",
    "Reasons:",
    ($vd.reasons | map("- " + flat) | or_none | join("\n")),
    "",
    (if ($vd.needs_human | length) > 0 and ($vd.verdict == "FAIL" or $vd.verdict == "HUMAN_REVIEW_REQUIRED") then
       "## Needs a human",
       "",
       ($vd.needs_human | map(human_item) | join("\n"))
     else empty end),
    "## Findings",
    "",
    "A: \([$all[] | select(.bucket_proposal.bucket == "A")] | length)",
    "B: \([$all[] | select(.bucket_proposal.bucket == "B")] | length)",
    "C: \([$all[] | select(.bucket_proposal.bucket == "C")] | length)",
    "",
    ($all | sort_by([.bucket_proposal.bucket, (.severity | sevrank), .reviewer, .id]) | map(finding_block) | join("\n")),
    "## Not verified",
    "",
    ([$cur[] | .reviewer as $r | .not_verified[] | entry($r | flat)] | or_none | join("\n")),
    "",
    "TOTAL: \($all | length) findings"
  ] | join("\n")
'

out="$run/triage.md.tmp.$$"
if ! jq -n -r --arg dir "$(basename "$(cd "$run" && pwd)")" \
      --slurpfile v "$run/verdict.json" --slurpfile c "$tmp/current.json" --slurpfile e "$tmp/earlier.json" \
      "$PROGRAM" >"$out"; then
  rm -f "$out"
  die "could not render $run"
fi
mv "$out" "$run/triage.md" || { rm -f "$out"; die "could not write $run/triage.md"; }
printf '%s\n' "$run/triage.md"
