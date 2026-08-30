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
- Video: skip the first 10%, then let ffmpeg's `thumbnail=300` filter pick a
  representative candidate. Analyze the unpadded video region and retry later
  when at least 50% of its pixels are near one dominant color. Keep retries
  bounded and use the least-uniform candidate if every candidate is rejected.
- Image: resize via Pillow. HEIC must be generated through Pillow rather than ffmpeg.
- All thumbnails are 320x180 JPEG.

## Concurrency control patterns
- ZIP extraction: `asyncio.Semaphore(3)` to cap concurrent extractions.
- Atomic file writes: write to `.tmp` then `os.replace()`.

## Prohibitions
- LLM and string-processing logic must not embed language-dependent rules (e.g. searching for the literal word "タイトル" to detect a title).

  What this forbids is **one language's vocabulary or grammar standing in for a concept**. Such a rule works where it was written and silently produces nothing, or nonsense, everywhere else — and nothing in the code says so.

  It does **not** forbid a **script test that gates a mechanism whose correctness provably depends on script**, provided all three hold:

  1. The dependence is **measured**, not assumed, and the measurement is recorded beside the code.
  2. The gate **fails to silence, never to nonsense** — the closed path does nothing rather than something wrong.
  3. The path where the gate is closed is a **designed state**, not a degradation.

  The distinction is silence versus lying. A gate that asks "is this the language I wrote the rule for?" is a guess and is forbidden; one that asks "does this input satisfy the precondition my algorithm needs?" is a test of the algorithm's own contract, and belongs in the code that depends on it.
