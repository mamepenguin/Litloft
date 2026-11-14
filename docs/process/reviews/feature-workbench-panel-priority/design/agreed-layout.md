# Agreed layout (human, 2026-11-14)

Chosen from three placements. The button sits at the trailing end of the workbench row,
before the `file-preview-actions` entries (here the quote action), and is drawn only
while a panel is shown.

```
┌──────────── player (smaller while on) ────────────┐
│                                                    │
└────────────────────────────────────────────────────┘
(Transcript)(Scenes)(Detailed summary)      [⇕] [Quote]
┌─ Detailed summary ──────── × ┐┌─ Transcript ──── × ┐
│                              ││                    │
│  (body grows)                ││                    │
│                              ││                    │
└──────────────────────────────┘└────────────────────┘
```

Checkable decisions:
- One icon-only button per page, in the row, after the panel toggles, before the preview actions.
- Not in each panel header.
- Not a text pill.
- While on, the player is capped at 30% of the visible height.
