spec: docs/specs/player-workbench.md

## Revisions

I1. (r5-run2, human 2026-11-12) On a player file in a wide form, after the first measurement:
- The row under the player holds exactly one toggle per panel-list item that has rendered and has not answered `false`, in `priority` order, and no other toggle. An addon entry whose component has not rendered yet (its module is still loading, or failed to load) has no toggle, no shown panel and no tab; once rendered, silence means available.
- The `file-preview-actions` entries are at the row's trailing end. In the narrow forms they stay in the player box.
- Each toggle's `aria-pressed` is `true` exactly when its id is in `workbench-panels`.
- The row is not drawn when it has no toggle and no action.
- On the canonical page, chapters is never a toggle and is never drawn under the player.
- On the collection surface, chapters is a toggle whenever the file has chapters.

I7. (design re-check D-14, human 2026-11-12) Wherever `FileMetaBlock` draws a description:
- It occupies at most three lines until **Show more** is pressed.
- **Show more** appears only when the text needs more than three lines at the current width.
- A new mount or a file change collapses it, and saving an edit keeps its state.
- On the canonical page it is inside `#inspector-panel-info` and never under the player.
- On a player file, a timestamp link in it seeks the player.
- On the canonical page, the `loft-metadata` slot (a `.loft` file's channel, date and YouTube description) is drawn inside `#inspector-panel-info` under the title, in every form, and never between the player and the toggle row. On the collection surface, which has no Info tab, it stays under the player.
