#!/usr/bin/env bash
# spec-hash.sh <spec>
#
# Prints the hash a spec's Approval line records: `sha256:<64 hex>` of the file with every
# CR removed and then every line that starts with `Approval:` removed, so recording the
# approval does not change the hash.
# Exit: 0, or 2 on a usage or unreadable-file error.

set -uf

die() { printf 'spec-hash: %s\n' "$1" >&2; exit 2; }

[ $# -eq 1 ] || die "usage: spec-hash.sh <spec>"
[ -f "$1" ] && [ -r "$1" ] || die "not a readable file: $1"

if command -v sha256sum >/dev/null 2>&1; then
  digest() { sha256sum; }
elif command -v shasum >/dev/null 2>&1; then
  digest() { shasum -a 256; }
else
  die "neither sha256sum nor shasum is installed"
fi

hex="$(tr -d '\r' < "$1" | grep -v '^Approval:' | digest | awk '{print $1}')"
printf '%s\n' "$hex" | grep -Eq '^[0-9a-f]{64}$' || die "could not hash $1"
printf 'sha256:%s\n' "$hex"
