#!/usr/bin/env bash
# review.sh [--root <repo>] [--topic <name>] [--perspective a,b] [--working] [--print-brief <reviewer-id>]
#
# Runs the reviewers of process/reviewers.conf against HEAD in fresh `claude -p` processes,
# writes docs/process/reviews/<topic>/r<N>/, merges the artifacts into a verdict and renders
# triage.md. Exit 0 PASS, 1 FAIL, 2 HUMAN_REVIEW_REQUIRED or a refusal to run, 64 usage error.
# --print-brief prints one reviewer's brief and runs nothing.
#
# Environment: PROCESS_BASE_REF (default: `base_ref` in process/process.conf, else origin/main); PROCESS_CLASSIFY_CMD,
# PROCESS_VALIDATE_CMD, PROCESS_MERGE_CMD, PROCESS_RENDER_CMD (default: the sibling scripts,
# run with bash). The reviewer id is exported to each child as PROCESS_REVIEWER_ID.

set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
PROMPTS="$HERE/prompts"
SCHEMA="$HERE/review-result.schema.json"
CLASSIFY="${PROCESS_CLASSIFY_CMD:-$HERE/classify-risk.sh}"
VALIDATE="${PROCESS_VALIDATE_CMD:-$HERE/validate-artifact.sh}"
MERGE="${PROCESS_MERGE_CMD:-$HERE/merge-reviews.sh}"
RENDER="${PROCESS_RENDER_CMD:-$HERE/render-triage.sh}"

# The last `base_ref = <ref>` in <root>/process/process.conf, trimmed; empty when there is none.
conf_base_ref() {
  [ -f "$1/process/process.conf" ] || return 0
  tr -d '\r' < "$1/process/process.conf" | sed -n 's/^[[:space:]]*base_ref[[:space:]]*=//p' | tail -n 1 \
    | sed 's/^[[:space:]]*//; s/[[:space:]]*$//'
}

die_usage() { printf 'review: %s\n' "$1" >&2; exit 64; }
die() { printf 'review: %s\n' "$1" >&2; exit 2; }

for t in jq git awk; do command -v "$t" >/dev/null 2>&1 || die_usage "$t is required"; done

root=""; topic=""; persp=""; working=0; print_id=""
while [ $# -gt 0 ]; do
  case "$1" in
    --root|--topic|--perspective|--print-brief)
      [ $# -ge 2 ] || die_usage "$1 needs a value"
      case "$1" in
        --root) root="$2" ;; --topic) topic="$2" ;;
        --perspective) persp="$2" ;; --print-brief) print_id="$2" ;;
      esac
      shift 2 ;;
    --working) working=1; shift ;;
    *) die_usage "unknown argument: $1" ;;
  esac
done

if [ -z "$root" ]; then root="$(git rev-parse --show-toplevel 2>/dev/null)" || die_usage "not inside a git repository"; fi
[ -d "$root" ] || die_usage "no such directory: $root"
ROOT="$(cd "$root" && pwd)"
cd "$ROOT" || die_usage "cannot enter $ROOT"
git rev-parse --verify -q HEAD >/dev/null || die "the repository has no commit to review"
HEAD_SHA="$(git rev-parse HEAD)"

if [ -z "$topic" ]; then
  topic="$(git rev-parse --abbrev-ref HEAD 2>/dev/null | tr '/' '-')"
  [ -n "$topic" ] && [ "$topic" != "HEAD" ] || die_usage "detached HEAD: pass --topic"
fi
case "$topic" in ''|.*|*[!A-Za-z0-9._-]*) die_usage "invalid topic: $topic" ;; esac
persp="$(printf '%s' "$persp" | tr -d '[:space:]')"
case "$persp" in *[!A-Za-z0-9_,-]*) die_usage "invalid --perspective: $persp" ;; esac

RD="docs/process/reviews/$topic"
BASE="${PROCESS_BASE_REF:-$(conf_base_ref "$ROOT")}"; BASE="${BASE:-origin/main}"
W="$(mktemp -d)" || die "cannot create a temporary directory"
trap 'rm -rf "$W"' EXIT

