#!/usr/bin/env bash
# classify-risk.sh [--base <ref>] [--changed-files <file>] [--diff <file>]
#                  [--conf <risk-zones.conf>] [--lock <.process-kit.lock>]
#                  [--protected-conf <protected-paths.conf>] [--root <dir>]
#
# Classifies a change as LOW, MEDIUM, HIGH or CRITICAL from the diff, the risk-zones
# conf and the lock, and nothing else. JSON on stdout, a summary on stderr. Exits 2,
# printing no JSON, when an input cannot be read or parsed: --diff and --changed-files
# must be regular readable files, as must an explicit --lock or --protected-conf (only
# a missing default location means empty); a lock line that is not blank, `# comment`,
# `version <string>` or `<64 hex digits>  <relative path>` is an error.
#
# score = base (from the number of changed lines) + points of the highest zone
#         + number of distinct modifiers that match; then promotions raise the level.
#
# Zone points: LOW 0, MEDIUM 4, HIGH 8, CRITICAL 10. These are the area scores of the
# classifier this was generalized from; with the thresholds below, an unmatched path
# (MEDIUM, 4) needs a change of more than 200 lines or two modifiers to reach HIGH,
# and a HIGH zone reaches HIGH alone.
#
# Numeric values the template of risk-zones.conf is expected to use:
#   base 50 0 / base 200 1 / base 500 2 / base * 3
#   level 2 LOW / level 5 MEDIUM / level 9 HIGH / level * CRITICAL
#
# A path takes the level of the first `zone` row whose glob matches it.
# Globs are gitignore-style: `*` and `?` do not cross `/`, `**` does. A glob without a
# `/` matches the final path component at any depth, so a bare directory name does not
# cover the files under it; a glob with a `/` is anchored at
# the root (a leading `/` is allowed). A glob ending in `/` or containing `[` is an
# error, in `zone`, `human` and protected-paths.conf alike.
#
# Paths under docs/process/reviews/ and .process/runs/ (the review record and run scratch)
# are left out of the score: no changed lines, no zone, no modifier, no docs-only vote.
# They are still checked against the protected set and the human rows. Every hunk line of
# a --diff file counts: leaving those paths out of it is the caller's job.
#
# Changed lines are the `+` and `-` lines inside hunks of a `diff --git` style diff.
# Without --changed-files and --diff the diff is `git diff <base>...HEAD`; the base is
# --base, else $PROCESS_BASE_REF, else origin/main, and --root must be the repository's
# top-level directory. With only one of the two files, the other half is derived from it
# (paths from the diff headers) or is empty (no lines).
#
# The protected set is read from the lock in HEAD when diffing git (absent there means
# no lock-derived protection), and from the --lock file when given --changed-files or
# --diff.

set -uf

die() { echo "classify-risk: $*" >&2; exit 2; }

UNSCORED_RE='^(docs/process/reviews|[.]process/runs)/'

BASE_REF=""; BASE_EXPLICIT=0
CHANGED_FILE=""; DIFF_FILE=""; CONF=""; LOCK=""; PROT_CONF=""; ROOT=""
LOCK_EXPLICIT=0; PROT_EXPLICIT=0

while [ $# -gt 0 ]; do
  case "$1" in
    --base|--changed-files|--diff|--conf|--lock|--protected-conf|--root)
      [ $# -ge 2 ] || die "$1 needs a value"
      case "$1" in
        --base) BASE_REF="$2"; BASE_EXPLICIT=1 ;;
        --changed-files) CHANGED_FILE="$2" ;;
        --diff) DIFF_FILE="$2" ;;
        --conf) CONF="$2" ;;
        --lock) LOCK="$2"; LOCK_EXPLICIT=1 ;;
        --protected-conf) PROT_CONF="$2"; PROT_EXPLICIT=1 ;;
        --root) ROOT="$2" ;;
      esac
      shift 2 ;;
    *) die "unknown argument: $1" ;;
  esac
done

