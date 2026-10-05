#!/usr/bin/env bash
# Scan the added lines of the change set for secret-like strings.
#
#   secret-scan.sh [--changed-files <file>] [--allowlist <file>] [--root <dir>]
#
# Exit: 0 clean, 1 finding, 2 usage or allowlist error.
# Change set: with --changed-files, every line of each listed file; otherwise the lines
# added since the merge base with the base ref (PROCESS_BASE_REF, else `base_ref` in
# process/process.conf, else origin/main), including uncommitted changes and untracked files. Findings print the first four characters of the value, never
# more. An allowlist entry's pattern is matched against the matched value, and its path glob
# follows bash `case` rules, so `*` also matches `/`.

set -u

die() { printf 'secret-scan: %s\n' "$1" >&2; exit 2; }

# The last `base_ref = <ref>` in <root>/process/process.conf, trimmed; empty when there is none.
conf_base_ref() {
  [ -f "$1/process/process.conf" ] || return 0
  tr -d '\r' < "$1/process/process.conf" | sed -n 's/^[[:space:]]*base_ref[[:space:]]*=//p' | tail -n 1 \
    | sed 's/^[[:space:]]*//; s/[[:space:]]*$//'
}

trim() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

CHANGED=""; ALLOWLIST=""; ROOT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --changed-files|--allowlist|--root)
      [ $# -ge 2 ] || die "$1 needs a value"
      case "$1" in
        --changed-files) CHANGED="$2" ;;
        --allowlist)     ALLOWLIST="$2" ;;
        --root)          ROOT="$2" ;;
      esac
      shift 2 ;;
    *) die "unknown argument: $1" ;;
  esac
done

if [ -z "$ROOT" ]; then
  ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || die "not in a git repository; pass --root"
fi
[ -d "$ROOT" ] || die "root is not a directory: $ROOT"
[ -z "$CHANGED" ] || [ -f "$CHANGED" ] || die "changed-files list not found: $CHANGED"
if [ -z "$ALLOWLIST" ]; then
  [ ! -f "$ROOT/process/secret-allowlist.txt" ] || ALLOWLIST="$ROOT/process/secret-allowlist.txt"
elif [ ! -f "$ALLOWLIST" ]; then
  die "allowlist not found: $ALLOWLIST"
fi

AL_N=0
if [ -n "$ALLOWLIST" ]; then
  lineno=0
  while IFS= read -r raw || [ -n "$raw" ]; do
    lineno=$((lineno + 1))
    line="$(trim "$raw")"
    case "$line" in ''|'#'*) continue ;; esac
    glob="${line%% | *}"
    rest="${line#* | }"
    reason="${rest##* | }"
    if [ "$glob" = "$line" ] || [ "$reason" = "$rest" ]; then
      die "$ALLOWLIST: line $lineno: expected '<path-glob> | <pattern-or-literal> | <reason>'"
    fi
    pat="${rest% | *}"
    glob="$(trim "$glob")"; pat="$(trim "$pat")"; reason="$(trim "$reason")"
    if [ -z "$pat" ]; then
      die "$ALLOWLIST: line $lineno: the pattern must be non-empty"
    fi
    AL_GLOB[$AL_N]="$glob"; AL_PAT[$AL_N]="$pat"
    AL_N=$((AL_N + 1))
  done < "$ALLOWLIST"
fi

TMP="$(mktemp -d)" || die "cannot create a temporary directory"
trap 'rm -rf "$TMP"' EXIT
mkdir "$TMP/chunks"
: > "$TMP/names"

# Each chunk holds one file's scanned lines as "<line number><TAB><text>".
CH_N=0
add_whole_file() {
  [ -f "$ROOT/$1" ] || return 0
  CH_N=$((CH_N + 1))
  awk '{ print NR "\t" $0 }' "$ROOT/$1" > "$TMP/chunks/$CH_N"
  CH_PATH[$CH_N]="$1"
}

if [ -n "$CHANGED" ]; then
  while IFS= read -r raw || [ -n "$raw" ]; do
    p="$(trim "$raw")"
    [ -n "$p" ] || continue
    printf '%s\n' "$p" >> "$TMP/names"
    add_whole_file "$p"
  done < "$CHANGED"
