#!/usr/bin/env bash
# merge-reviews.sh <run-dir> [--invariants <file>] [--spec-present] [--second-run]
# Writes <run-dir>/verdict.json and prints the verdict word. Exit 0 PASS, 1 FAIL,
# 2 HUMAN_REVIEW_REQUIRED, 64 usage error.
#
# Inputs in <run-dir>: expected.txt (one reviewer id per line), classification.json,
# fingerprint.json ({"start","end"}), and <id>.json for each id, plus product-files.txt and
# unspecified-stop.txt when review.sh wrote them. Nothing else is read: not Markdown, not a reviewer's own `overall`,
# not an artifact outside expected.txt. The verdict follows the Verdict table of the design
# document; no severity is written.

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

# review.sh writes the product files it took from the diff; a run without the list (an
# older run, or a direct call) is not checked for coverage.
products='[]'
if [ -f "$run/product-files.txt" ]; then
  products="$(jq -R -s 'split("\n") | map(select(length > 0))' "$run/product-files.txt")" \
    || die_usage "cannot read $run/product-files.txt"
fi

# unspecified-stop.txt holds the `unspecified_stop` row of process.conf. Without it every
# unspecified-behavior entry stops the change.
stop=null
if [ -f "$run/unspecified-stop.txt" ]; then
  stop="$(tr -d '\r' <"$run/unspecified-stop.txt" | sed -n 's/^[[:space:]]*product:\([0-9]\{1,3\}\)[[:space:]][[:space:]]*impact:\([0-9]\{1,2\}\)[[:space:]]*$/{"product":\1,"impact":\2}/p' | head -n 1)"
  [ -n "$stop" ] || stop=invalid
fi

tmp="$(mktemp -d)" || die_usage "cannot create a temporary directory"
trap 'rm -rf "$tmp"' EXIT

: >"$tmp/pre"      # failure reasons found before the table is applied, one per line
: >"$tmp/arts"     # one {"id","a"} object per artifact the validator accepted

[ "$stop" != invalid ] || { echo "unspecified-stop.txt is not 'product:N impact:M'" >>"$tmp/pre"; stop=null; }

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
def over: $stop == null or .frequency * .impact >= $stop.product or (.frequency >= 1 and .impact >= $stop.impact);
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
    | $i + {why: $why} ] as $all0
| [ $all0[] | select((.why | length) == 0 and .a.role != "verify") ] as $sources
| [ $all0[] | if $stop != null and .a.role == "verify" and (.why | length) == 0 then
      . as $v
      | .why = [ $sources[] | .id as $rid | .a.potential_unspecified_behavior | to_entries[]
                 | select(.value | type == "object") | .key as $k
                 | select([ $v.a.unspecified_scores[]? | select(.source_reviewer == $rid and .index == $k) ] | length == 0)
                 | "artifact of \($v.id) has no score for \($rid) unspecified entry \($k)" ]
    else . end ] as $all
| [ $all[] | select(.why | length > 0) | .why[] ] as $bad
| (if [ $all[] | select(.a.role == "read" or .a.role == "mutate") ] | length == 0 then ["no read or mutate reviewer in the expected set"] else [] end) as $noreader
| [ $all[] | select(.why | length == 0) ] as $valid
| [ $valid[] | select(.a.role == "read") ] as $readers
| [ $products[] | . as $p
    | ([ $readers[] | .a.coverage[]? | select(.path == $p) ]) as $entries
    | if ($entries | length) == 0 then {path: $p, status: "missing"}
      elif any($entries[]; .read == "not_read") then {path: $p, status: "not_read"}
      else empty end ] as $incomplete
| [ $valid[] | select(.a.role == "verify") ] as $verifiers
| [ $valid[] | . as $r | .a.potential_unspecified_behavior | to_entries[] | .key as $k | .value as $e
    | if ($e | type) == "string" then
        {reviewer: $r.id, index: $k, behavior: $e, scores: [], counted: null, stops: $r.a.unspecified_behavior_found}
      else
        ([{by: $r.id, frequency: $e.frequency, impact: $e.impact, reason: $e.reason}]
         + (if $r.a.role == "verify" then []
            else [ $verifiers[] | .id as $vid | .a.unspecified_scores[]? | select(.source_reviewer == $r.id and .index == $k)
                   | {by: $vid, frequency, impact, reason} ] end)) as $sc
        | ($sc | map(select(over))) as $over
        | {reviewer: $r.id, index: $k, behavior: $e.behavior, scores: $sc,
           counted: (if ($over | length) > 0 then $over else $sc end | max_by([.frequency * .impact, .impact])),
           stops: (if $stop == null then $r.a.unspecified_behavior_found else ($over | length) > 0 end)}
      end ] as $unspec
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
  + [ $valid[] | .id as $rid
      | [ $unspec[] | select(.reviewer == $rid and .stops) ] as $s
      | select(if $stop == null then .a.unspecified_behavior_found == true else ($s | length) > 0 end)
      | {kind: "unspecified_behavior", ref: null, note: ([$s[].behavior] | join("; ")), paths: [], reviewer: $rid} ]
  + [ $fs[] | select(.ok and .state == "rejected" and (.f | hc))
      | {kind: "rejected_high_consequence", ref: {reviewer: .reviewer, finding_id: .id}, note: .f.claim, paths: []} ]
  + (if ($zones | length) > 0 then [{kind: "human_zone", ref: null, note: "the change touches a human zone", paths: $zones}] else [] end)
  + (if ($prot | length) > 0 then [{kind: "protected_path", ref: null, note: "the change touches a protected path", paths: $prot}] else [] end)
  + (if ($incomplete | length) > 0 then
       [{kind: "incomplete_read", ref: null,
         note: ([$incomplete[] | "\(.path) (\(.status))"] | join(", ")),
         paths: [$incomplete[].path]}]
     else [] end)
  ) as $human
| ($pre + $bad + $noreader + $openfail) as $failreasons
| (if ($failreasons | length) > 0 then "FAIL" elif ($human | length) > 0 then "HUMAN_REVIEW_REQUIRED" else "PASS" end) as $v
| { verdict: $v,
    reasons: (if $v == "FAIL" then $failreasons
              elif $v == "HUMAN_REVIEW_REQUIRED" then
                [$human[] | if .kind == "incomplete_read" then "incomplete_read: \(.note)"
                            else "\(.kind)" + (if .ref then " \(.ref.reviewer):\(.ref.finding_id)" else "" end) end]
              else [] end),
    findings: [ $fs[] | {reviewer, id, state} ],
    needs_human: $human,
    unspecified: $unspec,
    unspecified_stop: $stop }
'

jq -n -c --slurpfile arts "$tmp/arts" --argjson cls "$cls" --argjson stop "$stop" \
  --argjson pre "$(jq -R . "$tmp/pre" | jq -s .)" --argjson products "$products" "$PROGRAM" >"$tmp/verdict.json" \
  || { echo "merge-reviews: internal error" >&2; exit 1; }

mv "$tmp/verdict.json" "$run/verdict.json" || die_usage "cannot write $run/verdict.json"
word="$(jq -r .verdict "$run/verdict.json")"
printf '%s\n' "$word"
case "$word" in
  PASS) exit 0 ;;
  HUMAN_REVIEW_REQUIRED) exit 2 ;;
  *) exit 1 ;;
esac
