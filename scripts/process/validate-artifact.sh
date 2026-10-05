#!/usr/bin/env bash
# validate-artifact.sh <artifact.json> [--invariants <file>] [--second-run] [--spec-present]
# Exit 0 and no output when the artifact is valid; exit 1 with one reason per line on
# stderr when it is not; exit 2 on a usage error or when jq is missing.
# review-result.schema.json states the shape; this script enforces it.

set -u

die_usage() { printf 'validate-artifact: %s\n' "$1" >&2; exit 2; }

command -v jq >/dev/null 2>&1 || die_usage "jq is required"

file=""
inv_file=""
second=false
spec=false
while [ $# -gt 0 ]; do
  case "$1" in
    --invariants)
      [ $# -ge 2 ] || die_usage "--invariants needs a file"
      inv_file="$2"; shift 2 ;;
    --second-run) second=true; shift ;;
    --spec-present) spec=true; shift ;;
    -*) die_usage "unknown option: $1" ;;
    *)
      [ -z "$file" ] || die_usage "more than one artifact given"
      file="$1"; shift ;;
  esac
done
[ -n "$file" ] || die_usage "usage: validate-artifact.sh <artifact.json> [--invariants <file>] [--second-run] [--spec-present]"
[ -f "$file" ] || die_usage "no such file: $file"

inv='null'
if [ -n "$inv_file" ]; then
  [ -f "$inv_file" ] || die_usage "no such invariants file: $inv_file"
  # An id is the whole token before the first . or :, so I4 does not match I40.
  inv="$(sed -n 's/^\(I[0-9][0-9]*\)[.:].*/\1/p' "$inv_file" | jq -R . | jq -s .)" || die_usage "cannot read $inv_file"
fi

if ! jq -e . "$file" >/dev/null 2>&1; then
  echo "artifact is not valid JSON" >&2
  exit 1
fi

PROGRAM='
def ne: type == "string" and (gsub("^\\s+|\\s+$"; "") | length > 0);
def strarr: type == "array" and all(.[]; ne);
def oneof($set): . as $v | any($set[]; . == $v);
def bool: type == "boolean";

