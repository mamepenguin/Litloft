# Invariants: .loft description expand (media_import #30)

## Touch points

- `addons/media_import/frontend/LoftDescription.tsx` (new)
- `addons/media_import/frontend/LoftMetadataPanel.tsx`
- `addons/media_import/frontend/LoftMetadataPanel.test.tsx`
- `addons/media_import/frontend/messages/{ja,en}.json`

## Invariants

1. A clipped (collapsed and overflowing) description is never selectable.
2. An expanded description, or one that fits in three lines, is selectable.
3. Tapping expanded text never collapses it; only "Show less" does.
4. A description that fits shows no toggle button.
5. Opening a different file starts collapsed.
6. The rest of the panel (channel, date, caption badge, transcription offer, refresh re-read) behaves as before.

Round 1 findings F1–F4 were test gaps only; closed by media_import `f7b202d`.
