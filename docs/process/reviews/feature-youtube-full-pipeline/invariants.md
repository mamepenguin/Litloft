spec: docs/specs/youtube-full-pipeline.md

## Revisions

Written by the author after the acceptance tests showed SPEC-ADDON-118 item 4 ("after a Visual Index action") and the revised SPEC-ADDON-089 I7 ("at no other time") disagree; the human approved this wording on 2026-11-16 ("その改訂、承認します").

SPEC-ADDON-089 I7. A `.loft` requests `clip-timestamps` on mount and on every `fileId` change and at no other time, and requests `visual-index` on mount, on every `fileId` change, after a Visual Index action (generate, retry), and on a WebSocket Visual Index event for the current file while its section is shown, and at no other time; it never applies a response for an earlier `fileId`, and takes every picture from the scene-tile route and none from the frame route. It draws the Visual Index part under the drawing rules of a native video. A tile that fails draws a blank tile-sized block, with its time label and click-to-seek.