[ -n "$ROOT" ] || ROOT="$(pwd)"
[ -d "$ROOT" ] || die "root is not a directory: $ROOT"
ROOT="$(cd "$ROOT" && pwd)"
[ -n "$CONF" ] || CONF="$ROOT/process/risk-zones.conf"
[ -n "$LOCK" ] || LOCK="$ROOT/.process-kit.lock"
[ -n "$PROT_CONF" ] || PROT_CONF="$ROOT/process/protected-paths.conf"
[ -r "$CONF" ] || die "cannot read conf: $CONF"

W="$(mktemp -d)" || die "cannot create a temporary directory"
trap 'rm -rf "$W"' EXIT
: > "$W/zone.globs"; : > "$W/zone.levels"; : > "$W/human.globs"; : > "$W/prot.globs"
: > "$W/mod.re"; : > "$W/mod.name"; : > "$W/promote"; : > "$W/base.rows"; : > "$W/level.rows"
: > "$W/content"; : > "$W/paths"; : > "$W/lock.entries"; : > "$W/base.entries"

rank() {
  case "$1" in LOW) echo 0 ;; MEDIUM) echo 1 ;; HIGH) echo 2 ;; CRITICAL) echo 3 ;; *) return 1 ;; esac
}
points() {
  case "$1" in LOW) echo 0 ;; MEDIUM) echo 4 ;; HIGH) echo 8 ;; CRITICAL) echo 10 ;; esac
}
is_number() { case "$1" in ''|*[!0-9]*) return 1 ;; esac; [ "${#1}" -le 9 ]; }
check_glob() { case "$1" in */|*'['*) die "$2: unsupported glob (ends with '/' or contains '['): $1" ;; esac; }
# optional_file <path> <what> <explicit>: 0 when readable, 1 when a missing default.
optional_file() {
  if [ -e "$1" ] || [ "$3" -eq 1 ]; then
    [ -f "$1" ] && [ -r "$1" ] || die "cannot read $2: $1"
    return 0
  fi
  return 1
}
HAVE_LOCK=0; HAVE_PROT=0
if optional_file "$LOCK" "lock" "$LOCK_EXPLICIT"; then HAVE_LOCK=1; fi
if optional_file "$PROT_CONF" "protected-paths conf" "$PROT_EXPLICIT"; then HAVE_PROT=1; fi

# ---------------------------------------------------------------- conf
DEFAULT_ZONE=MEDIUM
last_base=-1; last_level=-1; level_star=0
lineno=0
while IFS= read -r line || [ -n "$line" ]; do
  lineno=$((lineno + 1))
  line="${line%$'\r'}"
  line="${line#"${line%%[![:space:]]*}"}"
  case "$line" in ''|'#'*) continue ;; esac
  kw="${line%%[[:space:]]*}"
  rest="${line#"$kw"}"
  rest="${rest#"${rest%%[![:space:]]*}"}"
  rest="${rest%"${rest##*[![:space:]]}"}"
  where="$CONF:$lineno"
  case "$kw" in
    zone)
      glob="${rest%%[[:space:]]*}"; lvl="${rest#"$glob"}"; lvl="${lvl//[[:space:]]/}"
      [ -n "$glob" ] && rank "$lvl" >/dev/null || die "$where: expected 'zone <glob> <LEVEL>'"
      check_glob "$glob" "$where"
      printf '%s\n' "$glob" >> "$W/zone.globs"; printf '%s\n' "$lvl" >> "$W/zone.levels" ;;
    human)
      [ -n "$rest" ] || die "$where: expected 'human <glob>'"
      check_glob "$rest" "$where"
      printf '%s\n' "$rest" >> "$W/human.globs" ;;
    default_zone)
      rank "$rest" >/dev/null || die "$where: unknown level '$rest'"
      [ "$rest" != LOW ] || die "$where: default_zone LOW is not allowed"
      DEFAULT_ZONE="$rest" ;;
    modifier)
      name="${rest##*[[:space:]]}"; re="${rest%"$name"}"; re="${re%"${re##*[![:space:]]}"}"
      [ -n "$re" ] && [ "$re" != "$rest" ] || die "$where: expected 'modifier <regex> <name>'"
      rc=0; printf '' | grep -E -q -e "$re" 2>/dev/null || rc=$?
      [ "$rc" -le 1 ] || die "$where: invalid regular expression"
      printf '%s\n' "$re" >> "$W/mod.re"; printf '%s\n' "$name" >> "$W/mod.name" ;;
    promote)
      names="${rest%%[[:space:]]*}"; lvl="${rest#"$names"}"; lvl="${lvl//[[:space:]]/}"
      [ -n "$names" ] && rank "$lvl" >/dev/null || die "$where: expected 'promote <names> <LEVEL>'"
      printf '%s\t%s\t%s\n' "$names" "$lvl" "$where" >> "$W/promote" ;;
    base)
      lim="${rest%%[[:space:]]*}"; pts="${rest#"$lim"}"; pts="${pts//[[:space:]]/}"
      is_number "$pts" || die "$where: expected 'base <limit> <points>'"
      if [ "$lim" = "*" ]; then last_base=999999999; else
        is_number "$lim" || die "$where: expected 'base <limit> <points>'"
        [ "$lim" -gt "$last_base" ] || die "$where: base limits must ascend"
        last_base="$lim"
      fi
      printf '%s\t%s\n' "$lim" "$((10#$pts))" >> "$W/base.rows" ;;
    level)
      lim="${rest%%[[:space:]]*}"; lvl="${rest#"$lim"}"; lvl="${lvl//[[:space:]]/}"
      rank "$lvl" >/dev/null || die "$where: expected 'level <limit> <LEVEL>'"
      [ "$level_star" -eq 0 ] || die "$where: no level row may follow 'level *'"
      if [ "$lim" = "*" ]; then level_star=1; else
        is_number "$lim" || die "$where: expected 'level <limit> <LEVEL>'"
        [ "$lim" -gt "$last_level" ] || die "$where: level limits must ascend"
        last_level="$lim"
      fi
      printf '%s\t%s\n' "$lim" "$lvl" >> "$W/level.rows" ;;
    *) die "$where: unknown row type '$kw'" ;;
  esac
