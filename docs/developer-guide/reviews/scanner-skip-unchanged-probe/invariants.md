# Invariants: scanner skips the sniff for unchanged rows

## Touch points

- `backend/app/services/scanner.py` `_scan_and_register` pass 1 (classification of an existing path)
- `backend/app/services/filetype.py` (probe outcome set)
- `files.file_type`, `files.mime_type`

## Invariants

1. An audio-only mp4 already stored as `audio` / `audio/mp4` with unchanged size is still `audio` / `audio/mp4` after a rescan.
2. An mp4 whose size changed since the last scan is probed again and its classification follows the probe result.
3. A newly added mp4, and an mp4 detected as moved, is probed as before.
4. An mp4 with unchanged size and a stored classification the probe could have produced is not probed on rescan.
