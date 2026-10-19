# R-0 invariants: knowledge fix/known-issues-notes-display
1. A rail folder label keeps its last path segment visible; the full path is still exposed (title or accessible name).
2. (removed before round 1: item lives in core, not in this change)
3. Tag/folder filters remain drive-scoped (drive boundary).
4. The tag removal control's accessible name contains the visible tag text; pressing it clears the filter and leaves focus on an element inside the page content, not body.
5. A title the server returned for the query shows at least the matched characters marked, for every title the parent commit marked, and marks exactly the original characters when the lowercase form changes length or the title has astral characters. (revised after round 1: F1, F2)
6. Continue writing cards and rows render the same date for the same timestamp through the same formatter; the value shown is still the change date.
7. After each local midnight the page stays open, notes move out of Today without reload; unmounting leaves no timer or listener. (revised after round 1: F4)
8. Show more never renders one note id twice; Show more disappears exactly when the pages read cover the server total (no extra empty page, no early stop). (revised after round 1: F3)
9. The connections-graph link has >= 44px hit height on a coarse pointer at 390px, and its text size is unchanged (revised before round 1: coarse-pointer floor, same as core Button).
