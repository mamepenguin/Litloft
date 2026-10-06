#!/usr/bin/env bash
# check-traceability.sh [--root <dir>] [--ledger <file>] [--conf <process.conf>]
#
# Checks the spec ledger (docs/specs/INDEX.md, columns: ID | State | Spec file | Approval)
# against process.conf, the spec files and the test directories.
# It checks that an Approval record matches the spec's content, not who wrote it.
# Exit: 0 when every row passes (or there is no ledger), 1 when a row fails, 2 on a usage
# or unreadable-file error.

set -uf

HERE="$(cd "$(dirname "$0")" && pwd)"
die() { printf 'check-traceability: %s\n' "$1" >&2; exit 2; }

trim() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

ROOT=""; LEDGER=""; CONF=""; CONF_EXPLICIT=0
while [ $# -gt 0 ]; do
  case "$1" in
    --root|--ledger|--conf)
      [ $# -ge 2 ] || die "$1 needs a value"
      case "$1" in
        --root) ROOT="$2" ;;
        --ledger) LEDGER="$2" ;;
        --conf) CONF="$2"; CONF_EXPLICIT=1 ;;
      esac
      shift 2 ;;
    *) die "unknown argument: $1" ;;
  esac
done

[ -n "$ROOT" ] || ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
[ -d "$ROOT" ] || die "root is not a directory: $ROOT"
ROOT="$(cd "$ROOT" && pwd)"
[ -n "$LEDGER" ] || LEDGER="$ROOT/docs/specs/INDEX.md"
[ -n "$CONF" ] || CONF="$ROOT/process/process.conf"

TEST_DIRS=""; PATTERN='SPEC-[A-Z]+-[0-9]{3}'; STATES='draft approved implemented superseded'
if [ -e "$CONF" ] || [ "$CONF_EXPLICIT" -eq 1 ]; then
  [ -f "$CONF" ] && [ -r "$CONF" ] || die "conf not readable: $CONF"
  [ "$(head -n 1 "$CONF")" = "# process-kit schema_version: 1" ] \
    || die "$CONF: line 1: expected '# process-kit schema_version: 1'"
  while IFS= read -r line || [ -n "$line" ]; do
    line="$(trim "$line")"
    case "$line" in ''|'#'*) continue ;; esac
    k="$(trim "${line%%=*}")"; v="$(trim "${line#*=}")"
    case "$k" in
      test_dirs) TEST_DIRS="$v" ;;
      spec_ref_pattern) PATTERN="$v" ;;
      ledger_states) STATES="$v" ;;
    esac
  done < "$CONF"
fi

if [ ! -e "$LEDGER" ]; then
  printf 'check-traceability: no ledger at %s; nothing to check\n' "$LEDGER"
  exit 0
fi
[ -f "$LEDGER" ] && [ -r "$LEDGER" ] || die "ledger not readable: $LEDGER"

FAILED=0
fail() { printf 'FAIL %s: %s\n' "$1" "$2" >&2; FAILED=1; }

W_SUBS="$(mktemp -d)" || die "cannot create a temporary directory"
trap 'rm -rf "$W_SUBS"' EXIT

