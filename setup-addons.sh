#!/usr/bin/env bash
# setup-addons.sh — Scan addons/ and link them into backend/ and frontend/
#
# The two sides are linked differently, and the difference is load-bearing:
#
#   backend/addons/<name>   -> a symlink to addons/<name>/backend
#   frontend/src/addons/<name>/ -> a real directory of per-file symlinks
#
# The frontend side is a directory because tools that enumerate the tree do
# not descend a symlinked directory. node-glob — which `@vitest/coverage-v8`
# reaches through `test-exclude` — takes a `follow` option that vitest does
# not expose, so with a directory symlink an addon file that no test imports
# is invisible to every such walk: it cannot be counted, and no `include`
# pattern can reach it, because `include` is applied as a filter over the
# glob's result rather than as the traversal pattern.
#
# A real directory holding symlinked files is descended normally, so the
# addon frontends are visible to anything walking `frontend/src`, while each
# file still resolves to the addon repository and is edited in one place.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ADDONS_DIR="$SCRIPT_DIR/addons"
BACKEND_ADDONS="$SCRIPT_DIR/backend/addons"
FRONTEND_ADDONS="$SCRIPT_DIR/frontend/src/addons"

if [ ! -d "$ADDONS_DIR" ]; then
  echo "No addons/ directory found. Nothing to do."
  exit 0
fi

# Ensure target directories exist
mkdir -p "$BACKEND_ADDONS" "$FRONTEND_ADDONS"

# Ensure backend/addons/__init__.py exists (required for Python package discovery)
if [ ! -f "$BACKEND_ADDONS/__init__.py" ]; then
  touch "$BACKEND_ADDONS/__init__.py"
fi

# Mirror one addon's frontend as a directory of symlinks.
#
# Rebuilt from scratch on every run rather than patched. Patching would have
# to handle a file becoming a directory, a directory becoming a file, and a
# file deleted upstream — and getting any of those wrong leaves a dangling
# link, which is the one failure that takes the entire test suite down.
# Rebuilding costs milliseconds — it is one `find` and one `ln` per file over
# an addon's whole frontend, tests and assets included, not just the sources
# that carry the coverage argument.
#
# What is NOT rebuilt is a directory holding anything this script did not
# put there. See the guard in the caller.
link_frontend_tree() {
  local src="$1" target="$2"

  rm -rf "$target"
  mkdir -p "$target"

  # Directories first, so a file's parent always exists when it is linked.
  # `-mindepth 1` skips `.` itself, which is `$target`.
  (cd "$src" && find . -mindepth 1 -type d -print0) |
    while IFS= read -r -d '' dir; do
      mkdir -p "$target/${dir#./}"
    done

  (cd "$src" && find . -type f -print0) |
    while IFS= read -r -d '' file; do
      ln -s "$src/${file#./}" "$target/${file#./}"
    done
}

# Does `$target` already point at `$src`, however the link was spelled?
#
# Resolved paths, not `readlink` output: the link may have been written
# relative — `docs/ADDON-DEVELOPMENT.md` told people to make it as
# `ln -s ../../../addons/<name>/frontend` for years — and both spellings mean
# the same thing.
points_at() {
  local target="$1" src="$2"
  [ -L "$target" ] || return 1
  [ -d "$target" ] || return 1
  [ "$(cd "$target" && pwd -P)" = "$(cd "$src" && pwd -P)" ]
}

# Is this frontend entry one we may rebuild?
#
# Two shapes are ours, and the distinction is the whole point:
#
#   - a symlink to THIS addon's own `frontend/` — the single directory symlink
#     this script made before it linked per file. Every existing checkout has
#     four of them, so migrating them silently is the only way anyone moves to
#     the new layout;
#   - a directory holding nothing but directories and symlinks — a link tree
#     from an earlier run.
#
# Everything else is someone's, and is reported rather than overruled: a
# symlink pointing anywhere ELSE under this name, and a directory with a real
# file in it. `$src` is the addon's own `frontend/`, absent when the addon is
# gone — in which case no symlink can be ours, which is the right answer.
#
# Dotfiles do not count as someone's work, and that exclusion is load-bearing
# on macOS. Finder writes `.DS_Store` into any directory it is asked to
# display, and this is a directory a developer opens. Counting it meant one
# such file froze that addon's tree permanently: every later run printed one
# WARNING among the `Linked:` lines and exited 0, so a file added upstream
# never arrived — the exact state this script was changed to end.
frontend_tree_is_ours() {
  local target="$1" src="${2-}"

  if [ -L "$target" ]; then
    [ -n "$src" ] || return 1
    points_at "$target" "$src"
    return
  fi

  [ -d "$target" ] || return 0
  ! foreign_files_in "$target" | grep -q .
}

# The real files under a link tree that this script did not put there.
# Printed, not counted, so the warning can name them: a skip the developer
# cannot explain is a skip they will ignore.
foreign_files_in() {
  find "$1" -type f ! -name '.*'
}


pruned=0

