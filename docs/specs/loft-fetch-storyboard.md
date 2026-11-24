# A YouTube fetch also reads the storyboard a reference is missing

SPEC-ID: SPEC-ADDON-121

Approval: sha256:daca611c89261c93f3e10bd9e5f7b945d16a79c00b59e0f6f612811b72438c7d Yuichi Senga 2026-11-17

## Summary

In production, 6,887 of 7,057 YouTube references (97.6%) have no scene candidates:
they were indexed before the storyboard leg of SPEC-ADDON-078 existed, and only a
manual Image analysis (CLIP) regenerate fills them. Without candidates a reference
is missing from scene search, its Scenes section timeline, the Scene candidates grid,
tag suggestions and similar files, and it cannot get a Visual Index (SPEC-ADDON-118
needs candidates). The fetch of SPEC-ADDON-117, which now runs once per reference,
already looks the video up with `yt-dlp -J`, and that answer names the storyboard.
With this change a fetch of a reference that has no candidates also reads its
storyboard from that same answer, exactly as the storyboard leg would, before the
scan. No extra lookup is made. It is for the owner whose YouTube references have no
scenes today.

## Terms

- **Candidates**: a file's `embeddings` rows of type `clip` (the storyboard tiles of a
  `.loft`).
- **Storyboard step**: the work of the storyboard leg of SPEC-ADDON-078
  (`_index_youtube_storyboard` after its lookup): `storyboard_of` and `known_duration`
  on the lookup, `kept_tiles`, the sheet downloads, the tile embeddings, the `clip`
  rows, the tile files and `clip_indexed`, with that leg's log lines.

## Required items

### 1. Normal flow

1. A fetch (SPEC-ADDON-117) whose lookup succeeded, for a YouTube `.loft` with no
   candidates, runs the storyboard step on that lookup's answer right after the
   lookup and before the disk guard, the download and the stages.
2. The rows, tile files and `clip_indexed` it writes are those the storyboard leg
   would write for the same answer. The step neither consults nor records the leg's
   once-per-process retry gate (`_storyboard_failed`, `_storyboard_retry`): a fetch
   runs it whenever the reference has no candidates.
3. The storyboard step of a fetch and the storyboard leg never run for the same file
   at once; the one that starts second waits for the first.
4. A scan that then sets its flag runs the Visual Index hook as today; the reference
   now has candidates, so it is eligible under SPEC-ADDON-118.

### 2. Failure cases

- **No storyboard in the answer, or no duration**: as the leg: nothing written,
  `clip_indexed` set (a definite result).
- **A sheet download or embedding fails, or the step raises anything else**: nothing
  written, `clip_indexed` unchanged. The fetch goes on to the download and the stages; no frame flag, no failure count and
  no YouTube result (SPEC-ADDON-119) is changed by it.
- **The CLIP image model cannot be loaded**: the fetch already ends before its lookup
  when the scan is wanted (SPEC-ADDON-117 step 3.2); when only OCR is wanted, the
  fetch tries to load the model for the step and skips the step if it cannot.
- **The answer has no storyboard**: `clip_indexed` is set and no candidate is written,
  so a later fetch of the same reference runs the step again and logs the absence
  again; no lookup is added for it.

### 3. States

None new. A reference with candidates never gets the storyboard step from a fetch.

### 4. Data read and written

Read: the lookup answer already in hand. Written: the `clip` rows, `vec_clip`
vectors, `frames/<id>/tiles/`, `clip_indexed` — the same as the leg writes.

### 5. External services

The storyboard sheets from YouTube's image host (`i.ytimg.com`), as the leg already
fetches: a few MB per reference. No additional `yt-dlp -J` lookup.

### 6. Authorization

None changes.

### 7. Effect on existing features

References with no candidates gain them as their fetch runs: scene search, the
Scenes section, the Scene candidates grid, tag suggestions and similar files include
them. Each such fetch takes longer by the tile embeddings (about 100 for an 18-minute
video). The CLIP regenerate's storyboard leg is unchanged.

### 8. Error behavior

As the leg's log lines; nothing new for viewers.

### 9. User-visible behavior

YouTube references that had no scenes get them once fetched.

### 10. Non-functional

No new storage beyond what the leg already writes; no additional lookup.

## Touch points

- `addons/intelligence/app/workers/loft_media.py`: call the storyboard step after a
  successful lookup when the reference has no candidates.
- `addons/intelligence/app/workers/clip.py`: let the storyboard step run on a given
  lookup answer (the leg itself unchanged).
- Tests under `addons/intelligence/tests/` for SPEC-ADDON-121.
- `docs/addons/intelligence.md`.
- The core's `addons/intelligence` pointer and `docs/specs/INDEX.md`.
- No protected path.

## Invariants

I1. A fetch whose lookup succeeded, for a YouTube `.loft` with no candidates, writes the same `clip` rows, tile files and `clip_indexed` that the storyboard leg would write for that answer, before its stages run, and makes no lookup besides its own.

I2. A fetch of a reference that already has candidates does no storyboard work.

I3. A failure of the storyboard step in a fetch, of any kind, writes no candidate, changes no frame flag, no failure count and no YouTube result, and the fetch's download and stages still run.

I5. The storyboard step of a fetch and the storyboard leg never write the same file's candidates or tiles at the same time.

I4. The storyboard leg run by indexing and by a CLIP regenerate behaves as before.

## Revises

SPEC-ADDON-117 I3. No download starts while another fetch runs, while the queue is paused, at priority -10 while a native `frame_scan` or `frame_ocr` task is queued or processing, while the drive's `index` feature is off, when no stage is wanted, when the model or engine a wanted stage needs is unavailable, or when the disk guard fails; a fetch that ends before its stages ran changes nothing but the duration (from NULL after a lookup), the loft source, the failure count, the flags closed for source `other`, the wanted stages closed at the cap, and the candidates, tile files and `clip_indexed` its storyboard step wrote (SPEC-ADDON-121).

## Checked, no action

- **Candidates from the download** (the native method): rejected by the human; the
  storyboard tile (320×180) is about what CLIP sees anyway and is denser in time.
- **A bulk CLIP regenerate of the 6,887 references**: it would make a second lookup
  per reference on top of the fetch's, adding to the refusal risk SPEC-ADDON-119
  guards against.
- **References already fetched without candidates**: very few in production (one at
  the time of writing); a CLIP regenerate fills them.
