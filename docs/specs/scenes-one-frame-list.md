# Scenes shows one frame list again

SPEC-ID: SPEC-ADDON-129

Approval:

## Summary

SPEC-ADDON-124 put a 「標準」 / 「カット」 switch above the Scenes grid: 「標準」 drew the
CLIP candidate frames (ffmpeg scene detection, `select='gt(scene,0.3)'`, plus a 30 s
fill), and 「カット」 drew the change frames of the scene change scan (`clip_change`).
Measured afterwards, the two did not mean what the labels said:

- A change frame is a second whose picture differs from the *last kept change frame* by
  at least 16 of 256 hash bits, at least 10 s after it. In any video with motion that is
  true almost every time 10 s have passed, so the list is a 10 s grid with static
  stretches skipped, not the moments the picture cuts (production: an anime episode whose
  「カット」 tiles were 0:00, 0:10, 0:20, …).
- The candidate list is already the cut list. Over the 145 scanned videos of the local
  library (147,058 seconds), the difference between neighbouring seconds' hashes has two
  modes, 0–7 bits (still) and 120–128 bits (another picture); taking the seconds at 96
  bits or more as cuts, a median 96 % of candidate frames lie within 1.5 s of one, and
  the cuts number 1.39 times the candidates, the surplus being motion and flashes.
  ffmpeg's scene score reads every frame, so its times are also finer than a second.

So the switch offered "the cuts" against "every 10 s", under labels that said the
opposite, and recomputing cuts from the stored hashes would only duplicate 「標準」. This
removes the switch: the Scenes section draws the candidate list alone, as it did before
SPEC-ADDON-124, and `clip-timestamps` stops returning `changes`. The change frames
themselves stay: the Visual Index selection and a question about a video with no text
read them, and nothing here touches the scan or its rows.

## Required items

### 1. Normal flow

1. The Scenes section requests `GET /files/{file_id}/clip-timestamps` as it does today.
2. The addon answers `{file_id, drive, timestamps}` (no `changes`; the core's addon
   proxy adds `available: true` as it does today); the section draws the ruler ticks and
   the grid from `timestamps`.
3. No frame-list switch is drawn, whatever the file and whatever change frames it has.

### 2. Failure cases

Unchanged from before SPEC-ADDON-124: a failed or empty `clip-timestamps` answer is
handled as SPEC-ADDON-089 states. Nothing new can fail.

### 3. States

The section loses its frame-list mode: there is no 「標準」 / 「カット」 state, so no
reset rule on a file change, a re-fetch, collapse/expand or host hide/show. Every other
state is as before, except the ruler length of a section whose answer arrived with no
candidate frames (§7):

| State | `L` |
|---|---|
| Request in flight, or the request failed (no answer) | 0, as before: no time labels, `aria-valuemax` 0 |
| Answer arrived, `timestamps` empty, player duration finite and positive (`D`) | `D` |
| Answer arrived, `timestamps` empty, no such duration | 0 |
| Answer arrived with candidates | the candidate rule of SPEC-ADDON-089 I1, unchanged |

Transitions, all redrawn in place without a new request: the duration becoming known
moves `L` from 0 to `D`; a later duration change moves it to the new `D`; a duration
that stops being finite and positive returns `L` to 0; a re-fetch that brings candidates
moves to the candidate rule, and one that brings none moves back. Only the Visual Index
draws a section in the empty-answer states (a `.loft`); a native video with no candidate
frames is still not drawn.

### 4. Data read and written

- Read: `embeddings` rows with `embedding_type = 'clip'` for the file, as before
  SPEC-ADDON-124. The `clip_change` rows are no longer read by this route.
- Written: nothing. The scan, `video_frame_scans` and the `clip_change` /
  `vec_clip_change` rows are untouched.

### 5. External services

None. The route reads only the addon database.

### 6. Authorization

Unchanged: file access, drive from `X-Lit-Drive` (400 without it, 404 for a file not
indexed on that drive), enforced where it is today.

### 7. Effect on existing features

- The Visual Index selection (SPEC-ADDON-111), the scenes route (SPEC-ADDON-113) and
  the question about a video with no text (SPEC-ADDON-114) keep reading the change
  frames; this change does not reach them.
- The Scenes section's ruler length goes back to the candidate list (or the player's
  duration), with one addition: a section whose answer arrived with no candidate frames (a `.loft` whose
  Visual Index has something to show, such as a downloaded YouTube reference without
  storyboard tiles) takes `L` from the player's duration when that is a finite positive
  number, so its scene marks, playhead, click-to-seek and `aria-valuemax` work. Before
  SPEC-ADDON-124 that state had `L = 0`; SPEC-ADDON-124 took `L` from the change frames,
  which this change no longer reads. With no candidates and no usable duration, `L` stays
  0 as before. A native video with no candidate frames is still not drawn.
