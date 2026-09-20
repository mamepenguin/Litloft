# R-0 invariants — the YouTube frame while the player loads

Approved by the user 2026-09-20.

1. Opening a YouTube-backed file shows no black frame in the player region: the file's own thumbnail covers it until the player is ready, and it goes by fading rather than cutting.
2. The cover takes no clicks — whatever is under it (the YouTube UI, our own controls) stays reachable.
3. A file with no thumbnail looks as it did before: no broken-image mark, no cover left behind.
4. When the player reports an error, the cover goes, so that error's own screen is what the viewer sees.
5. A rebuilt player (a UI toggle, a different file) is covered again and uncovered again when it is ready.
6. Nothing else about the player changes: controls, ad handling, fullscreen, the gesture overlay.

## Measured (desktop, 150 ms latency, 4x CPU, brightness of the player region)

| | black frames |
|---|---|
| before | brightness 0 for ~400 ms |
| cover removed on ready | brightness 0 for ~80 ms — the gap between the removal and YouTube's poster |
| this change (cover fades) | no frame below 30; the lowest is 87, mid-fade |
