spec: docs/specs/player-workbench.md

## Revisions

I1. (r5-run2, human 2026-11-12) On a player file in a wide form, after the first measurement:
- The row under the player holds exactly one toggle per panel-list item that has rendered and has not answered `false`, in `priority` order, and no other toggle. An addon entry whose component has not rendered yet (its module is still loading, or failed to load) has no toggle, no shown panel and no tab; once rendered, silence means available.
- The `file-preview-actions` entries are at the row's trailing end. In the narrow forms they stay in the player box.
- Each toggle's `aria-pressed` is `true` exactly when its id is in `workbench-panels`.
- The row is not drawn when it has no toggle and no action.
- On the canonical page, chapters is never a toggle and is never drawn under the player.
- On the collection surface, chapters is a toggle whenever the file has chapters.
