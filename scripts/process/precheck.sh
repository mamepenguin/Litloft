#!/usr/bin/env bash
# Run the gates of gates.conf, then the secret scan, and report each verdict.
#
#   precheck.sh [--profile local|ci] [--gates <gates.conf>] [--root <dir>]
#               [--changed-files <file>]
#
# Row: name | command | required | expect_regex | profiles
# Fields are separated by " | ". The command may contain " | "; expect_regex and profiles
# may not. A row is never run unless its profile list is empty or names the selected profile.
# Exit: 0 when no required gate failed, 1 otherwise, 2 on a usage or gates-file error.

set -u

HERE="$(cd "$(dirname "$0")" && pwd)"

die() { printf 'precheck: %s\n' "$1" >&2; exit 2; }

trim() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

abspath() { case "$1" in /*) printf '%s' "$1" ;; *) printf '%s/%s' "$PWD" "$1" ;; esac; }

PROFILE=local; GATES=""; ROOT=""; CHANGED=""
while [ $# -gt 0 ]; do
  case "$1" in
    --profile|--gates|--root|--changed-files)
      [ $# -ge 2 ] || die "$1 needs a value"
      case "$1" in
        --profile)       PROFILE="$2" ;;
        --gates)         GATES="$(abspath "$2")" ;;
        --root)          ROOT="$(abspath "$2")" ;;
        --changed-files) CHANGED="$(abspath "$2")" ;;
      esac
      shift 2 ;;
    *) die "unknown argument: $1" ;;
  esac
done

case "$PROFILE" in local|ci) ;; *) die "unknown profile: $PROFILE (expected local or ci)" ;; esac
if [ -z "$ROOT" ]; then
  ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || die "not in a git repository; pass --root"
fi
[ -d "$ROOT" ] || die "root is not a directory: $ROOT"
[ -n "$GATES" ] || GATES="$ROOT/process/gates.conf"
[ -f "$GATES" ] && [ -r "$GATES" ] || die "gates file not readable: $GATES"

# split_row <line>: sets FIELDS[0..NF-1], splitting at each "|" that has a space before it
# and a space or the end of the line after it.
split_row() {
  local s="$1" n="${#1}" i=0 cur="" c prev next
  NF=0
  while [ "$i" -lt "$n" ]; do
    c="${s:$i:1}"
    prev=""; [ "$i" -gt 0 ] && prev="${s:$((i - 1)):1}"
    next="${s:$((i + 1)):1}"
    if [ "$c" = "|" ] && [ "$prev" = " " ] && { [ "$next" = " " ] || [ -z "$next" ]; }; then
      FIELDS[$NF]="$(trim "$cur")"; NF=$((NF + 1)); cur=""
    else
      cur="$cur$c"
    fi
    i=$((i + 1))
  done
  FIELDS[$NF]="$(trim "$cur")"; NF=$((NF + 1))
}

# Every row is validated before any gate runs.
G_N=0
lineno=0
while IFS= read -r raw || [ -n "$raw" ]; do
  lineno=$((lineno + 1))
  line="$(trim "$raw")"
  if [ "$lineno" -eq 1 ]; then
    [ "$line" = "# process-kit schema_version: 1" ] \
      || die "$GATES: line 1: expected '# process-kit schema_version: 1'"
    continue
  fi
  case "$line" in ''|'#'*) continue ;; esac
  split_row "$line"
  [ "$NF" -ge 5 ] || die "$GATES: line $lineno: expected 'name | command | required | expect_regex | profiles'"
  name="${FIELDS[0]}"
  profiles="${FIELDS[$((NF - 1))]}"; expect="${FIELDS[$((NF - 2))]}"; required="${FIELDS[$((NF - 3))]}"
  cmd="${FIELDS[1]}"
  k=2
  while [ "$k" -le $((NF - 4)) ]; do cmd="$cmd | ${FIELDS[$k]}"; k=$((k + 1)); done
  [ -n "$cmd" ] || die "$GATES: line $lineno: empty command"
  case "$required" in yes|no) ;; *) die "$GATES: line $lineno: required must be yes or no" ;; esac
  if [ -n "$expect" ]; then
    printf '' | grep -E -- "$expect" >/dev/null 2>&1
    [ "$?" -le 1 ] || die "$GATES: line $lineno: expect_regex is not a valid extended regex"
  fi
  in_profile=0
  if [ -z "$profiles" ]; then
    in_profile=1
  else
    rest="$profiles"
    while :; do
      tok="$(trim "${rest%%,*}")"
      case "$tok" in
        local|ci) [ "$tok" != "$PROFILE" ] || in_profile=1 ;;
        *) die "$GATES: line $lineno: unknown profile '$tok'" ;;
      esac
      case "$rest" in *,*) rest="${rest#*,}" ;; *) break ;; esac
    done
  fi
  [ "$name" != worktree_setup ] || continue
  [ "$in_profile" -eq 1 ] || continue
  G_NAME[$G_N]="$name"; G_CMD[$G_N]="$cmd"; G_REQ[$G_N]="$required"; G_RE[$G_N]="$expect"
  G_N=$((G_N + 1))
done < "$GATES"
[ "$lineno" -ge 1 ] || die "$GATES: line 1: expected '# process-kit schema_version: 1'"

TMP="$(mktemp -d)" || die "cannot create a temporary directory"
trap 'rm -rf "$TMP"' EXIT

PASSED=0; FAILED=0; SKIPPED=0; REQ_FAILED=0

# classify_command <command>: sets FIRST_KIND to plain (FIRST_PLAIN holds the word: letters,
# digits, _ . / - +), none (only VAR=value words), or other (a quote, parenthesis, brace, !, $
# and the like, which only running the command can judge). VAR=value words with unquoted
# values are skipped.
FIRST_PLAIN=""; FIRST_KIND=none
classify_command() {
  local w name val
  FIRST_PLAIN=""; FIRST_KIND=none
  set -f
  for w in $1; do
    case "$w" in
      *=*)
        name="${w%%=*}"; val="${w#*=}"
        case "$name" in ''|[0-9]*|*[!A-Za-z0-9_]*) ;; *)
          case "$val" in *[!A-Za-z0-9_./+:,@%-]*) FIRST_KIND=other; set +f; return ;; esac
          continue ;;
        esac ;;
    esac
    case "$w" in
      *[!A-Za-z0-9_./+-]*) FIRST_KIND=other ;;
      *) FIRST_KIND=plain; FIRST_PLAIN="$w" ;;
    esac
    break
  done
  set +f
}

# run_gate <name> <command> <required> <expect_regex>
run_gate() {
  local name="$1" cmd="$2" required="$3" expect="$4" out="$TMP/out" first rc verdict=PASS
  classify_command "$cmd"; first="$FIRST_PLAIN"
  if [ "$FIRST_KIND" != other ] && ! { [ -n "$first" ] && (cd "$ROOT" && command -v -- "$first" >/dev/null 2>&1); }; then
    if [ "$required" = no ]; then
      printf 'SKIP %s\n' "$name"; SKIPPED=$((SKIPPED + 1)); return
    fi
    printf 'command not found: %s\n' "${first:-<none>}" > "$out"
    verdict=FAIL
  else
    (cd "$ROOT" && bash -c "$cmd") > "$out" 2>&1 < /dev/null; rc=$?
    if [ "$rc" -ne 0 ]; then
      verdict=FAIL
    elif [ -n "$expect" ] && ! grep -Eq -- "$expect" "$out"; then
      verdict=FAIL
    fi
  fi
  printf '%s %s\n' "$verdict" "$name"
  if [ "$verdict" = PASS ]; then
    PASSED=$((PASSED + 1))
  else
    FAILED=$((FAILED + 1))
    [ "$required" = yes ] && REQ_FAILED=$((REQ_FAILED + 1))
    { printf -- '--- %s ---\n' "$name"; tail -n 20 "$out"; } >> "$TMP/failures"
  fi
}

i=0
while [ "$i" -lt "$G_N" ]; do
  run_gate "${G_NAME[$i]}" "${G_CMD[$i]}" "${G_REQ[$i]}" "${G_RE[$i]}"
  i=$((i + 1))
done

PK_KIT="$HERE" PK_ROOT="$ROOT" PK_CHANGED="$CHANGED" run_gate secret-scan \
  'bash "$PK_KIT/secret-scan.sh" --root "$PK_ROOT" ${PK_CHANGED:+--changed-files "$PK_CHANGED"}' yes ""

printf 'precheck: %d passed, %d failed, %d skipped\n' "$PASSED" "$FAILED" "$SKIPPED"
[ ! -f "$TMP/failures" ] || cat "$TMP/failures" >&2
[ "$REQ_FAILED" -eq 0 ]