else
  ref="${PROCESS_BASE_REF:-$(conf_base_ref "$ROOT")}"; ref="${ref:-origin/main}"
  git -C "$ROOT" rev-parse --verify --quiet "$ref^{commit}" >/dev/null \
    || die "base ref '$ref' not found; set PROCESS_BASE_REF or base_ref in process/process.conf"
  base="$(git -C "$ROOT" merge-base "$ref" HEAD)" || die "no merge base with $ref"
  git -C "$ROOT" -c core.quotepath=off diff --name-only --diff-filter=ACMR "$base" -- >> "$TMP/names" \
    || die "git diff failed"
  git -C "$ROOT" diff -U0 --no-color --no-prefix --no-ext-diff --diff-filter=ACMR "$base" -- \
    | awk -v dir="$TMP/chunks" -v idx="$TMP/index" '
        /^diff --git / { hdr = 1; next }
        hdr && /^\+\+\+ / { if (out != "") close(out); n++; out = dir "/" n; printf "" > out; print substr($0, 5) >> idx; close(idx); next }
        /^@@/      { hdr = 0; s = $3; sub(/^\+/, "", s); ln = s + 0; next }
        !hdr && /^\+/ { print ln "\t" substr($0, 2) > out; ln++ }
      '
  if [ -f "$TMP/index" ]; then
    # Chunk N written by awk is line N of index.
    while IFS= read -r p; do
      CH_N=$((CH_N + 1))
      CH_PATH[$CH_N]="$p"
    done < "$TMP/index"
  fi
  while IFS= read -r p; do
    [ -n "$p" ] || continue
    printf '%s\n' "$p" >> "$TMP/names"
    add_whole_file "$p"
  done < <(git -C "$ROOT" -c core.quotepath=off ls-files --others --exclude-standard)
fi

RULE_N=0
rule() { R_NAME[$RULE_N]="$1"; R_RE[$RULE_N]="$2"; R_ICASE[$RULE_N]="$3"; RULE_N=$((RULE_N + 1)); }
rule private-key     '-----BEGIN [A-Z ]*PRIVATE KEY-----' 0
rule aws-access-key  'AKIA[0-9A-Z]{16}' 0
rule github-token    'ghp_[A-Za-z0-9]{36}' 0
rule api-key-sk      'sk-[A-Za-z0-9_-]{20,}' 0
rule slack-token     'xox[bap]-[A-Za-z0-9-]{10,}' 0
rule assigned-secret "(key|secret|token|password)[A-Za-z0-9_]*[\"']?[[:space:]]*[:=][[:space:]]*[\"']?[A-Za-z0-9+/_=-]{20,}" 1

FOUND=0

allowed() { # <path> <value>
  local i=0 g pat
  while [ "$i" -lt "$AL_N" ]; do
    g="${AL_GLOB[$i]}"; pat="${AL_PAT[$i]}"
    i=$((i + 1))
    # shellcheck disable=SC2254
    case "$1" in $g) ;; *) continue ;; esac
    case "$2" in *"$pat"*) return 0 ;; esac
    printf '%s\n' "$2" | grep -Eq -- "$pat" 2>/dev/null && return 0
  done
  return 1
}

report() { # <path> <line> <rule> <shown>
  FOUND=1
  printf '%s:%s: %s (value starts with "%s")\n' "$1" "$2" "$3" "$4"
}

value_of() { # <rule> <matched text>
  local v="$2"
  if [ "$1" = assigned-secret ]; then
    v="$(trim "${v#*[:=]}")"
    v="${v#[\"\']}"
  fi
  printf '%s' "$v"
}

shown_of() { # <rule> <matched text>
  local v
  v="$(value_of "$1" "$2")"
  printf '%s' "${v:0:4}"
}

# An assigned value made only of letters, dashes and underscores is an identifier (an i18n
# key, a storage key, a header name), not a secret.
is_identifier() { # <rule> <matched text>
  [ "$1" = assigned-secret ] || return 1
  case "$(value_of "$1" "$2")" in *[!A-Za-z_-]*) return 1 ;; esac
}

first_hit() { # <rule index> <grep flags> <line text>: the first match that is not an identifier
  local m
  while IFS= read -r m; do
    is_identifier "${R_NAME[$1]}" "$m" && continue
    printf '%s' "$m"; return 0
  done < <(printf '%s\n' "$3" | grep -o $2 -- "${R_RE[$1]}")
  return 1
}

while IFS= read -r p; do
  [ -n "$p" ] || continue
  b="${p##*/}"
  case "$b" in
    .env.example|.env.sample|.env.template) continue ;;
    .env|.env.*) allowed "$p" "$p" || report "$p" 1 env-file "" ;;
  esac
done < "$TMP/names"

i=1
while [ "$i" -le "$CH_N" ]; do
  p="${CH_PATH[$i]}"; chunk="$TMP/chunks/$i"
  r=0
  while [ "$r" -lt "$RULE_N" ]; do
    flags="-E"; [ "${R_ICASE[$r]}" = 1 ] && flags="-Ei"
    while IFS= read -r hit; do
      [ -n "$hit" ] || continue
      ln="${hit%%$'\t'*}"; text="${hit#*$'\t'}"
      m="$(first_hit "$r" "$flags" "$text")" || continue
      allowed "$p" "$m" && continue
      report "$p" "$ln" "${R_NAME[$r]}" "$(shown_of "${R_NAME[$r]}" "$m")"
    done < <(grep $flags -- "${R_RE[$r]}" "$chunk")
    r=$((r + 1))
  done
  i=$((i + 1))
done

exit "$FOUND"
