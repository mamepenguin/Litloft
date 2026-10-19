#!/usr/bin/env bash
# merge-reviews.sh <run-dir> [--invariants <file>] [--spec-present] [--second-run]
# Writes <run-dir>/verdict.json and prints the verdict word. Exit 0 PASS, 1 FAIL,
# 2 HUMAN_REVIEW_REQUIRED, 64 usage error.
#
# Inputs in <run-dir>: expected.txt (one reviewer id per line), classification.json,
# fingerprint.json ({"start","end"}), and <id>.json for each id. Nothing else is read: not
# Markdown, not a reviewer's own `overall`, not an artifact outside expected.txt.
# The verdict follows the Verdict table of the design document; no severity is written.

set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
VALIDATE="$HERE/validate-artifact.sh"

die_usage() { printf 'merge-reviews: %s\n' "$1" >&2; exit 64; }

command -v jq >/dev/null 2>&1 || die_usage "jq is required"

run=""
vflags=""
inv_file=""
while [ $# -gt 0 ]; do
  case "$1" in
    --invariants)
      [ $# -ge 2 ] || die_usage "--invariants needs a file"
      [ -f "$2" ] || die_usage "no such invariants file: $2"
      inv_file="$2"; shift 2 ;;
    --second-run) vflags="$vflags --second-run"; shift ;;
    --spec-present) vflags="$vflags --spec-present"; shift ;;
    -*) die_usage "unknown option: $1" ;;
    *)
      [ -z "$run" ] || die_usage "more than one run directory given"
      run="${1%/}"; rm -f "$run/verdict.json"; shift ;;
  esac
done
[ -n "$run" ] || die_usage "usage: merge-reviews.sh <run-dir> [--invariants <file>] [--spec-present] [--second-run]"
[ -d "$run" ] || die_usage "no such directory: $run"

[ -f "$run/expected.txt" ] || die_usage "$run/expected.txt is missing"

tmp="$(mktemp -d)" || die_usage "cannot create a temporary directory"
trap 'rm -rf "$tmp"' EXIT

: >"$tmp/pre"      # failure reasons found before the table is applied, one per line
: >"$tmp/arts"     # one {"id","a"} object per artifact the validator accepted

ids="$(sed -e 's/[[:space:]]*$//' -e '/^$/d' "$run/expected.txt" | awk '!seen[$0]++')"
[ -n "$ids" ] || echo "the expected set is empty" >>"$tmp/pre"