- The only caller of the removed `changes` field is the Scenes section's own frontend.

### 8. Error behavior

Unchanged; no new message, no new log line.

### 9. User-visible behavior

- The chip row 「標準 n」 / 「カット m」 ("Default n" / "Cuts m") and its group are gone
  in every placement, ja and en; the grid sits directly under the ruler labels with the
  gap it has without the switch.
- The header's bare number (when the section draws its own header) is the candidate
  list's length.
- A section whose answer has no candidate frames and whose player has a duration `D`
  draws the ruler as it does for any video of length `D`: the 0:00, end and interior time
  labels, the playhead at `min(position, D) / D`, the scene marks, hover and click. It has
  no ticks and no tiles, so the arrow keys and `Home`/`End` move nothing; `Enter` seeks
  the browse point, which hover and click set.
- The three message keys `scenesFramesShown`, `scenesFramesAll`, `scenesFramesCuts` are
  removed from the addon's `ja.json` and `en.json`.
- The header button's accessible name keeps its spacing ("Scenes 15"): it is not part
  of the switch and changes nothing on screen.
- `docs/user-guide/video.md` loses the sentence about **Default** and **Cuts**;
  `docs/addons/intelligence.md` says change frames stay out of the Scenes tiles and no
  longer describes a `changes` field or the switch.

### 10. Non-functional

One fewer database query per `clip-timestamps` request; no other limit is reached.

## Touch points

- addons/intelligence/app/schemas.py (`ClipTimestampsResponse` loses `changes`)
- addons/intelligence/app/routers/files.py (`get_clip_timestamps` stops reading
  `clip_change` rows)
- addons/intelligence/frontend/api.ts (`ClipTimestampsResponse.changes` removed)
- addons/intelligence/frontend/ScenesSection/ScenesSectionContainer.tsx (no change list,
  no mode)
- addons/intelligence/frontend/ScenesSection/ScenesSectionPresenter.tsx (no switch row)
- addons/intelligence/frontend/ScenesSection/scenesModel.ts (`ScenesMode`,
  `frameListFor` and `trackLength` removed; `rulerLength` over the candidates, unchanged;
  the container takes the player's duration as the length when the answer arrived with
  no candidates, and 0 while there is no answer)
- addons/intelligence/frontend/messages/en.json, ja.json (three keys removed)
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionChangePoints.test.tsx
  and addons/intelligence/tests/test_spec_addon_124_clip_change_list.py (deleted: they
  test the removed behavior). Each case in them that pins behavior this change keeps moves to
  the new test files below, or the commit that deletes it names the existing test that
  already pins it: a `.loft` with no candidates and no Visual Index is not drawn; a
  native video with no candidates is not drawn whatever change frames it has; a `.loft`
  tile whose picture fails keeps its time and seek and shows the empty block; a `.loft`
  draws its tiles from the scene-tile route; `L` is the candidates' last start plus the
  median gap when the duration is unknown; the 090 I9 tile-dot range; the 104 I3 region
  order
- New tests: addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionOneList.test.tsx
  (I1, I2, I4, I5 and the kept cases) and addons/intelligence/tests/test_spec_addon_129_clip_timestamps.py
  (I3, with the 400 without `X-Lit-Drive` and the 404 on a wrong drive). The existing
  e2e-components Scenes cases, which draw no switch, keep measuring the layout at 384 and
  390 px; no new e2e case
- frontend/e2e-components/fixtures/{app.tsx, scenesSection.tsx, scenesSectionData.ts},
  frontend/e2e-components/scenes-section.cases.ts, scenes-section.spec.ts,
  scenes-section-desktop.spec.ts (the change-frame arrangements and
  `scenesChangesCases` removed)
- docs/addons/intelligence.md, docs/user-guide/video.md
- docs/specs/INDEX.md (SPEC-ADDON-124 → superseded; SPEC-ADDON-129 row)
- addons/intelligence gitlink in core
- No protected path.

## Invariants

I1. The Scenes section never draws a frame-list switch: no element with the name
「表示するフレーム」 / "Frames shown", and no 「標準」/「カット」/"Default"/"Cuts" chip,
for a file with change frames, without them, or while loading.

I2. The section reads only `timestamps` from the `clip-timestamps` answer: an answer
that also carries a `changes` array draws the same ruler ticks, grid tiles, header bare
number and `aria-valuemax` as the same answer without it, and every drawn tile's time is
a `timestamps` `start`.

I3. The addon's `clip-timestamps` handler answers with exactly the keys `file_id`,
`drive` and `timestamps`, and `timestamps` is exactly the file's `clip` rows ascending, the same with
or without `clip_change` rows for the file.