done < "$CONF"
[ "$level_star" -eq 1 ] || die "$CONF: the last 'level' row must have limit *"
while IFS=$'\t' read -r names lvl where; do
  for n in $(printf '%s' "$names" | tr ',' ' '); do
    grep -Fxq -- "$n" "$W/mod.name" || die "$where: promote names a modifier no row defines: $n"
  done
done < "$W/promote"

# ---------------------------------------------------------------- glob matching
# glob_first <globs-file> <paths-file>: for each path, the 1-based line number of the
# first matching glob, or 0.
glob_first() {
  awk '
    function g2re(g,   anch, n, i, c, re, start) {
      anch = (index(g, "/") > 0)
      if (substr(g, 1, 1) == "/") g = substr(g, 2)
      n = length(g); re = ""; i = 1
      while (i <= n) {
        c = substr(g, i, 1)
        if (c == "*") {
          if (substr(g, i, 2) == "**") {
            start = (i == 1 || substr(g, i - 1, 1) == "/")
            if (start && substr(g, i + 2, 1) == "/") { re = re "(.*/)?"; i += 3; continue }
            re = re ".*"; i += 2; continue
          }
          re = re "[^/]*"
        } else if (c == "?") {
          re = re "[^/]"
        } else if (index(".+()[]{}^$|\\", c) > 0) {
          re = re "\\" c
        } else {
          re = re c
        }
        i++
      }
      if (!anch) re = "(.*/)?" re
      return "^" re "$"
    }
    FILENAME == ARGV[1] { n++; re[n] = g2re($0); next }
    { r = 0; for (i = 1; i <= n; i++) if ($0 ~ re[i]) { r = i; break }; print r }
  ' "$1" "$2"
}

# ---------------------------------------------------------------- change set
g() { git -c core.quotepath=off -C "$ROOT" "$@"; }
MB=""
resolve_base() {
  g rev-parse --git-dir >/dev/null 2>&1 || die "not a git repository: $ROOT"
  g rev-parse --verify --quiet "$BASE_REF^{commit}" >/dev/null 2>&1 || die "base ref does not exist: $BASE_REF"
  top="$(g rev-parse --show-toplevel 2>/dev/null)" && [ "$(cd "$top" && pwd -P)" = "$(cd "$ROOT" && pwd -P)" ] \
    || die "root is not the repository top-level directory: $ROOT"
  MB="$(g merge-base "$BASE_REF" HEAD 2>/dev/null)" || die "no common ancestor of $BASE_REF and HEAD"
}

