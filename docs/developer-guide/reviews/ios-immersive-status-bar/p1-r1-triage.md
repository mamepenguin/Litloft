# Phase 1 r1 triage

Approved by the user 2026-09-26.

| # | Bucket | Action |
|---|---|---|
| F1 | A | Answer against the laid-out state; requests before a layout are answered once, for the last. |
| F2 | A | Landscape test: width and origin unchanged, request answered. |
| F3 | A | Exact answer count, with a forced layout before counting. |
| F4 | B | Black band untested; closed. |
| F5 | A | SPA navigation keeps immersive. |

R-0 item 10 added.

Expected survivors after the fix (want=live): removing the `setNeedsLayout` after SwiftUI's layout, and removing the `laidOutImmersive == immersive` check. With the current ordering SwiftUI lays the change out before the web view's next layout, so both only matter if that order flips.