while IFS= read -r id; do
  [ -n "$id" ] || continue
  f="$run/$id.json"
  case "$id" in */*|*..*|verdict|classification|fingerprint|usage)
    echo "expected id $id is not a reviewer id" >>"$tmp/pre"; continue ;;
  esac
  if [ ! -f "$f" ]; then
    echo "artifact of $id is missing" >>"$tmp/pre"; continue
  fi
  if [ -n "$inv_file" ]; then
    why="$(/bin/bash "$VALIDATE" "$f" --invariants "$inv_file" $vflags 2>&1 >/dev/null </dev/null)"
  else
    why="$(/bin/bash "$VALIDATE" "$f" $vflags 2>&1 >/dev/null </dev/null)"
  fi
  # shellcheck disable=SC2181
  if [ $? -ne 0 ]; then
    echo "artifact of $id is not valid: $(printf '%s' "$why" | head -n 1)" >>"$tmp/pre"; continue
  fi
  jq -c --arg id "$id" '{id: $id, a: .}' "$f" >>"$tmp/arts"
done <<EOF_IDS
$ids
EOF_IDS

if [ -f "$run/fingerprint.json" ] && jq -e '(.start | type == "string" and length > 0) and (.end | type == "string" and length > 0)' "$run/fingerprint.json" >/dev/null 2>&1; then
  jq -e '.start == .end' "$run/fingerprint.json" >/dev/null 2>&1 || echo "the fingerprint changed during the run" >>"$tmp/pre"
else
  echo "fingerprint.json is absent or unreadable" >>"$tmp/pre"
fi

cls=null
if [ -f "$run/classification.json" ] && jq -e '(.risk | type == "string") and ([.human_zones_touched, .protected_paths_touched] | all(.[]; type == "array" and all(.[]; type == "string")))' "$run/classification.json" >/dev/null 2>&1; then
  cls="$(jq -c . "$run/classification.json")"
else
  echo "classification.json is absent or unreadable" >>"$tmp/pre"
fi

PROGRAM='
def hc: .bucket_proposal.bucket == "A" or .bucket_proposal.bucket == "C" or .severity == "BLOCKER";
$cls as $c
| ($c.risk // null) as $risk
| ($c.human_zones_touched // []) as $zones
| ($c.protected_paths_touched // []) as $prot
| [ $arts[] | . as $i
    | [ (if .a.reviewer != .id then "artifact of \(.id) names reviewer \(.a.reviewer)" else empty end),
        (if .a.risk != $risk then "artifact of \(.id) has risk \(.a.risk), the classifier says \($risk)" else empty end),
        (if .a.confidence < 70 then "artifact of \(.id) has confidence \(.a.confidence), below 70" else empty end),
        (if .a.role == "mutate" and (.a.mutation.status == "INVALID" or .a.mutation.baseline_green != true) then "artifact of \(.id) is a mutate run with status INVALID or a baseline that is not green" else empty end) ] as $why
    | $i + {why: $why} ] as $all
| [ $all[] | select(.why | length > 0) | .why[] ] as $bad
| (if [ $all[] | select(.a.role == "read" or .a.role == "mutate") ] | length == 0 then ["no read or mutate reviewer in the expected set"] else [] end) as $noreader
| [ $all[] | select(.why | length == 0) ] as $valid
| [ $valid[] | select(.a.role == "verify") ] as $verifiers
| [ $all[] | (.why | length == 0) as $ok | .id as $rid | .a.role as $role | .a.findings[]
    | . as $f
    | { reviewer: $rid, id: $f.id, f: $f, ok: $ok,
        state: (if $role == "verify" then "open"
                else ([ $verifiers[] | [ .a.verification[] | select(.source_reviewer == $rid and .source_finding_id == $f.id) ] ]) as $per
                  | if ($per | length) > 0 and all($per[]; length > 0 and all(.[]; .status == "rejected_with_evidence"))
                    then "rejected" else "open" end
                end) } ] as $fs
| [ $fs[] | select(.ok and .state == "open" and (.f.bucket_proposal.bucket == "A" or .f.severity == "BLOCKER"))
    | "open finding \(.reviewer):\(.id) is bucket A or BLOCKER" ] as $openfail
| ( [ $fs[] | select(.ok and .state == "open" and .f.bucket_proposal.bucket == "C")
      | {kind: "open_c", ref: {reviewer: .reviewer, finding_id: .id}, note: .f.claim, paths: []} ]
  + [ $verifiers[] | .a.verification[] | select(.status == "needs_human")
      | {kind: "needs_human_record", ref: {reviewer: .source_reviewer, finding_id: .source_finding_id}, note: .note, paths: []} ]
  + [ $valid[] | select(.a.unspecified_behavior_found == true)
      | {kind: "unspecified_behavior", ref: null, note: (.a.potential_unspecified_behavior | join("; ")), paths: []} ]
  + [ $fs[] | select(.ok and .state == "rejected" and (.f | hc))
      | {kind: "rejected_high_consequence", ref: {reviewer: .reviewer, finding_id: .id}, note: .f.claim, paths: []} ]
  + (if ($zones | length) > 0 then [{kind: "human_zone", ref: null, note: "the change touches a human zone", paths: $zones}] else [] end)
  + (if ($prot | length) > 0 then [{kind: "protected_path", ref: null, note: "the change touches a protected path", paths: $prot}] else [] end)
  ) as $human
| ($pre + $bad + $noreader + $openfail) as $failreasons
| (if ($failreasons | length) > 0 then "FAIL" elif ($human | length) > 0 then "HUMAN_REVIEW_REQUIRED" else "PASS" end) as $v
| { verdict: $v,
    reasons: (if $v == "FAIL" then $failreasons
              elif $v == "HUMAN_REVIEW_REQUIRED" then [$human[] | "\(.kind)" + (if .ref then " \(.ref.reviewer):\(.ref.finding_id)" else "" end)]
              else [] end),
    findings: [ $fs[] | {reviewer, id, state} ],
    needs_human: $human }
'

jq -n -c --slurpfile arts "$tmp/arts" --argjson cls "$cls" \
  --argjson pre "$(jq -R . "$tmp/pre" | jq -s .)" "$PROGRAM" >"$tmp/verdict.json" \
  || { echo "merge-reviews: internal error" >&2; exit 1; }

mv "$tmp/verdict.json" "$run/verdict.json" || die_usage "cannot write $run/verdict.json"
word="$(jq -r .verdict "$run/verdict.json")"
printf '%s\n' "$word"
case "$word" in
  PASS) exit 0 ;;
  HUMAN_REVIEW_REQUIRED) exit 2 ;;
  *) exit 1 ;;
esac