trim() { local v="$1"; v="${v#"${v%%[![:space:]]*}"}"; printf '%s' "${v%"${v##*[![:space:]]}"}"; }
rank() { case "$1" in LOW) echo 0 ;; MEDIUM) echo 1 ;; HIGH) echo 2 ;; CRITICAL) echo 3 ;; *) return 1 ;; esac; }
US="$(printf '\037')"
gdiff() { git -c core.quotepath=off diff --no-color --no-ext-diff "$@"; }
gshow() { git -c core.quotepath=off show --no-color --no-ext-diff "$@"; }
# Not a reviewed change: the review outputs and the runner's own state.
untracked_paths() {
  git ls-files -z --others --exclude-standard | tr '\0' '\n' \
    | awk '!/^docs\/process\/reviews\// && !/^\.process\/runs(\/|$)/'
}
norm_path() {
  local s="$1" prev=""
  while [ "$s" != "$prev" ]; do
    prev="$s"
    s="${s//\/\///}"
    s="${s//\/.\///}"
    case "$s" in ./*) s="${s#./}" ;; esac
    case "$s" in */.) s="${s%/.}" ;; */) s="${s%/}" ;; esac
  done
  printf '%s' "$s"
}
sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum | cut -d' ' -f1; else shasum -a 256 | cut -d' ' -f1; fi; }

# ------------------------------------------------------------------ reviewers.conf
# rev.dat: id, engine, role, min_risk, perspectives, separated by a unit separator (not IFS
# whitespace, so an empty field stays a field), in file order
parse_conf() {
  local conf="process/reviewers.conf" line n=0 id lid engine role minr pers rest seen=""
  [ -r "$conf" ] || die "cannot read $conf"
  : >"$W/rev.dat"
  while IFS= read -r line || [ -n "$line" ]; do
    n=$((n + 1)); line="${line%$'\r'}"
    if [ "$n" -eq 1 ]; then
      [ "$(trim "$line")" = "# process-kit schema_version: 1" ] || die "$conf: the first line must be '# process-kit schema_version: 1'"
      continue
    fi
    case "$(trim "$line")" in ''|'#'*) continue ;; esac
    IFS='|' read -r id engine role minr pers rest <<EOF_ROW
$line
EOF_ROW
    id="$(trim "$id")"; engine="$(trim "$engine")"; role="$(trim "$role")"; minr="$(trim "$minr")"; pers="$(trim "$pers")"
    [ -z "$(trim "${rest:-}")" ] || die "$conf:$n: too many fields"
    lid="$(printf '%s' "$id" | LC_ALL=C tr 'A-Z' 'a-z')"
    case "$lid" in ''|*[!a-z0-9._-]*|verdict|classification|fingerprint|usage|head|fixes|expected|triage|diff_truncated)
      die "$conf:$n: '$id' is not a usable reviewer id" ;; esac
    case "$seen" in *" $lid "*) die "$conf:$n: duplicate reviewer id $id" ;; esac
    seen="$seen $lid "
    case "$engine" in claude) ;; codex) die "$conf:$n: $id: engine codex is not supported in this version" ;;
      *) die "$conf:$n: $id: unknown engine '$engine'" ;; esac
    case "$role" in read|verify) ;; mutate) die "$conf:$n: $id: role mutate is not supported in this version" ;;
      *) die "$conf:$n: $id: unknown role '$role'" ;; esac
    if [ "$role" = read ]; then
      [ -n "$minr" ] || minr=LOW
      rank "$minr" >/dev/null || die "$conf:$n: $id: min_risk must be LOW, MEDIUM, HIGH or CRITICAL"
    fi
    printf '%s\037%s\037%s\037%s\037%s\n' "$id" "$engine" "$role" "$minr" "$pers" >>"$W/rev.dat"
  done <"$conf"
}

# ------------------------------------------------------------------ classification
classify() {
  local mb=""
  set -- --base "$BASE" --root "$ROOT"
  if [ "$working" -eq 1 ] && mb="$(git merge-base "$BASE" "$HEAD_SHA" 2>/dev/null)" && [ -n "$mb" ]; then
    { gdiff --name-only -z "$mb" -- . ':(exclude)docs/process/reviews' ':(exclude).process/runs' | tr '\0' '\n'
      untracked_paths; } | awk 'NF' | LC_ALL=C sort -u >"$W/cf.txt"
    gdiff "$mb" -- . ':(exclude)docs/process/reviews' ':(exclude).process/runs' >"$W/cd.diff"
    set -- "$@" --changed-files "$W/cf.txt" --diff "$W/cd.diff"
  fi
  /bin/bash "$CLASSIFY" "$@" >"$W/cls.json" 2>"$W/cls.err" \
    || die "the classifier failed: $(head -n 3 "$W/cls.err" | tr '\n' ' ')"
  jq -e '.risk | IN("LOW", "MEDIUM", "HIGH", "CRITICAL")' "$W/cls.json" >/dev/null 2>&1 \
    || die "the classifier printed no valid risk"
  RISK="$(jq -r .risk "$W/cls.json")"
}

