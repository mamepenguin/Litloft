#!/usr/bin/env python3
"""
Backfill created_at for existing File records using filesystem mtime.

Usage (inside backend Docker container):
    python scripts/backfill_created_at.py [--dry-run]

Options:
    --dry-run   Print what would be changed without writing to DB.
"""

import argparse
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from sqlalchemy import create_engine, select, update
from sqlalchemy.orm import Session

import app.config as config
from app.models import File


def load_drive_paths() -> dict[str, Path]:
    """Return {drive_name: base_path} mapping from drives.json."""
    drives = config.load_drives()
    return {d["name"]: Path(d["path"]) for d in drives}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="No DB writes")
    args = parser.parse_args()

    drive_paths = load_drive_paths()
    engine = create_engine(config.DATABASE_URL)

    updated = 0
    skipped_missing = 0
    skipped_no_drive = 0

    with Session(engine) as session:
        files = session.scalars(select(File)).all()
        total = len(files)
        print(f"Total file records: {total}")

        for file in files:
            base = drive_paths.get(file.drive)
            if base is None:
                skipped_no_drive += 1
                print(f"  [SKIP] drive not found: {file.drive!r}  ({file.file_path})")
                continue

            full_path = base / file.file_path
            try:
                st = full_path.stat()
                mtime = datetime.fromtimestamp(st.st_mtime, UTC)
            except OSError:
                skipped_missing += 1
                print(f"  [SKIP] file not found on fs: {full_path}")
                continue

            if mtime == file.created_at:
                continue  # already correct

            print(
                f"  {'[DRY]' if args.dry_run else '[UPDATE]'}"
                f"  {file.drive}/{file.file_path}"
                f"  {file.created_at} -> {mtime}"
            )

            if not args.dry_run:
                file.created_at = mtime
                updated += 1

        if not args.dry_run:
            session.commit()

    print()
    print(f"Done. updated={updated}  skipped_missing={skipped_missing}  skipped_no_drive={skipped_no_drive}")


if __name__ == "__main__":
    main()