I4. When the `clip-timestamps` answer has arrived with no candidate frames and the
player's duration `D` is finite and positive, the section drawn through its Visual Index
has `aria-valuemax` `round(D)`, draws each scene mark at `min(seek time, D) / D` of the
ruler's width and the playhead at `min(position, D) / D`, and a click at a fraction of
the ruler's width seeks to that fraction of `D`; while no answer has arrived, or with no
such duration, the ruler has `aria-valuemax` 0 and no time labels, as before
SPEC-ADDON-124.

I5. The three removed message keys exist in neither locale file of the addon, and no key
renders as its path in the Scenes section.

## Revises

SPEC-ADDON-089 I1. The ruler draws exactly one tick per `clip-timestamps` row, at
`min(start, L) / L` of its width, with `L` as §2 of docs/specs/scene-timeline.md defines
it, except that when the answer has arrived with no rows `L` is the player's duration
when that is a finite positive number (otherwise 0), and while no answer has arrived `L`
is 0. The grid shows the frames from `s = clamp(c × floor(i / c) − c, 0, max(0, n − R·c))`
to `s + R·c − 1`, or every frame when there are fewer than `R·c`. `c` is the column count
of docs/specs/scene-timeline-width.md I1, `R` the row count of
docs/specs/scene-rows-fill-height.md I1, and `i` is the last frame whose start is at or
before the point being looked at, or frame 0 before the first.

SPEC-ADDON-090 I9. When the policy is off, when the first `visual-index` request fails,
answers 404, or answers `eligible: false` or `available: false`, the section draws no
Visual Index part: no dot count, no progress, no marks, no tile dots, no scene card and
no actions. Whether a `.loft` is eligible is the `visual-index` answer's to say. The
timeline is otherwise unchanged. Otherwise every active-run scene is marked at its seek
time (`section_start`, or `start_time` when that is null), styled by its status as §9
says. A tile carries the dot exactly when a `succeeded` scene with `section_start` has
its seek time in the tile's range, from its frame's `start` up to the next frame's
`start`, the
first tile also taking a seek time before it, or a `succeeded` scene without
`section_start` has its `start_time` within 0.05 s of its frame's `start`. The scene card
shows the last succeeded, labelled scene whose seek time is at or before the point being
looked at (or the first such scene before all of them), with its seek time as its time
label, its `visible_text` and never its `transcript_excerpt`. Activating the card seeks to
that scene's seek time.

SPEC-ADDON-111 I1. Scene search, tag kNN, scene segments, similar files, concept tagging
and the Scenes grid tiles return the same results for a file before and after its frame
scan; no change-frame vector is ever in `vec_clip`.

SPEC-ADDON-104 I3. From top to bottom the section draws its header (when drawn), the
ruler with its labels, the grid, then the Visual Index placeholder or the scene card, the
stale note and the action row, in that order, with the gaps they have today. Nothing is
placed between the grid and the card.

## Checked, no action

- **Recomputing cuts from the stored per-second hashes** (neighbouring seconds differing
  by 96 bits or more): measured above, it duplicates the candidate list at a coarser time
  and adds motion and flashes, so a switch between the two would show nearly the same
  frames twice.
- **Keeping the switch with the change list renamed** (for example 「変化」): the list is
  a 10 s sample of moving stretches; next to the candidates it gives the viewer nothing
  they look for.
- **Changing the change-frame rule itself** (compare with the previous second): the rule
  feeds the Visual Index selection and the text-less video question, and changing it means
  re-scanning every video. Out of scope; the Visual Index may itself be redesigned or
  removed in a later spec.
- **Keeping `changes` in the route answer for a future caller**: no caller reads it once
  the switch is gone; a later need can add it back with its own spec.
- **The header's accessible-name spacing** ("Scenes 15") added with SPEC-ADDON-124: kept,
  it reads better and is invisible.
- **The design files and review records of SPEC-ADDON-124**
  (`docs/process/reviews/feature-scenes-change-points/`, `docs/specs/scenes-change-points.md`):
  kept as history; the spec is marked superseded in the ledger, not edited.
- **The 30 s fill frames in the candidate list are not cuts**: unchanged; the fill is what
  keeps a long still stretch reachable from the grid.
- **A test that the change frames are still written and read**: SPEC-ADDON-111,
  SPEC-ADDON-113 and SPEC-ADDON-114 already pin the scan and its readers, and this change
  reaches neither; a new invariant would restate theirs.
- **Change-frame pictures already in the frame cache** (`frames/{file_id}/{ms}.webp`
  written while 「カット」 was viewed): left where they are. Nothing requests them any
  more, they are small, and they go when the file's frames go, like any cached picture.
- **R-5**: the change removes a control; the check is that no switch appears and the grid
  matches the candidate list in a running app, at desktop and 390 px.
