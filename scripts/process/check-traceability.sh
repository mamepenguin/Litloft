#!/usr/bin/env bash
# check-traceability.sh [--root <dir>] [--ledger <file>] [--conf <process.conf>]
#
# Checks the spec ledger (docs/specs/INDEX.md, columns: ID | State | Spec file | Approval)
# against process.conf, the spec files, git history and the test directories.
# It checks that an Approval record exists, not who wrote it.
# Exit: 0 when every row passes (or there is no ledger), 1 when a row fails, 2 on a usage
# or unreadable-file error.

set -uf

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

# referenced <id> <dirs>: succeeds when a file under one of the directories contains the ID
# as a whole token; letters, digits, '_' and '-' extend a token.
referenced() {
  local d esc
  esc="$(printf '%s' "$1" | sed 's#[]\\[*.^$(){}?+|/]#\\&#g')"
  for d in $2; do
    [ -d "$ROOT/$d" ] || continue
    grep -rqE -- "(^|[^A-Za-z0-9_-])${esc}([^A-Za-z0-9_-]|\$)" "$ROOT/$d" 2>/dev/null && return 0
  done
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
  sha="$(tr -d '\r' < "$spec" | grep -E '^Approval: ' | tail -n 1 | awk '{print $2}')"
  [ -n "$sha" ] || { fail "$id" "no Approval line (commit sha, name, date) in $specfile"; continue; }
  printf '%s\n' "$sha" | grep -Eq '^([0-9a-f]{40}|[0-9a-f]{64})$' \
    || { fail "$id" "Approval is not a full commit id (40 or 64 hex digits): $sha"; continue; }
  git -C "$ROOT" merge-base --is-ancestor "$sha" HEAD >/dev/null 2>&1 \
    || { fail "$id" "Approval sha $sha is not an ancestor of HEAD"; continue; }
  [ -z "$approval" ] || [ "$approval" = "$sha" ] \
    || fail "$id" "ledger Approval $approval differs from $specfile ($sha)"

  [ "$state" = implemented ] || continue
  referenced "$id" "$TEST_DIRS" || fail "$id" "not referenced under test_dirs ($TEST_DIRS)"
done < "$LEDGER"

[ "$FAILED" -eq 0 ] && echo "check-traceability: ok"
[ "$FAILED" -eq 0 ]
