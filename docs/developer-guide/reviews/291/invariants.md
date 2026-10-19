# P5 R-0 invariants — scoped search (core e5ab7b79, knowledge b7d48a5)

1. With no scope registered or passed, ⌘K search sends exactly the requests it
   sends today and renders the same results.
2. A scoped search sends the filename request with the scope's `type`, sends no
   semantic request, and never lists a file of another kind.
3. Removing the scope (× or Backspace on an empty field) lists the unscoped
   results for the same query; Backspace in a non-empty field only edits text.
4. A registered scope applies only while its registrant is mounted.
5. Results stay within the current drive; the scope never changes the drive.
6. Enter on a highlighted row opens that file; the see-all link and Enter
   without a highlighted row go to `seeAllHref(query)` with the query encoded.
7. Esc closes the modal; no shortcut is registered twice; the one accent-fill
   rule holds.

Added after round 1 by the supervisor:
8. After the current drive changes while the modal is open, the chip, `type` filter, see-all and Enter all follow the current screen's registered scope and drive.
9. Clicking a scoped row opens that file.
10. The see-all link navigates in-app to the encoded href.
11. Removing the scope returns focus to the input.
