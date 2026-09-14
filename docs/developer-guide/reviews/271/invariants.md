# PR #271 invariants (R-0)

Approved by the supervisor before round 1, unchanged. Item 4 had no test before this PR (#268 r1 F3); this PR adds one.

1. No empty-folder empty state (Library folder, drive root in Library, folder
   under a tag filter) shows a New note button.
2. **Add files** in the empty state is offered exactly where it was before: on a
   write destination, and nowhere else.
3. Ctrl+N creates a file through core's `createFile` into the folder on screen —
   including the drive root in Library and the anchored folder during a folder
   tag filter — and does nothing in a special view, in search, under a drive-root
   tag filter, or with no folder path.
4. The tree pane's **New file here** still creates a file in the folder it was
   opened on.
5. In an empty folder on a write destination the **Add** menu is still offered,
   with the addon rows (knowledge's New note where its `editor` policy is on).