expected_set() { # reads rev.dat, needs RISK
  local id role minr rr
  rr="$(rank "$RISK")"
  : >"$W/expected.txt"
  while IFS="$US" read -r id _ role minr _; do
    if [ "$role" = verify ] || [ "$(rank "$minr")" -le "$rr" ]; then printf '%s\n' "$id" >>"$W/expected.txt"; fi
  done <"$W/rev.dat"
  local nread=0
  while IFS="$US" read -r id _ role _ _; do
    [ "$role" = read ] && grep -Fxq -- "$id" "$W/expected.txt" && nread=$((nread + 1))
  done <"$W/rev.dat"
  [ "$nread" -gt 0 ] || die "no read reviewer is in the expected set at risk $RISK"
}

# ------------------------------------------------------------------ fingerprint
# status_lines <fp|dirty>: `XY path` for each changed or untracked path, NUL-separated by git
# so no path is quoted. `fp` leaves out what the review directory holds except its invariants
# file; `dirty` leaves out only the review outputs (r<N> directories and decisions.md).
status_lines() {
  git status --porcelain -z --untracked-files=all | tr '\0' '\n' | awk -v mode="$1" '
    skip { skip = 0; next }
    { xy = substr($0, 1, 2); p = substr($0, 4)
      if (xy ~ /[RC]/) skip = 1
      if (p ~ /^\.process\/runs(\/|$)/) next
      if (mode == "fp") { if (p ~ /^docs\/process\/reviews\// && p !~ /^docs\/process\/reviews\/[^\/]+\/invariants\.md$/) next }
      else if (p ~ /^docs\/process\/reviews\/[^\/]+\/(r[0-9]+\/|decisions\.md$)/) next
      print xy " " p }'
}

# HEAD, the status and the content hashes of every changed or untracked path, except what
# the review directory holds (its invariants file stays in) and .process/runs.
fingerprint() {
  status_lines fp | LC_ALL=C sort >"$W/fp.status"
  {
    printf 'HEAD %s\n' "$(git rev-parse HEAD)"
    cat "$W/fp.status"
    sed -e 's/^...//' "$W/fp.status" | while IFS= read -r p; do
      if [ -L "$p" ]; then printf 'link %s %s\n' "$p" "$(readlink "$p")"
      elif [ -f "$p" ]; then
        x=0; [ ! -x "$p" ] || x=1
        printf 'file %s %s %s\n' "$p" "$x" "$(git hash-object -- "$p")"
      else printf 'none %s\n' "$p"; fi
    done
    # git status does not list a spec that .gitignore covers.
    [ -z "$SPEC_FILE" ] || [ ! -f "$SPEC_FILE" ] || printf 'spec %s %s\n' "$SPEC_FILE" "$(git hash-object -- "$SPEC_FILE")"
  } | sha256
}

# ------------------------------------------------------------------ run state
# MAXB: the cap on each attached diff, from `max_diff_bytes = N` in process/process.conf.
parse_process_conf() {
  local f=process/process.conf line n=0 v
  MAXB=200000
  [ -r "$f" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    n=$((n + 1)); line="${line%$'\r'}"
    case "$(trim "$line")" in max_diff_bytes|max_diff_bytes[!A-Za-z0-9_]*) ;; *) continue ;; esac
    v="$(printf '%s' "$line" | sed -n 's/^[[:space:]]*max_diff_bytes[[:space:]]*=[[:space:]]*\([0-9]\{1,9\}\)[[:space:]]*$/\1/p')"
    [ -n "$v" ] && [ "$((10#$v))" -gt 0 ] || die "$f:$n: max_diff_bytes must be a positive integer of at most 9 digits"
    MAXB=$((10#$v))
  done <"$f"
}

# cap_file <file> <bytes> <note>: cut the file at <bytes> and say so; sets TRUNC=1 when it cuts.
cap_file() {
  local size
  size="$(wc -c <"$1" | tr -d ' ')"
  [ "$size" -gt "$2" ] || return 0
  TRUNC=1
  head -c "$2" "$1" >"$1.cut"
  printf '\n[truncated: this %s was cut at %s bytes]\n' "$3" "$2" >>"$1.cut"
  mv "$1.cut" "$1"
}

# reviewed <run dir>: a read or mutate reviewer of its expected set left an artifact there
reviewed() {
  local id
  [ -f "$1/expected.txt" ] || return 1
  while IFS= read -r id || [ -n "$id" ]; do
    [ -f "$1/$id.json" ] && jq -e '.role == "read" or .role == "mutate"' "$1/$id.json" >/dev/null 2>&1 && return 0
  done < <(sed -e 's/[[:space:]]*$//' -e '/^$/d' "$1/expected.txt")
  return 1
}

# Sets N, LATER, PREV_HEAD, TRUNC and writes the material of the briefs under $W/ctx.
build_context() {
  local d m mn h prev="" later=0 maxn=0 cap first=1 q p
  mkdir -p "$W/ctx"; TRUNC=0
  : >"$W/ctx/runs.tsv"
  for d in "$RD"/r*; do
    [ -d "$d" ] || continue
    m="${d##*/r}"
    case "$m" in ''|*[!0-9]*) continue ;; esac
    mn=$((10#$m)); [ "$mn" -le "$maxn" ] || maxn="$mn"
    [ -s "$d/head.txt" ] && reviewed "$d" || continue
    printf '%s\t%s\n' "$m" "$d" >>"$W/ctx/runs.tsv"
  done
  LC_ALL=C sort -n "$W/ctx/runs.tsv" -o "$W/ctx/runs.tsv"
  PREV_HEAD=""; : >"$W/ctx/heads.tsv"
  while IFS="$(printf '\t')" read -r m d; do
    h="$(cat "$d/head.txt")"
    if [ "$first" -eq 1 ]; then later=0; first=0
    elif [ "$h" != "$prev" ]; then later=1; fi
    prev="$h"
    printf '%s\t%s\n' "$h" "$d" >>"$W/ctx/heads.tsv"
  done <"$W/ctx/runs.tsv"
  N=$((maxn + 1))
  PREV_HEAD="$prev"
  if [ -s "$W/ctx/runs.tsv" ] && [ "$PREV_HEAD" != "$HEAD_SHA" ]; then later=1; fi
  LATER="$later"
  cap="$MAXB"

  : >"$W/ctx/fixes.txt"
  if [ -n "$PREV_HEAD" ] && [ "$PREV_HEAD" != "$HEAD_SHA" ]; then
    git rev-list --reverse "$PREV_HEAD..$HEAD_SHA" >"$W/ctx/fixes.txt" 2>/dev/null \
      || die "cannot list the commits since the previous run ($PREV_HEAD)"
  fi

  # the diff against the base
  { gdiff "$BASE...$HEAD_SHA" -- . ':(exclude)docs/process/reviews' 2>/dev/null || echo "(the diff against $BASE could not be produced)"
    if [ "$working" -eq 1 ]; then
      echo; echo "Uncommitted changes:"; gdiff HEAD -- . ':(exclude)docs/process/reviews'
      q=$((cap / 4))
      untracked_paths >"$W/ctx/untracked.txt"
      while IFS= read -r p; do
        [ -n "$p" ] || continue
        gdiff --no-index -- /dev/null "$p" >"$W/ctx/u.diff" 2>/dev/null
        cap_file "$W/ctx/u.diff" "$q" "untracked file"
        printf '\nUntracked file: %s\n' "$p"; cat "$W/ctx/u.diff"
      done <"$W/ctx/untracked.txt"
    fi
  } >"$W/ctx/base.diff"
  cap_file "$W/ctx/base.diff" "$cap" "diff"

  # the fix commits of this run
  : >"$W/ctx/fixes.diff"
  while IFS= read -r h; do
    [ -z "$h" ] || gshow --first-parent -m "$h" -- . ':(exclude)docs/process/reviews' >>"$W/ctx/fixes.diff"
  done <"$W/ctx/fixes.txt"
  cap_file "$W/ctx/fixes.diff" "$cap" "set of fix diffs"
  [ -s "$W/ctx/fixes.diff" ] || echo "(none)" >"$W/ctx/fixes.diff"
  { [ -s "$W/ctx/fixes.txt" ] && cat "$W/ctx/fixes.txt" || echo "(none)"; } >"$W/ctx/fixes.list"

  # every earlier run
  : >"$W/ctx/earlier.txt"
  while IFS="$(printf '\t')" read -r m d; do
    { printf '### %s\n\nFiles: %s\n\n' "${d##*/}" "$(ls "$d" | tr '\n' ' ')"
      for f in "$d"/*.json "$d/triage.md"; do
        [ -f "$f" ] || continue
        case "${f##*/}" in usage.json) continue ;; esac
        printf '%s:\n%s\n\n' "${f##*/}" "$(cat "$f")"
      done
    } >>"$W/ctx/earlier.txt"
  done <"$W/ctx/runs.tsv"
  [ -s "$W/ctx/earlier.txt" ] || echo "(none)" >"$W/ctx/earlier.txt"

  : >"$W/ctx/threat.txt"
  [ ! -f docs/process/PROJECT.md ] \
    || awk '/^## / { on = ($0 ~ /^## Threat model[[:space:]]*$/); next } on' docs/process/PROJECT.md >"$W/ctx/threat.txt"
  THREAT=0; ! grep -q '[^[:space:]]' "$W/ctx/threat.txt" || THREAT=1

  # A `spec:` line in invariants.md puts that spec's touch points and invariants ahead of
  # the file's own lines; a later line with the same id supersedes an earlier one.
  INV_FILE=""; SPEC_FILE=""; INV_ARG=""; INV_SHOWN=""
  [ ! -f "$RD/invariants.md" ] || INV_FILE="$RD/invariants.md"
  : >"$W/ctx/invariants.txt"
  [ -n "$INV_FILE" ] || return 0
  SPEC_FILE="$(trim "$(sed -n 's/^spec:\(.*\)$/\1/p' "$INV_FILE" | head -n 1)")"
  if [ -z "$SPEC_FILE" ]; then
    cat "$INV_FILE" >"$W/ctx/invariants.txt"; INV_ARG="$ROOT/$INV_FILE"; INV_SHOWN="\`$INV_FILE\`"
    return 0
  fi
  [ -f "$SPEC_FILE" ] || die "$INV_FILE names the spec $SPEC_FILE, which does not exist"
  { awk '/^## / { on = ($0 ~ /^## (Touch points|Invariants|Revises)[[:space:]]*$/) } on' "$SPEC_FILE"
    echo; grep -v '^spec:' "$INV_FILE"; later_revisions "$SPEC_FILE"; } >"$W/ctx/invariants.txt"
  INV_ARG="$W/ctx/invariants.txt"; INV_SHOWN="\`$SPEC_FILE\`, revised by \`$INV_FILE\`"
}

# later_revisions <spec>: each `<SPEC-ID> I<N>. <sentence>` line under `## Revises` in another
# approved spec that names one of this spec's SPEC-IDs, as `I<N>. (<that spec>) <sentence>`,
# in the order of the approval commits so that the newest approval comes last.
later_revisions() {
  local ids f sha
  ids="$(sed -n 's/^SPEC-ID:[[:space:]]*\([^[:space:]]*\).*/\1/p' "$1" | tr '\n' ' ')"
  [ -n "$ids" ] || return 0
  for f in docs/specs/*.md; do
    [ -f "$f" ] && [ "$f" != "$1" ] || continue
    sha="$(sed -n 's/^Approval: \([0-9a-f]\{40\}\).*/\1/p' "$f" | tail -n 1)"
    [ -n "$sha" ] || continue
    printf '%s\t%s\n' "$(git log -1 --format=%ct "$sha" 2>/dev/null || echo 0)" "$f"
  done | sort -n -k1,1 | cut -f2- | while IFS= read -r f; do
    awk -v ids="$ids" -v src="$f" '/^## / { on = ($0 ~ /^## Revises[[:space:]]*$/); next }
      on && index(" " ids, " " $1 " ") && match($2, /^I[0-9]+[.:]$/) {
        rest = $0; sub(/^[^[:space:]]+[[:space:]]+[^[:space:]]+[[:space:]]*/, "", rest)
        print $2 " (" src ") " rest }' "$f"
  done >"$W/ctx/later.txt"
  [ ! -s "$W/ctx/later.txt" ] || { printf '\n## Revised by later specs\n\n'; cat "$W/ctx/later.txt"; }
}

# The earlier runs render-triage.sh shows: the latest run of each commit other than HEAD.
earlier_dirs() {
  awk -F'\t' -v cur="$HEAD_SHA" '{ h[NR] = $1; d[NR] = $2; last[$1] = $2 }
    END { for (i = 1; i <= NR; i++) if (h[i] != cur && last[h[i]] == d[i]) print d[i] }' "$W/ctx/heads.tsv"
}

# ------------------------------------------------------------------ briefs
all_perspectives() { # <conf perspectives>
  local v="$persp"
  [ -z "$1" ] || v="${v:+$v,}$1"
  printf '%s' "$v" | awk -F, '{ o = ""; for (i = 1; i <= NF; i++) { p = $i; gsub(/^[ \t]+|[ \t]+$/, "", p)
    if (p != "" && index("," o ",", "," p ",") == 0) o = o (o == "" ? "" : ",") p } print o }'
}

render_template() { # <template> ; env: T_*, F_*, IF_*
  awk '
    function rep(s, tok, val,   o, i) { o = ""; while ((i = index(s, tok)) > 0) { o = o substr(s, 1, i - 1) val; s = substr(s, i + length(tok)) } return o s }
    BEGIN { n = split("COMMIT BASE RISK REVIEWER PERSPECTIVES INVARIANTS_PATH", names, " ") }
    /^@if / { skip = (ENVIRON["IF_" $2] != "1"); next }
    /^@end$/ { skip = 0; next }
    skip { next }
    /^\{\{[A-Z_]+\}\}$/ {
      f = ENVIRON["F_" substr($0, 3, length($0) - 4)]
      if (f != "") { while ((getline l < f) > 0) print l; close(f); next }
    }
    { line = $0; for (k = 1; k <= n; k++) line = rep(line, "{{" names[k] "}}", ENVIRON["T_" names[k]]); print line }' "$1"
}

# findings_list <dir>: every finding of the read artifacts of <dir>
findings_list() {
  local id role f out=""
  while IFS="$US" read -r id _ role _ _; do
    [ "$role" = read ] && [ -n "$1" ] && [ -f "$1/$id.json" ] || continue
    jq -r '. as $a | .findings[] | "- reviewer: \($a.reviewer)\n  id: \(.id)\n  claim: \(.claim | gsub("[\r\n]+"; " "))\n  evidence: \(.evidence | gsub("[\r\n]+"; " "))\n"' "$1/$id.json"
  done <"$W/rev.dat" >"$W/ctx/findings.txt"
  [ -s "$W/ctx/findings.txt" ] || echo "(none)" >"$W/ctx/findings.txt"
}

# brief_for <id> <role> <perspectives> <artifact dir> <out>
brief_for() {
  local first=0 later=0 inv=0 noinv=0 pers
  [ "$LATER" -eq 1 ] && later=1 || first=1
  [ -n "$INV_FILE" ] && inv=1 || noinv=1
  pers="$(all_perspectives "$3" | sed 's/,/, /g')"
  findings_list "$4"
  T_COMMIT="$HEAD_SHA" T_BASE="$BASE" T_RISK="$RISK" T_REVIEWER="$1" T_PERSPECTIVES="$pers" T_INVARIANTS_PATH="$INV_SHOWN" \
  F_BASE_DIFF="$W/ctx/base.diff" F_FIXES_DIFF="$W/ctx/fixes.diff" F_FIXES="$W/ctx/fixes.list" F_EARLIER="$W/ctx/earlier.txt" \
  F_INVARIANTS="$W/ctx/invariants.txt" F_FINDINGS="$W/ctx/findings.txt" F_THREAT_MODEL="$W/ctx/threat.txt" \
  IF_first="$first" IF_later="$later" IF_invariants="$inv" IF_noinvariants="$noinv" IF_perspectives="$([ -n "$pers" ] && echo 1 || echo 0)" \
  IF_threat="$THREAT" IF_nothreat="$((1 - THREAT))" \
    render_template "$PROMPTS/$2.md" >"$5"
}

# ------------------------------------------------------------------ running reviewers
run_claude() { # <brief file>
  claude -p --output-format json --json-schema "$SCHEMA_TEXT" \
    --tools "Read,Glob,Grep" --allowedTools "Read,Glob,Grep" --permission-mode dontAsk \
    --no-session-persistence --safe-mode --strict-mcp-config --disable-slash-commands <"$1"
}

# run_reviewer <id> <role> <perspectives> <artifact dir>: writes <artifact dir>/<id>.json only for a valid artifact
run_reviewer() {
  local id="$1" role="$2" pc="$3" rundir="$4" brief="$W/$1.brief" raw="$W/$1.raw" t0 t1
  brief_for "$id" "$role" "$pc" "$rundir" "$brief"
  t0="$(date +%s)"
  PROCESS_REVIEWER_ID="$id" run_claude "$brief" >"$raw" 2>"$W/$id.err"
  rc=$?
  t1="$(date +%s)"
  jq -c --argjson s "$((t1 - t0))" '{input_tokens: (.usage.input_tokens // 0), output_tokens: (.usage.output_tokens // 0),
    cache_read_input_tokens: (.usage.cache_read_input_tokens // 0), cache_creation_input_tokens: (.usage.cache_creation_input_tokens // 0), cost_usd: (.total_cost_usd // 0), seconds: $s}' \
    "$raw" >"$W/$id.usage" 2>/dev/null || printf '{"input_tokens":0,"output_tokens":0,"cache_read_input_tokens":0,"cache_creation_input_tokens":0,"cost_usd":0,"seconds":%s}\n' "$((t1 - t0))" >"$W/$id.usage"
  jq -s --arg id "$id" '{($id): .[0]}' "$W/$id.usage" >>"$W/usage.parts"
  if [ "$rc" -ne 0 ]; then echo "review: $id exited with status $rc; no artifact" >&2; return 0; fi
  jq -e '.is_error != true and (.structured_output | type == "object")' "$raw" >/dev/null 2>&1 || { echo "review: $id returned no structured output; no artifact" >&2; return 0; }
  jq '.structured_output' "$raw" >"$W/$id.cand"
  jq -e --arg id "$id" --arg role "$role" '.reviewer == $id and .role == $role' "$W/$id.cand" >/dev/null 2>&1 \
    || { echo "review: $id returned an artifact that does not name itself and its role; no artifact" >&2; return 0; }
  set -- "$W/$id.cand"
  [ -z "$INV_ARG" ] || set -- "$@" --invariants "$INV_ARG"
  [ "$LATER" -eq 0 ] || set -- "$@" --second-run
  if ! why="$(/bin/bash "$VALIDATE" "$@" 2>&1 >/dev/null </dev/null)"; then
    echo "review: $id returned an invalid artifact; no artifact: $(printf '%s' "$why" | head -n 1)" >&2; return 0
  fi
  cp "$W/$id.cand" "$rundir/$id.json"
}

# ------------------------------------------------------------------ warnings
# Each line of $W/warnings.txt informs the user; none changes the verdict or the exit code.
warn() { printf '%s\n' "$1" >>"$W/warnings.txt"; }

check_hooks_path() {
  local hp
  hp="$(norm_path "$(git config --get core.hooksPath 2>/dev/null)")"
  case "$hp" in .githooks|"$ROOT/.githooks"|"$(pwd -P)/.githooks") return 0 ;; esac
  warn "core.hooksPath is '${hp:-unset}', so the pre-push hook in .githooks does not run in this clone; fix: git config core.hooksPath .githooks"
}

# decision_field <name>: the trimmed value of the first `<name>:` line of decisions.md.
decision_field() {
  [ -f "$RD/decisions.md" ] || return 0
  trim "$(tr -d '\r' <"$RD/decisions.md" | sed -n "s/^$1:\\(.*\\)\$/\\1/p" | head -n 1)"
}

# check_r5: the paths changed since the commit R-5 ran at, except specs, review records,
# runner state and the test_dirs of process.conf.
check_r5() {
  local at sha dirs d n
  [ "$(decision_field ran_in_app)" = yes ] || return 0
  at="$(decision_field at)"
  if [ -z "$at" ] || ! sha="$(git rev-parse --verify -q "$at^{commit}")"; then
    warn "ran_in_app is yes but the R-5 commit is unknown (no usable at: in $RD/decisions.md); run R-5 again if this change alters what a user sees"
    return 0
  fi
  dirs="docs/specs docs/process/reviews .process/runs"
  [ ! -f process/process.conf ] || dirs="$dirs $(tr -d '\r' <process/process.conf \
    | sed -n 's/^[[:space:]]*test_dirs[[:space:]]*=//p' | tail -n 1)"
  gdiff --name-only -z "$sha" "$HEAD_SHA" | tr '\0' '\n' >"$W/r5.all"
  for d in $dirs; do printf '%s/\n' "$(norm_path "$d")"; done >"$W/r5.dirs"
  awk 'NR == FNR { if ($0 != "/") ex[++k] = $0; next }
    { for (i = 1; i <= k; i++) if (index($0, ex[i]) == 1) next; print }' "$W/r5.dirs" "$W/r5.all" >"$W/r5.changed"
  n="$(awk 'NF' "$W/r5.changed" | wc -l | tr -d ' ')"
  [ "$n" -gt 0 ] || return 0
  warn "R-5 ran at $sha, and these files changed since: $(awk 'NF && NR <= 5 { printf "%s%s", (NR > 1 ? ", " : ""), $0 }' "$W/r5.changed")$([ "$n" -le 5 ] || printf ' and %s more' "$((n - 5))"); run R-5 again if any of them changes what a user sees"
}

# show_warnings: on stderr, and as a section after the title of triage.md so that a reader of
# triage.md alone sees them; TOTAL stays the last line.
show_warnings() {
  [ -s "$W/warnings.txt" ] || return 0
  sed 's/^/review: warning: /' "$W/warnings.txt" >&2
  [ -f "$RUN/triage.md" ] || return 0
  awk -v wf="$W/warnings.txt" 'NR == 2 { print; print "## Warnings"; print ""
      while ((getline l < wf) > 0) print "- " l
      print ""; next } { print }' "$RUN/triage.md" >"$W/triage.md" && cp "$W/triage.md" "$RUN/triage.md"
}