GIT_MODE=0
if [ -n "$CHANGED_FILE" ] || [ -n "$DIFF_FILE" ]; then
  if [ -n "$DIFF_FILE" ]; then
    [ -f "$DIFF_FILE" ] && [ -r "$DIFF_FILE" ] || die "cannot read diff: $DIFF_FILE"
    cp "$DIFF_FILE" "$W/diff" || die "cannot read diff: $DIFF_FILE"
  else
    : > "$W/diff"
  fi
  if [ -n "$CHANGED_FILE" ]; then
    [ -f "$CHANGED_FILE" ] && [ -r "$CHANGED_FILE" ] || die "cannot read changed files: $CHANGED_FILE"
    tr -d '\r' < "$CHANGED_FILE" > "$W/cf.raw" || die "cannot read changed files: $CHANGED_FILE"
    awk 'length > 0' "$W/cf.raw" > "$W/cf.nonblank" || die "cannot read changed files: $CHANGED_FILE"
    LC_ALL=C sort -u "$W/cf.nonblank" > "$W/paths" || die "cannot sort changed files"
  else
    awk '/^diff --git /{ p = $0; sub(/^diff --git a\/.* b\//, "", p); print p }' "$W/diff" > "$W/hdr.paths" \
      || die "cannot read diff: $DIFF_FILE"
    LC_ALL=C sort -u "$W/hdr.paths" > "$W/paths" || die "cannot sort changed paths"
  fi
  [ "$BASE_EXPLICIT" -eq 0 ] || resolve_base
else
  GIT_MODE=1
  [ -n "$BASE_REF" ] || BASE_REF="${PROCESS_BASE_REF:-origin/main}"
  resolve_base
  g diff --name-only --no-renames "$MB" HEAD > "$W/names" 2>/dev/null || die "cannot read the diff against $BASE_REF"
  LC_ALL=C sort -u "$W/names" | grep -v '^$' > "$W/paths" || true
  g diff --no-renames --no-color --no-ext-diff --src-prefix=a/ --dst-prefix=b/ "$MB" HEAD \
    -- . ':(exclude)docs/process/reviews' ':(exclude).process/runs' > "$W/diff" 2>/dev/null \
    || die "cannot read the diff against $BASE_REF"
fi

CHANGED_LINES="$(awk -v out="$W/content" '
  /^diff --git / { inh = 0; next }
  /^@@/ { inh = 1; next }
  inh && /^[-+]/ { n++; print substr($0, 2) > out }
  END { print n + 0 }
' "$W/diff")" || die "cannot count the changed lines"
[ -e "$W/content" ] || : > "$W/content"

# ---------------------------------------------------------------- lock and protected set
# parse_lock <file> <label> <entries-out>
parse_lock() {
  local n=0 line hex
  : > "$3"
  while IFS= read -r line || [ -n "$line" ]; do
    n=$((n + 1))
    line="${line%$'\r'}"
    case "$line" in ''|'#'*|'version '?*) continue ;; esac
    case "$line" in *[![:space:]]*) ;; *) continue ;; esac
    hex="${line:0:64}"
    if [ "${#hex}" -ne 64 ] || [ -n "${hex//[0-9A-Fa-f]/}" ] || [ "${line:64:2}" != "  " ] \
       || [ -z "${line:66}" ] || [ "${line:66:1}" = "/" ]; then
      die "$2:$n: malformed lock line: $line"
    fi
    printf '%s\n' "${line:66}" >> "$3"
  done < "$1"
}
# lock_at <rev> <label> <entries-out>: parses the lock committed at <rev>, empty when absent.
lock_at() {
  : > "$3"
  g cat-file -e "$1:.process-kit.lock" 2>/dev/null || return 0
  g show "$1:.process-kit.lock" > "$W/lock.at" 2>/dev/null || die "cannot read $2"
  parse_lock "$W/lock.at" "$2" "$3"
}

