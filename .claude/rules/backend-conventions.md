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
- Image: fit inside a 320x320 box through ffmpeg, keeping the picture's own
  proportions and never growing it into the box. No padding — the consumer
  crops (`object-fit: cover` in a 16:9 card) or lays out at the real ratio (the
  justified grid). HEIC must be generated through Pillow rather than ffmpeg,
  fitted to the same box.
- PDF: still letterboxed onto a 320x180 **white** frame. The white is the page's
  margin continued to the card edge; cropping a portrait page to 16:9 leaves a
  band of body text with no edges in it.
- Video: still letterboxed onto a 320x180 **black** frame. A video card is a
  fixed 16:9 frame so the padding is invisible inside it, and the
  candidate-rejection analysis reads the unpadded region.
- JPEG, except a picture whose header declares transparency (an alpha band or
  a transparent key): that one gets a WebP with alpha, so the surface it is
  drawn on shows through instead of whatever RGB the file stores under its
  clear pixels. The slot keeps its `.jpg` name either way, and the thumbnail
  endpoint labels the response from the bytes. 320 bounds the long edge rather
  than setting it — a picture smaller than the box keeps its own size. Only
  the video and PDF frames are a fixed 320x180.

## Concurrency control patterns
- ZIP extraction: `asyncio.Semaphore(3)` to cap concurrent extractions.
- Atomic file writes: write to `.tmp` then `os.replace()`.

## Database migrations
- A migration only adds: tables, nullable columns, columns with a default, indexes. A rebuild that changes a constraint keeps every column and its values.
- Dropping or renaming a table or column, or changing what a column's values mean, cuts off every older build. Do it only when the approved spec names that break.
- The reason is that an older build must still open the database a newer build wrote: rolling back is `git checkout` of an earlier commit and a rebuild against the same `data/`, and a fork runs older core code against the same schema. An older build ignores what it does not know; it cannot survive a table or column it expects being gone or reinterpreted.
- When a column has to change meaning, add a new column, write both, and read the new one.

## Prohibitions
- LLM and string-processing logic must not embed language-dependent rules (e.g. searching for the literal word "タイトル" to detect a title).

  What this forbids is **one language's vocabulary or grammar standing in for a concept**. Such a rule works where it was written and silently produces nothing, or nonsense, everywhere else — and nothing in the code says so.

  It does **not** forbid a **script test that gates a mechanism whose correctness provably depends on script**, provided all three hold:

  1. The dependence is **measured**, not assumed, and the measurement is recorded beside the code.
  2. The gate **fails to silence, never to nonsense** — the closed path does nothing rather than something wrong.
  3. The path where the gate is closed is a **designed state**, not a degradation.

  The distinction is silence versus lying. A gate that asks "is this the language I wrote the rule for?" is a guess and is forbidden; one that asks "does this input satisfy the precondition my algorithm needs?" is a test of the algorithm's own contract, and belongs in the code that depends on it.