# ------------------------------------------------------------------ main
parse_conf
parse_process_conf
classify
expected_set
build_context

if [ -n "$print_id" ]; then
  row="$(awk -F"$US" -v id="$print_id" '$1 == id' "$W/rev.dat")"
  [ -n "$row" ] || die_usage "no reviewer $print_id in process/reviewers.conf"
  prole="$(printf '%s' "$row" | cut -d "$US" -f3)"; pconf="$(printf '%s' "$row" | cut -d "$US" -f5)"
  last="$(tail -n 1 "$W/ctx/runs.tsv" | cut -f2)"
  brief_for "$print_id" "$prole" "$pconf" "$last" "$W/print.brief"
  cat "$W/print.brief"
  exit 0
fi

if [ "$working" -eq 0 ]; then
  dirty="$(status_lines dirty)"
  if [ -n "$dirty" ]; then
    printf 'review: the tree has changes besides the review outputs (commit them or use --working):\n%s\n' "$dirty" >&2
    exit 2
  fi
fi

SCHEMA_TEXT="$(jq -c . "$SCHEMA")" || die "cannot read $SCHEMA"
RUN="$RD/r$N"
mkdir -p "$RD" && mkdir "$RUN" || die "cannot create $RUN (it exists or the directory is not writable)"
printf '%s\n' "$HEAD_SHA" >"$RUN/head.txt"
cp "$W/expected.txt" "$RUN/expected.txt"
cp "$W/cls.json" "$RUN/classification.json"
cp "$W/ctx/fixes.txt" "$RUN/fixes.txt"

