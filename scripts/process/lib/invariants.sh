#!/usr/bin/env bash
# Functions shared by review.sh and related-specs.sh. Source this file; it defines
# approved_specs and later_revisions and nothing else.

# approved_specs <out>: `<approval date>\t<spec path>` for every spec under docs/specs
# whose Approval line records the hash of its content, oldest date first and then by file
# name. A spec that cannot be read or hashed stops the list.
approved_specs() {
  local out="$1" f rec h lines="" tab
  tab="$(printf '\t')"
  for f in docs/specs/*.md; do
    [ -f "$f" ] || continue
    [ -r "$f" ] || { printf 'not a readable file: %s\n' "$f" >&2; return 2; }
    rec="$(tr -d '\r' <"$f" | grep -E '^Approval: ' | tail -n 1)"
    [ -n "$rec" ] || continue
    if ! h="$(bash "$(dirname "${BASH_SOURCE[0]}")/../spec-hash.sh" "$f" 2>&1)"; then
      printf '%s\n' "$(printf '%s\n' "${h:-cannot hash $f}" | head -n 1)" >&2
      return 2
    fi
    [ "$(printf '%s\n' "$rec" | awk '{print $2}')" = "$h" ] || continue
    lines+="$(printf '%s\n' "$rec" | awk '{print $NF}')$tab$f"$'\n'
  done
  printf '%s' "$lines" | LC_ALL=C sort -t "$tab" -k1,1 -k2,2 >"$out"
}

# later_revisions <spec> <approved>: each `<SPEC-ID> I<N>. <sentence>` line under
# `## Revises` in an approved spec that names one of <spec>'s SPEC-IDs, as
# `I<N>. (<that spec>) <sentence>`, followed by the block heading. Prints nothing when
# there is no such line.
later_revisions() {
  local spec="$1" approved="$2" ids out tab
  [ -f "$approved" ] || return 2
  ids="$(sed -n 's/^SPEC-ID:[[:space:]]*\([^[:space:]]*\).*/\1/p' "$spec" | tr '\n' ' ')"
  [ -n "$ids" ] || return 0
  tab="$(printf '\t')"
  out="$(
    while IFS="$tab" read -r _ f || [ -n "$f" ]; do
      [ -n "$f" ] || continue
      [ "$f" != "$spec" ] || continue
      [ -f "$f" ] || continue
      awk -v ids="$ids" -v src="$f" '/^## / { on = ($0 ~ /^## Revises[[:space:]]*$/); next }
        on && index(" " ids, " " $1 " ") && match($2, /^I[0-9]+[a-z]*[.:]$/) {
          rest = $0; sub(/^[^[:space:]]+[[:space:]]+[^[:space:]]+[[:space:]]*/, "", rest)
          print $2 " (" src ") " rest }' "$f"
    done <"$approved"
  )"
  [ -n "$out" ] || return 0
  printf '\n## Revised by later specs\n\n%s\n' "$out"
}