if [ "$GIT_MODE" -eq 1 ]; then
  lock_at HEAD "HEAD:.process-kit.lock" "$W/lock.entries"
elif [ "$HAVE_LOCK" -eq 1 ]; then
  parse_lock "$LOCK" "$LOCK" "$W/lock.entries"
fi

if [ "$HAVE_PROT" -eq 1 ]; then
  lineno=0
  while IFS= read -r line || [ -n "$line" ]; do
    lineno=$((lineno + 1))
    line="${line%$'\r'}"
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    case "$line" in ''|'#'*) continue ;; esac
    check_glob "$line" "$PROT_CONF:$lineno"
    printf '%s\n' "$line" >> "$W/prot.globs"
  done < "$PROT_CONF"
fi

LOCK_REMOVED=""
if [ -n "$MB" ] && grep -Fxq -- ".process-kit.lock" "$W/paths"; then
  lock_at "$MB" "$MB:.process-kit.lock" "$W/base.entries"
  LOCK_REMOVED="$(grep -Fvx -f "$W/lock.entries" "$W/base.entries" || true)"
fi

# ---------------------------------------------------------------- per-path facts
glob_first "$W/zone.globs" "$W/paths" > "$W/zone.idx"
glob_first "$W/human.globs" "$W/paths" > "$W/human.idx"
glob_first "$W/prot.globs" "$W/paths" > "$W/prot.idx"
awk -v re="$UNSCORED_RE" '{ print ($0 ~ re) ? 1 : 0 }' "$W/paths" > "$W/unscored.idx"

ZL=(); i=0
while IFS= read -r l; do i=$((i + 1)); ZL[$i]="$l"; done < "$W/zone.levels"

