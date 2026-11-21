#!/usr/bin/env bash
# related-specs.sh <spec>
#
# Prints the earlier approved specs that share a path with <spec> in their `## Touch points`,
# rarest shared path first, with the candidate's invariants, the revisions recorded in its
# topic's invariants.md and the revisions later specs made to it. The list is an aid: it
# finds most, not all, of the specs a change revises.
#
# Writes only to stdout and stderr. Exit 0, 2 on a failure, 64 on a usage error.

set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/lib/invariants.sh"

die_usage() { printf 'related-specs: %s\n' "$1" >&2; exit 64; }
die() { printf 'related-specs: %s\n' "$1" >&2; exit 2; }

trim() { local v="$1"; v="${v#"${v%%[![:space:]]*}"}"; printf '%s' "${v%"${v##*[![:space:]]}"}"; }

# phys_path <path>: the absolute path with symlinks resolved. Bounded so that a symlink
# loop stops instead of hanging.
phys_path() { _phys_path "$1" 0; }
_phys_path() {
  local p="$1" depth="$2" dir base t
  [ "$depth" -lt 32 ] || return 1
  dir="$(cd "$(dirname "$p")" 2>/dev/null && pwd -P)" || return 1
  base="$(basename "$p")"
  if [ -L "$dir/$base" ]; then
    t="$(readlink "$dir/$base")" || return 1
    case "$t" in
      /*) _phys_path "$t" "$((depth + 1))" ;;
      *) _phys_path "$dir/$t" "$((depth + 1))" ;;
    esac
    return
  fi
  printf '%s/%s\n' "$dir" "$base"
}

[ $# -eq 1 ] || die_usage "usage: related-specs.sh <spec>"
caller="$(pwd -P)" || die "cannot read the current directory"
case "$1" in
  /*) abs="$1" ;;
  *) abs="$caller/$1" ;;
esac
[ -f "$abs" ] || die_usage "no such file: $1"
[ -r "$abs" ] || die "not a readable file: $1"
draft_phys="$(phys_path "$abs")" || die "cannot resolve $1"
top="$(git rev-parse --show-toplevel 2>/dev/null)" || die "not inside a git repository"
cd "$top" || die "cannot enter $top"
ROOT="$(pwd -P)"
case "$draft_phys" in
  "$ROOT"/*) draft="${draft_phys#"$ROOT"/}" ;;
  *) draft="$draft_phys" ;;
esac

# related_specs_top: the cap, from process/process.conf. ledger_states decides whether a
# superseded ledger row can drop a candidate.
TOP=30
STATES="draft approved implemented superseded"
conf=process/process.conf
TAB="$(printf '\t')"
if [ -r "$conf" ]; then
  n=0
  while IFS= read -r line || [ -n "$line" ]; do
    n=$((n + 1)); line="${line%$'\r'}"
    case "$(trim "$line")" in
      related_specs_top|related_specs_top[!A-Za-z0-9_]*)
        v="$(printf '%s' "$line" | sed -n 's/^[[:space:]]*related_specs_top[[:space:]]*=[[:space:]]*\([0-9]\{1,4\}\)[[:space:]]*$/\1/p')"
        [ -n "$v" ] && [ "$((10#$v))" -gt 0 ] \
          || die "$conf:$n: related_specs_top must be a positive integer of at most 4 digits"
        TOP=$((10#$v)) ;;
    esac
  done <"$conf"
  if grep -Eq '^[[:space:]]*ledger_states[[:space:]]*=' "$conf"; then
    STATES="$(tr -d '\r' <"$conf" | sed -n 's/^[[:space:]]*ledger_states[[:space:]]*=//p' | tail -n 1)"
  fi
fi
HAS_SUPERSEDED=0
case " $STATES " in *" superseded "*) HAS_SUPERSEDED=1 ;; esac

W="$(mktemp -d)" || die "cannot create a temporary directory"
trap 'rm -rf "$W"' EXIT

approved_specs "$W/approved.tsv" || exit 2

spec_ids() { tr -d '\r' <"$1" | sed -n 's/^SPEC-ID:[[:space:]]*\([^[:space:]]*\).*/\1/p'; }
# is_superseded <spec>: every SPEC-ID line has a ledger row in state superseded.
is_superseded() {
  local f="$1" id states
  [ "$HAS_SUPERSEDED" -eq 1 ] || return 1
  [ -f docs/specs/INDEX.md ] || return 1
  spec_ids "$f" >"$W/ids"
  [ -s "$W/ids" ] || return 1
  while IFS= read -r id; do
    states="$(tr -d '\r' <docs/specs/INDEX.md | awk -F'|' -v id="$id" '
      /^[[:space:]]*\|/ {
        a = $2; s = $3
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", a)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", s)
        if (a == id) printf "%s ", s
      }')"
    case " $states " in *" superseded "*) ;; *) return 1 ;; esac
  done <"$W/ids"
  return 0
}