mkdir "$W/out"
: >"$W/usage.parts"
FP_START="$(fingerprint)"

while IFS="$US" read -r id _ role _ pc; do
  [ "$role" = read ] && grep -Fxq -- "$id" "$RUN/expected.txt" && run_reviewer "$id" read "$pc" "$W/out"
done <"$W/rev.dat"
while IFS="$US" read -r id _ role _ pc; do
  [ "$role" = verify ] && grep -Fxq -- "$id" "$RUN/expected.txt" && run_reviewer "$id" verify "$pc" "$W/out"
done <"$W/rev.dat"

for f in "$W/out"/*.json; do [ ! -f "$f" ] || mv "$f" "$RUN/"; done

FP_END="$(fingerprint)"
jq -n --arg s "$FP_START" --arg e "$FP_END" '{start: $s, end: $e}' >"$RUN/fingerprint.json"
jq -s --argjson t "$([ "$TRUNC" -eq 1 ] && echo true || echo false)" 'add + {diff_truncated: $t}' "$W/usage.parts" >"$RUN/usage.json"

if [ ! -e "$RD/decisions.md" ]; then
  printf '# Decisions\n\ndecision:\nran_in_app:\nat:\nby:\nevidence:\n' >"$RD/decisions.md"
fi

set -- "$ROOT/$RUN"
[ -z "$INV_ARG" ] || set -- "$@" --invariants "$INV_ARG"
[ "$LATER" -eq 0 ] || set -- "$@" --second-run
/bin/bash "$MERGE" "$@" >"$W/merge.out" 2>"$W/merge.err"; mcode=$?
case "$mcode" in 0|1|2) ;; *) echo "review: merge failed: $(head -n 3 "$W/merge.err")" >&2; mcode=1 ;; esac

set -- "$ROOT/$RUN"
earlier_dirs >"$W/earlier.list"
while IFS= read -r d; do set -- "$@" --earlier "$ROOT/$d"; done <"$W/earlier.list"
[ -z "$INV_ARG" ] || set -- "$@" --invariants "$INV_ARG"
[ "$LATER" -eq 0 ] || set -- "$@" --second-run
if ! /bin/bash "$RENDER" "$@" >/dev/null 2>"$W/render.err"; then
  echo "review: triage.md was not written: $(head -n 3 "$W/render.err" | tr '\n' ' ')" >&2
  [ "$mcode" -ne 0 ] || mcode=1
fi

: >"$W/warnings.txt"
check_hooks_path
check_r5
show_warnings

verdict="$(jq -r '.verdict // "unknown"' "$RUN/verdict.json" 2>/dev/null)"
printf 'run directory: %s\nverdict: %s\ntriage: %s\n' "$ROOT/$RUN" "$verdict" "$ROOT/$RUN/triage.md"
exit "$mcode"