# Remove backend symlinks for addons that are no longer here.
#
# The loop below only ever creates. An addon that is deleted, renamed, or
# never checked out leaves its link behind pointing at nothing, and the link
# outlives every later run of this script — `backend/addons/` is gitignored,
# so nothing else prunes it in a working copy.
#
# Only broken links are removed, and only from the directory this script
# owns. A link that resolves is left alone even if it points somewhere
# unexpected: this script's job is to stop lying about what is installed, not
# to overrule a developer who pointed one somewhere on purpose.
for link in "$BACKEND_ADDONS"/*; do
  [ -L "$link" ] || continue
  [ -e "$link" ] && continue
  rm "$link"
  echo "Pruned: ${link#$SCRIPT_DIR/} (target is gone)"
  pruned=$((pruned + 1))
done

# The same for the frontend, where an addon's entry is a whole directory of
# links rather than one link.
#
# A leftover directory is worse than a leftover link: every file in it is a
# dangling symlink, and a dangling symlink under `frontend/src` fails the
# whole vitest run with ENOENT rather than being skipped. So a link tree whose
# addon is gone is pruned, where a single broken link would have been.
#
# This loop only removes; whether an entry under an INSTALLED addon's name is
# replaced is decided further down by `frontend_tree_is_ours`. Saying "a
# resolving link is left alone" here alone would be half the policy, and the
# half that is false: a link to the addon's own `frontend/` is exactly what
# this script used to make, and it is migrated rather than kept.
for entry in "$FRONTEND_ADDONS"/*; do
  [ -e "$entry" ] || [ -L "$entry" ] || continue
  name="$(basename "$entry")"

  if [ -L "$entry" ]; then
    # A link that resolves survives this loop whatever it points at. If the
    # name is an installed addon the link phase judges it; if it is not, it
    # is a developer's own and nothing here touches it again.
    [ -e "$entry" ] && continue
    rm "$entry"
    echo "Pruned: frontend/src/addons/$name (target is gone)"
    pruned=$((pruned + 1))
    continue
  fi

  # A directory. Keep it if its addon is still here — the link phase below
  # rebuilds it — and keep it regardless if it holds files we did not make.
  [ -d "$ADDONS_DIR/$name/frontend" ] && continue
  if ! frontend_tree_is_ours "$entry" ""; then
    echo "WARNING: $entry holds files this script did not create, leaving it:"
    foreign_files_in "$entry" | sed "s|^|  |"
    continue
  fi
  rm -rf "$entry"
  echo "Pruned: frontend/src/addons/$name (addon is gone)"
  pruned=$((pruned + 1))
done


linked=0

for addon_dir in "$ADDONS_DIR"/*/; do
  [ -d "$addon_dir" ] || continue
  addon_name="$(basename "$addon_dir")"

  # Backend: a single directory symlink. Python's import machinery follows
  # it, and coverage.py measures `--cov=<package>` by walking the package
  # rather than by globbing, so the frontend's traversal problem does not
  # arise here.
  if [ -d "$addon_dir/backend" ]; then
    target="$BACKEND_ADDONS/$addon_name"
    src="$(cd "$addon_dir/backend" && pwd)"
    if [ -L "$target" ] && ! points_at "$target" "$src"; then
      # The same judgement the frontend makes, and the one the prune loop
      # above already promises: a link somewhere else under this name is a
      # developer's own. Overwriting it silently is what this half used to do.
      echo "WARNING: $target is a link to somewhere else, skipping (remove it manually to relink)"
    elif [ ! -L "$target" ] && [ -d "$target" ]; then
      echo "WARNING: $target exists as a real directory, skipping (remove it manually to use symlink)"
    else
      # `-f` so it is recreated even when it already points here, which
      # normalises a relative spelling; `-n` because without it `ln` follows an
      # existing symlink-to-directory and writes THROUGH it — the link would
      # land at `addons/<name>/backend/backend`, pointing at itself, inside the
      # addon's own submodule working tree, and `ln` would exit 0. Verified on
      # BSD, busybox and coreutils: `-sfn` replaces the link on all three.
      ln -sfn "$src" "$target"
      echo "Linked: backend/addons/$addon_name -> addons/$addon_name/backend"
      linked=$((linked + 1))
    fi
  fi

  # Frontend: a real directory of per-file symlinks.
  if [ -d "$addon_dir/frontend" ]; then
    target="$FRONTEND_ADDONS/$addon_name"
    src="$(cd "$addon_dir/frontend" && pwd)"
    if frontend_tree_is_ours "$target" "$src"; then
      link_frontend_tree "$src" "$target"
      echo "Linked: frontend/src/addons/$addon_name/ -> addons/$addon_name/frontend (per file)"
      linked=$((linked + 1))
    elif [ -L "$target" ]; then
      echo "WARNING: $target is a link to somewhere else, skipping (remove it manually to relink)"
    else
      echo "WARNING: $target holds files this script did not create, skipping (remove it manually to relink):"
      foreign_files_in "$target" | sed "s|^|  |"
    fi
  fi
done

echo "Done. $linked addon(s) linked, $pruned pruned."