# touch_paths <spec>: the backticked touch-point tokens that name a file path, sorted.
touch_paths() {
  tr -d '\r' <"$1" | awk '
    /^## / { on = ($0 ~ /^## Touch points[[:space:]]*$/); next }
    on {
      s = $0
      while (match(s, /`[^`]*`/)) {
        t = substr(s, RSTART + 1, RLENGTH - 2)
        s = substr(s, RSTART + RLENGTH)
        sub(/:.*/, "", t)
        if (substr(t, 1, 2) == "./") t = substr(t, 3)
        if (t != "" && index(t, "/") && substr(t, length(t), 1) != "/" \
            && index(t, "*") == 0 && index(t, "?") == 0 && index(t, "[") == 0 \
            && index(t, " ") == 0) print t
      }
    }' | LC_ALL=C sort -u
}

: >"$W/candidates"
if [ -d docs/specs ]; then
  while IFS="$TAB" read -r _ f || [ -n "$f" ]; do
    [ -n "$f" ] || continue
    [ "$f" != docs/specs/INDEX.md ] || continue
    [ -f "$f" ] || continue
    [ "$(phys_path "$f")" != "$draft_phys" ] || continue
    is_superseded "$f" && continue
    printf '%s\n' "$f" >>"$W/candidates"
  done <"$W/approved.tsv"
fi

touch_paths "$draft_phys" >"$W/draft.paths"
if [ ! -s "$W/draft.paths" ]; then
  printf 'related-specs: no paths in the touch points of %s\n' "$draft"
  exit 0
fi

n=0
: >"$W/cand.tsv"
while IFS= read -r f; do
  n=$((n + 1))
  printf '%s\t%s\n' "$n" "$f" >>"$W/cand.tsv"
  touch_paths "$f" >"$W/p.$n"
done <"$W/candidates"
N=$((n + 1))

: >"$W/df.tsv"
while IFS= read -r p; do
  df=1; k=0
  while [ "$k" -lt "$n" ]; do
    k=$((k + 1))
    if grep -Fxq -- "$p" "$W/p.$k"; then df=$((df + 1)); fi
  done
  printf '%s\t%s\n' "$p" "$df" >>"$W/df.tsv"
done <"$W/draft.paths"

: >"$W/ranked"
k=0
while [ "$k" -lt "$n" ]; do
  k=$((k + 1))
  grep -Fxf "$W/draft.paths" "$W/p.$k" >"$W/shared.$k" 2>/dev/null || true
  [ -s "$W/shared.$k" ] || continue
  f="$(awk -F'\t' -v k="$k" '$1 == k { print $2 }' "$W/cand.tsv")"
  score="$(awk -F'\t' -v n="$N" 'NR == FNR { df[$1] = $2; next }
    { s += log((n + 1) / df[$0]) } END { printf "%.3f", s }' "$W/df.tsv" "$W/shared.$k")"
  printf '%s\t%s\t%s\n' "$score" "$f" "$k" >>"$W/ranked"
done

if [ ! -s "$W/ranked" ]; then
  printf 'related-specs: no earlier spec shares a path with %s\n' "$draft"
  exit 0
fi
LC_ALL=C sort -t "$TAB" -k1,1gr -k2,2 "$W/ranked" >"$W/ranked.sorted"
head -n "$TOP" "$W/ranked.sorted" >"$W/selected"

# invariance_body <spec>: the lines of its ## Invariants section, heading and outer blank
# lines removed, or nothing.
invariance_body() {
  tr -d '\r' <"$1" | awk '
    /^## / { on = ($0 ~ /^## Invariants[[:space:]]*$/); next }
    on { line[++n] = $0 }
    END {
      while (n > 0 && line[n] ~ /^[[:space:]]*$/) n--
      s = 1
      while (s <= n && line[s] ~ /^[[:space:]]*$/) s++
      for (i = s; i <= n; i++) print line[i]
    }'
}

: >"$W/inv.list"
if [ -d docs/process/reviews ]; then
  find docs/process/reviews -mindepth 2 -maxdepth 2 -type f -name invariants.md 2>/dev/null \
    | LC_ALL=C sort >"$W/inv.list"
fi

first=1
while IFS="$TAB" read -r score f k; do
  [ -n "$f" ] || continue
  {
    printf '## %s  score %s\n' "$f" "$score"
    ids="$(spec_ids "$f" | tr '\n' ' ' | sed 's/ $//')"
    printf 'SPEC-IDs: %s\n' "${ids:-(none)}"
    printf 'shared: %s\n' "$(tr '\n' ' ' <"$W/shared.$k" | sed 's/ $//')"
    body="$(invariance_body "$f")"
    if [ -n "$body" ]; then printf '%s\n' "$body"; else printf '(no invariants)\n'; fi
    while IFS= read -r inv; do
      [ -n "$inv" ] || continue
      [ -r "$inv" ] || die "not a readable file: $inv"
      s="$(sed -n 's/^spec:\(.*\)$/\1/p' "$inv" | head -n 1 | tr -d '\r')"
      s="$(trim "$s")"
      case "$s" in ./*) s="${s#./}" ;; esac
      [ "$s" = "$f" ] || continue
      printf 'from %s:\n' "$inv"
      tr -d '\r' <"$inv" | grep -E '^I[0-9]+[a-z]*[.:]' || true
    done <"$W/inv.list"
    later_revisions "$f" "$W/approved.tsv" || die "cannot read the approved specs"
  } >"$W/block"
  if [ "$first" -eq 1 ]; then first=0; else printf '\n'; fi
  cat "$W/block"
done <"$W/selected"
