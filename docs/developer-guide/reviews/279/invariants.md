# P4-3: sidebar inline / overlay layout in a real browser — R-0 invariants (approved)

1. At 1280px with the sidebar open inline, the aside's right edge is at or left of the page content's left edge; no scrim.
2. At 375px with the sidebar open as overlay, the aside overlaps the content, a scrim covers the whole viewport, and the content has no left padding.
3. At exactly 1200px the inline-open page makes room; at 1199px it does not (CSS breakpoint). The script's narrow query uses the same boundary.
4. Closed, at either width, the aside is outside the viewport and the content has no left padding.
5. The fixture's class lists fail a parity test unless they match Sidebar / AppShell rendered in jsdom (inline open, overlay open, closed).
6. Green on the current code; red when `min-[1200px]:pl-60` is removed, `w-60` changes, the scrim is removed, or the boundary value changes.

## Revised by the supervisor after r1

7. At 375px with the sidebar open as overlay, a point inside the aside hit-tests to the aside and a point outside it hits the scrim.

Recorded with r1 F4 (B): the parity test's boundary case is what keeps the spec's boundary, read from the fixture, tied to `SIDEBAR_INLINE_MIN_WIDTH`; it is not redundant with `sidebarOverlayDismissal.test.tsx`.