def fcheck($inv; $label; $role):
  if type != "object" then "\($label) is not an object" else
    . as $f |
    (
      (if (.id | ne) then empty else "\($label): id is missing or empty" end),
      (if (.origin | oneof(["reviewer", "verifier"])) then
         ((if $role == "verify" then "verifier" elif $role == "read" or $role == "mutate" then "reviewer" else null end) as $want
          | if $want == null or .origin == $want then empty else "\($label): origin must be \($want) for role \($role)" end)
       else "\($label): origin must be reviewer or verifier" end),
      (("claim", "impact", "evidence", "repro") as $k
        | if ($f[$k] | ne) then empty else "\($label): \($k) is missing or empty" end),
      (if has("proposed_fix") then
         (if (.proposed_fix | type) == "string" then empty else "\($label): proposed_fix must be a string" end),
         (if (.claim | ne) then empty else "\($label): proposed_fix present while claim is empty" end)
       else empty end),
      (if (.introduced | oneof(["introduced", "pre-existing", "unverified"])) then empty
       else "\($label): introduced must be introduced, pre-existing or unverified" end),
      (if (.severity | oneof(["BLOCKER", "HIGH", "MEDIUM", "LOW", "INFO"])) then empty
       else "\($label): severity must be BLOCKER, HIGH, MEDIUM, LOW or INFO" end),
      (.bucket_proposal as $b |
        if ($b | type) != "object" then "\($label): bucket_proposal must be an object" else
          (if ($b.bucket | oneof(["A", "B", "C"])) then empty else "\($label): bucket_proposal.bucket must be A, B or C" end),
          (if ($b.reason | ne) then empty else "\($label): bucket_proposal.reason must be a non-empty string" end),
          (if ($b | has("invariant_ref")) and (($b.invariant_ref | type) == "string" or $b.invariant_ref == null) then empty
           else "\($label): bucket_proposal.invariant_ref must be a string or null" end),
          (if $b.bucket == "A" then
             if ($b.invariant_ref | ne) then
               (if $inv == null or any($inv[]; . == $b.invariant_ref) then empty
                else "\($label): invariant_ref \($b.invariant_ref) is not declared in the invariants file" end)
             else "\($label): bucket A requires invariant_ref" end
           else empty end)
        end),
      (if .severity == "BLOCKER" and ((.bucket_proposal.bucket? // null) | oneof(["A", "C"]) | not)
       then "\($label): severity BLOCKER requires bucket A or C" else empty end)
    )
  end;

def vcheck($i):
  "verification record \($i)" as $label |
  if type != "object" then "\($label): not an object" else
    (if (.source_reviewer | ne) then empty else "\($label): source_reviewer is missing or empty" end),
    (if (.source_finding_id | ne) then empty else "\($label): source_finding_id must be a non-empty string" end),
    (if (.status | oneof(["confirmed", "rejected_with_evidence", "needs_human"])) then empty
     else "\($label): status must be confirmed, rejected_with_evidence or needs_human" end),
    (if (.note | type) == "string" then empty else "\($label): note must be a string" end),
    (if (.status == "needs_human" or .status == "rejected_with_evidence") and ((.note | ne) | not)
     then "\($label): note is required for \(.status)" else empty end)
  end;

def mcheck($i):
  "mutation.mutants[\($i)]" as $label |
  if type != "object" then "\($label): not an object" else
    (("id", "change") as $k | if (.[$k] | ne) then empty else "\($label): \($k) must be a non-empty string" end),
    (if (.want | oneof(["kill", "live"])) then empty else "\($label): want must be kill or live" end),
    (if (.result | oneof(["killed", "survived"])) then empty else "\($label): result must be killed or survived" end)
  end;

def acheck($inv; $second; $spec):
  . as $a |
  (
    (if .schema_version == 1 then empty else "schema_version must be 1" end),
    (if (.reviewer | ne) then empty else "reviewer must be a non-empty string" end),
    (if (.role | oneof(["read", "mutate", "verify"])) then empty else "role must be one of read, mutate, verify" end),
    (if (.risk | oneof(["LOW", "MEDIUM", "HIGH", "CRITICAL"])) then empty else "risk must be one of LOW, MEDIUM, HIGH, CRITICAL" end),

    (if (.findings | type) == "array" then
       (.findings | to_entries[] | .key as $i | .value as $f
         | ($f | fcheck($inv; if ($f | type) == "object" and ($f.id | ne) then "finding \($f.id)" else "finding at index \($i)" end; $a.role))),
       ([.findings[] | select(type == "object") | .id | select(type == "string")]
         | group_by(.) | .[] | select(length > 1) | "duplicate finding id: \(.[0])")
     else "findings must be an array" end),

    (.role as $r |
      if $r == "verify" then
        (if (.verification | type) == "array" then (.verification | to_entries[] | .key as $i | .value | vcheck($i))
         else "verification is required for role verify (an array)" end),
        ([.verification[]? | select(type == "object" and (.source_finding_id | ne) and (.source_reviewer | ne)) | [.source_reviewer, .source_finding_id]]
          | group_by(.) | .[] | select(length > 1) | "duplicate verification record for \(.[0][0]):\(.[0][1])")
      elif $r == "read" or $r == "mutate" then
        (if (.verification // []) | (type == "array" and length == 0) then empty
         else "verification must be empty or absent for role \($r)" end)
      else empty end),

    (if .role == "mutate" then
       if (.mutation | type) != "object" then "mutation is required for role mutate" else
         (.mutation |
           (if (.status | oneof(["ok", "INVALID"])) then empty else "mutation.status must be ok or INVALID" end),
           (if (.baseline_green | bool) then empty else "mutation.baseline_green must be a boolean" end),
           (if (.mutants | type) == "array" then
              (.mutants | to_entries[] | .key as $i | .value | mcheck($i)),
              ([.mutants[] | select(type == "object") | .id | select(type == "string")]
                | group_by(.) | .[] | select(length > 1) | "duplicate mutant id: \(.[0])")
            else "mutation.mutants must be an array" end))
       end
     else empty end),

    (if has("trajectory") and (.trajectory | type) != "string" then "trajectory must be a string when present" else empty end),
    (if has("mutation") and (.mutation | type) != "object" then "mutation must be an object when present" else empty end),

    (if .role == "read" and $second and ((.trajectory | ne) | not)
     then "trajectory is required for role read with --second-run" else empty end),

    (if (.specification_compliance | strarr) then empty else "specification_compliance must be an array of non-blank strings" end),
    (if $spec and ((.specification_compliance | type == "array" and length > 0) | not)
     then "specification_compliance must be non-empty when a spec is present" else empty end),
    (if (.unspecified_behavior_found | bool) then empty else "unspecified_behavior_found must be a boolean" end),
    (("potential_unspecified_behavior", "regression_risks", "test_coverage") as $k
      | if ($a[$k] | strarr) then empty else "\($k) must be an array of non-blank strings" end),

    (if (.not_verified | strarr) then
       (if (.not_verified | length) == 0 then "not_verified must contain at least one entry" else empty end)
     else "not_verified must be an array of non-blank strings" end),
    (if (.confidence | type) == "number" and .confidence == (.confidence | floor) and .confidence >= 0 and .confidence <= 100
     then empty else "confidence must be an integer from 0 to 100" end),
    (if .confidence == 100 and ((.not_verified // []) | length) == 0
     then "confidence 100 with empty not_verified" else empty end),

    (if has("perspectives") then
       if (.perspectives | type) == "array"
          and all(.perspectives[]; type == "object" and (.name | type) == "string" and (.notes | type) == "string")
       then empty else "perspectives must be an array of {name, notes} strings" end
     else empty end)
  );

if type != "object" then "artifact is not a JSON object"
else acheck($inv; $second; $spec) end
'

reasons="$(jq -r --argjson inv "$inv" --argjson second "$second" --argjson spec "$spec" "$PROGRAM" "$file")" || die_usage "internal error evaluating $file"
if [ -n "$reasons" ]; then
  printf '%s\n' "$reasons" >&2
  exit 1
fi
exit 0
