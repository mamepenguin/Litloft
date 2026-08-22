# Backend Conventions

## config import
Use `app.config` as a module reference. Direct imports break test-time path patching, so they are prohibited:
```python
# CORRECT
import app.config as config
config.DATA_DIR

# WRONG - test-time patches don't take effect
from app.config import DATA_DIR
```

## Security patterns
- Path traversal prevention: look up `file_path` from the DB by ID → normalize with `os.path.realpath()` → verify it lives under `base_dir`.
- Scanner exclusion: prevent concurrent runs with `asyncio.Lock`; while held, return 409 Conflict.

## Thumbnail generation
- Video: ffmpeg's `thumbnail=300` filter picks a representative frame automatically (skipping the first 10% intro).
- Image: resize via Pillow. HEIC must be generated through Pillow rather than ffmpeg.
- All thumbnails are 320x180 JPEG.

## Concurrency control patterns
- ZIP extraction: `asyncio.Semaphore(3)` to cap concurrent extractions.
- Atomic file writes: write to `.tmp` then `os.replace()`.

## Prohibitions
- LLM and string-processing logic must not embed language-dependent rules (e.g. searching for the literal word "タイトル" to detect a title).