ZONE_MAX=LOW; ZONE_MAX_RANK=0; NPATHS=0; DOCS_ALL=1
: > "$W/zones.tsv"; : > "$W/humans"; : > "$W/protected"
while IFS=$'\t' read -r p zi hi pi ui; do
  [ "$hi" -eq 0 ] || printf '%s\n' "$p" >> "$W/humans"
  prot=0
  if [ "$p" = ".process-kit.lock" ] || [ "$pi" -gt 0 ] || grep -Fxq -- "$p" "$W/lock.entries"; then prot=1; fi
  case "$p" in process/*) prot=1 ;; esac
  [ "$prot" -eq 0 ] || { printf '%s\n' "$p" >> "$W/protected"; DOCS_ALL=0; }
  [ "$ui" -eq 0 ] || continue
  NPATHS=$((NPATHS + 1))
  if [ "$zi" -gt 0 ]; then lvl="${ZL[$zi]}"; else lvl="$DEFAULT_ZONE"; fi
  printf '%s\t%s\n' "$p" "$lvl" >> "$W/zones.tsv"
  r="$(rank "$lvl")"
  if [ "$r" -gt "$ZONE_MAX_RANK" ] || [ "$NPATHS" -eq 1 ]; then ZONE_MAX="$lvl"; ZONE_MAX_RANK="$r"; fi
  case "$p" in docs/*|*.md) ;; *) DOCS_ALL=0 ;; esac
done < <(paste -d '\t' "$W/paths" "$W/zone.idx" "$W/human.idx" "$W/prot.idx" "$W/unscored.idx")
DOCS_ONLY=false
[ "$NPATHS" -gt 0 ] && [ "$DOCS_ALL" -eq 1 ] && DOCS_ONLY=true
ZONE_POINTS="$(points "$ZONE_MAX")"

# ---------------------------------------------------------------- base, modifiers, score
BASE=0; have=0
while IFS=$'\t' read -r lim pts; do
  BASE="$pts"; have=1
  if [ "$lim" = "*" ] || [ "$CHANGED_LINES" -le "$lim" ]; then break; fi
done < "$W/base.rows"
[ "$have" -eq 1 ] || BASE=0

: > "$W/mods"
mi=0
while IFS= read -r re; do
  mi=$((mi + 1))
  name="$(sed -n "${mi}p" "$W/mod.name")"
  if grep -E -q -e "$re" "$W/content"; then
    grep -Fxq -- "$name" "$W/mods" || printf '%s\n' "$name" >> "$W/mods"
  fi
done < "$W/mod.re"
MOD_COUNT="$(grep -c . "$W/mods" || true)"

SCORE=$((BASE + ZONE_POINTS + MOD_COUNT))
RISK=CRITICAL
while IFS=$'\t' read -r lim lvl; do
  if [ "$lim" = "*" ] || [ "$SCORE" -le "$lim" ]; then RISK="$lvl"; break; fi
done < "$W/level.rows"

# ---------------------------------------------------------------- promotions
: > "$W/promotions"
promote_to() {
  if [ "$(rank "$RISK")" -lt "$(rank "$1")" ]; then
    RISK="$1"; printf '%s=%s\n' "$2" "$1" >> "$W/promotions"
  fi
}
while IFS=$'\t' read -r names lvl _; do
  all=1
  for n in $(printf '%s' "$names" | tr ',' ' '); do
    grep -Fxq -- "$n" "$W/mods" || all=0
  done
  [ "$all" -eq 0 ] || promote_to "$lvl" "$names"
done < "$W/promote"
[ -z "$LOCK_REMOVED" ] || promote_to CRITICAL lock_entry_removed
[ ! -s "$W/protected" ] || promote_to CRITICAL protected_path

# ---------------------------------------------------------------- reasons
: > "$W/reasons"
if [ "$NPATHS" -gt 0 ]; then
  printf 'highest zone %s (%s points)\n' "$ZONE_MAX" "$ZONE_POINTS" >> "$W/reasons"
fi
[ "$MOD_COUNT" -eq 0 ] || printf 'modifiers: %s\n' "$(tr '\n' ' ' < "$W/mods" | sed 's/ $//')" >> "$W/reasons"
while IFS= read -r p; do printf 'protected path changed: %s\n' "$p" >> "$W/reasons"; done < "$W/protected"
while IFS= read -r p; do [ -z "$p" ] || printf 'lock entry removed: %s\n' "$p" >> "$W/reasons"; done <<EOF
$LOCK_REMOVED
EOF
while IFS= read -r p; do printf 'human zone touched: %s\n' "$p" >> "$W/reasons"; done < "$W/humans"
[ "$DOCS_ONLY" != true ] || printf 'docs-only change\n' >> "$W/reasons"

# ---------------------------------------------------------------- output
lines_json() { jq -R -s 'split("\n") | map(select(length > 0))' < "$1"; }

OUT="$(jq -n \
  --arg risk "$RISK" --argjson score "$SCORE" --argjson base "$BASE" --arg zone_max "$ZONE_MAX" \
  --argjson modifiers "$(lines_json "$W/mods")" \
  --argjson promotions "$(lines_json "$W/promotions")" \
  --argjson zones "$(jq -R -s 'split("\n") | map(select(length > 0) | split("\t") | {path: .[0], level: .[1]})' < "$W/zones.tsv")" \
  --argjson humans "$(lines_json "$W/humans")" \
  --argjson protected "$(lines_json "$W/protected")" \
  --argjson docs_only "$DOCS_ONLY" \
  --argjson reasons "$(lines_json "$W/reasons")" \
  '{risk: $risk, score: $score, base: $base, zone_max: $zone_max, modifiers: $modifiers,
    promotions: $promotions, zones_touched: $zones, human_zones_touched: $humans,
    protected_paths_touched: $protected, docs_only: $docs_only, reasons: $reasons}')" \
  || die "cannot write the result"

printf '%s\n' "$OUT"
{
  printf 'risk %s  (score %s = base %s + zone %s + modifiers %s)\n' "$RISK" "$SCORE" "$BASE" "$ZONE_POINTS" "$MOD_COUNT"
  printf 'changed lines: %s, paths: %s\n' "$CHANGED_LINES" "$NPATHS"
  sed 's/^/  - /' "$W/reasons"
  [ ! -s "$W/promotions" ] || sed 's/^/  promoted: /' "$W/promotions"
} >&2
exit 0
