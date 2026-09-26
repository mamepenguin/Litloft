# Phase 4 — simulator measurement

iPhone 17 Pro simulator, iOS 26.5, the shell (contract version 4) built from
this branch against the frontend container rebuilt from it. Values are page
CSS px sampled on every animation frame. 2026-09-26.

| Surface | Result |
|---|---|
| Shell native video (instant) | Status bar hidden; picture to the top edge. `resize` to 874 and the header grows 56→118 in the same frame; pinned one frame later. Exit: unpinned and narrowed together; the slot is at 166 on screen before and after (104 + 62). |
| `.loft`, portrait | `resize` at t, pinned at t+22 ms, carry runs at ~16 ms per frame for 13 frames to the end, not cut short. Exit carry runs 200 ms in the widened page; unpinned at t, narrowed at t+25 ms; the slot stays at 166 on screen. YouTube's own title bar sits under the island (known issue). |
| `.loft`, landscape | No `resize`; width stays 750 (side safe areas not ignored, bands black). Pinned 38 ms after the press; carry ~280 ms. |
| Image gallery | Status bar hidden; top bar padding 74 px (62 + 12), its controls below the island. |
| PDF viewer | Status bar hidden; top bar padding 74 px. After close, viewport back to 812. |
| Archive image viewer | Not measured; same hold and top-bar class as the gallery. |

Invariants 5, 7, 8 (portrait and landscape, video), 9 and 10 observed to hold.
The answer's size equalled `clientWidth/Height` (402×874), so no entry waited
for the timeout.