norm_path() {
  local s="$1" prev=""
  while [ "$s" != "$prev" ]; do
    prev="$s"
    s="${s//\/\///}"
    s="${s//\/.\///}"
    case "$s" in ./*) s="${s#./}" ;; esac
    case "$s" in */.) s="${s%/.}" ;; */) s="${s%/}" ;; esac
  done
  [ -n "$s" ] || s=.
  printf '%s' "$s"
}
# below <path> <dir>: <path> is at or below <dir>, by whole segments; a <dir> of `.` holds all.
below() { [ "$2" = . ] || [ "$1" = "$2" ] || case "$1" in "$2"/*) true ;; *) false ;; esac; }

# SUBS_ALL: the gitlink paths of HEAD and the index. SUBS_PIN: `<path>\t<sha>` for those in
# HEAD. The working tree at or below any of them is never evidence.
SUBS_ALL="$W_SUBS/all"; SUBS_PIN="$W_SUBS/pin"
git -C "$ROOT" -c core.quotepath=off ls-tree -r HEAD 2>/dev/null \
  | awk -F'\t' '$1 ~ /^160000 / { split($1, f, " "); print $2 "\t" f[3] }' | LC_ALL=C sort >"$SUBS_PIN"
{ cut -f1 "$SUBS_PIN"
  git -C "$ROOT" -c core.quotepath=off ls-files -s 2>/dev/null | awk -F'\t' '$1 ~ /^160000 / { print $2 }'
} | awk 'NF' | LC_ALL=C sort -u >"$SUBS_ALL"

# initialised <path>: the submodule's own repository answers there, not the superproject's.
initialised() {
  local top phys
  phys="$(cd "$ROOT/$1" 2>/dev/null && pwd -P)" || return 1
  top="$(git -C "$ROOT/$1" rev-parse --show-toplevel 2>/dev/null)" || return 1
  [ "$top" = "$phys" ]
}
in_sub() {
  local s
  while IFS= read -r s; do below "$1" "$s" && return 0; done <"$SUBS_ALL"
  return 1
}

# referenced <id> <dirs>: succeeds when a file under one of the directories contains the ID
# as a whole token; letters, digits, '_' and '-' extend a token. Inside a submodule only the
# superproject's pinned commit is searched. UNREADABLE is set to `<path> at <sha>` for each
# reached submodule that cannot be read at its pin, comma-separated, in path order.
referenced() {
  local d nd esc re s sha part f
  UNREADABLE=""
  esc="$(printf '%s' "$1" | sed 's#[]\\[*.^$(){}?+|/]#\\&#g')"
  re="(^|[^A-Za-z0-9_-])${esc}([^A-Za-z0-9_-]|\$)"
  if [ ! -s "$SUBS_ALL" ]; then
    for d in $2; do
      [ -d "$ROOT/$d" ] || continue
      grep -rqE -- "$re" "$ROOT/$d" 2>/dev/null && return 0
    done
    return 1
  fi
  for d in $2; do
    nd="$(norm_path "$d")"
    [ -d "$ROOT/$nd" ] || continue
    in_sub "$nd" && continue
    while IFS= read -r f; do
      in_sub "${f#./}" || return 0
    done < <(cd "$ROOT" && grep -rlE -- "$re" "$nd" 2>/dev/null)
  done
  while IFS="$(printf '\t')" read -r s sha; do
    for d in $2; do
      nd="$(norm_path "$d")"
      if below "$s" "$nd"; then part=.
      elif below "$nd" "$s"; then part="${nd#"$s"/}"
      else continue; fi
      if initialised "$s" && git -C "$ROOT/$s" cat-file -e "$sha^{commit}" 2>/dev/null; then
        git -C "$ROOT/$s" grep -qE -e "$re" "$sha" -- "$part" 2>/dev/null && return 0
      else
        case ", $UNREADABLE," in *", $s at $sha,"*) ;; *) UNREADABLE="${UNREADABLE:+$UNREADABLE, }$s at $sha" ;; esac
      fi
    done
  done <"$SUBS_PIN"
  return 1
}

SEEN=" "
while IFS= read -r raw || [ -n "$raw" ]; do
  case "$raw" in '   |'*|'  |'*|' |'*) raw="${raw#"${raw%%|*}"}" ;; esac
  case "$raw" in '|'*) ;; *) continue ;; esac
  raw="${raw%"${raw##*[![:space:]]}"}"
  row="${raw#|}"; row="${row%|}"
  id="$(trim "${row%%|*}")"; rest="${row#*|}"
  state="$(trim "${rest%%|*}")"; rest="${rest#*|}"
  specfile="$(trim "${rest%%|*}")"; approval="$(trim "${rest#*|}")"
  case "$id" in ID) continue ;; esac
  case "$id$state$specfile$approval" in *[!-:\ ]*) ;; *) continue ;; esac
  case "$row" in *'|'*'|'*'|'*) ;; *) fail "$id" "malformed row"; continue ;; esac

  printf '%s\n' "$id" | grep -Eq -- "^($PATTERN)\$" || fail "$id" "ID does not match spec_ref_pattern"
  case "$SEEN" in *" $id "*) fail "$id" "duplicate ID" ;; esac
  SEEN="$SEEN$id "

  known=0; for s in $STATES; do [ "$s" = "$state" ] && known=1; done
  [ "$known" -eq 1 ] || { fail "$id" "state '$state' is not one of: $STATES"; continue; }
  case "$state" in approved|implemented) ;; *) continue ;; esac

  spec="$ROOT/$specfile"
  if [ -z "$specfile" ] || [ ! -f "$spec" ]; then fail "$id" "spec file not found: $specfile"; continue; fi
  rec="$(tr -d '\r' < "$spec" | grep -E '^Approval: ' | tail -n 1 | awk '{print $2}')"
  [ -n "$rec" ] || { fail "$id" "no Approval line (sha256:<hash>, name, date) in $specfile"; continue; }
  printf '%s\n' "$rec" | grep -Eq '^sha256:[0-9a-f]{64}$' \
    || { fail "$id" "Approval is not sha256:<64 hex digits>: $rec"; continue; }
  cur="$(bash "$HERE/spec-hash.sh" "$spec")" || die "cannot hash $specfile"
  [ "$rec" = "$cur" ] \
    || { fail "$id" "$specfile changed after approval: Approval $rec, content $cur"; continue; }
  [ -z "$approval" ] || [ "$approval" = "$rec" ] \
    || fail "$id" "ledger Approval $approval differs from $specfile ($rec)"

  [ "$state" = implemented ] || continue
  referenced "$id" "$TEST_DIRS" \
    || fail "$id" "not referenced under test_dirs ($TEST_DIRS)${UNREADABLE:+; cannot read submodule $UNREADABLE}"
done < "$LEDGER"

[ "$FAILED" -eq 0 ] && echo "check-traceability: ok"
[ "$FAILED" -eq 0 ]
