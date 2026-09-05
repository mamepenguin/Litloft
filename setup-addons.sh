#!/usr/bin/env bash
# setup-addons.sh — Scan addons/ and create symlinks into backend/ and frontend/
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

# Remove symlinks for addons that are no longer here.
#
# The loop below only ever creates. An addon that is deleted, renamed, or
# never checked out leaves its link behind pointing at nothing, and the link
# outlives every later run of this script — `frontend/src/addons/` is
# gitignored, so nothing else prunes it in a working copy. `frontend/Dockerfile`
# already does exactly this (`find src/addons -maxdepth 1 -type l -delete`)
# before rebuilding, which is why an image is never affected and a long-lived
# checkout is.
#
# Only broken links are removed, and only from the two directories this script
# owns. A link that resolves is left alone even if it points somewhere
# unexpected: this script's job is to stop lying about what is installed, not
# to overrule a developer who pointed one somewhere on purpose.
pruned=0
for dir in "$BACKEND_ADDONS" "$FRONTEND_ADDONS"; do
  for link in "$dir"/*; do
    [ -L "$link" ] || continue
    [ -e "$link" ] && continue
    rm "$link"
    echo "Pruned: ${link#$SCRIPT_DIR/} (target is gone)"
    pruned=$((pruned + 1))
  done
done

linked=0

for addon_dir in "$ADDONS_DIR"/*/; do
  [ -d "$addon_dir" ] || continue
  addon_name="$(basename "$addon_dir")"

  # Backend symlink
  if [ -d "$addon_dir/backend" ]; then
    target="$BACKEND_ADDONS/$addon_name"
    if [ -L "$target" ]; then
      rm "$target"
    fi
    if [ -d "$target" ]; then
      echo "WARNING: $target exists as a real directory, skipping (remove it manually to use symlink)"
    else
      ln -s "$(cd "$addon_dir/backend" && pwd)" "$target"
      echo "Linked: backend/addons/$addon_name -> addons/$addon_name/backend"
      linked=$((linked + 1))
    fi
  fi

  # Frontend symlink
  if [ -d "$addon_dir/frontend" ]; then
    target="$FRONTEND_ADDONS/$addon_name"
    if [ -L "$target" ]; then
      rm "$target"
    fi
    if [ -d "$target" ]; then
      echo "WARNING: $target exists as a real directory, skipping (remove it manually to use symlink)"
    else
      ln -s "$(cd "$addon_dir/frontend" && pwd)" "$target"
      echo "Linked: frontend/src/addons/$addon_name -> addons/$addon_name/frontend"
      linked=$((linked + 1))
    fi
  fi
done

echo "Done. $linked symlink(s) created, $pruned pruned."
