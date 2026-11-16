spec: docs/specs/youtube-full-pipeline.md

## Revisions

Written by the author after the acceptance tests showed SPEC-ADDON-118 item 4 ("after a Visual Index action") and the revised SPEC-ADDON-089 I7 ("at no other time") disagree; the human approved this wording on 2026-11-16 ("その改訂、承認します").

SPEC-ADDON-089 I7. A `.loft` requests `clip-timestamps` on mount and on every `fileId` change and at no other time, and requests `visual-index` on mount, on every `fileId` change, after a Visual Index action (generate, retry), and on a WebSocket Visual Index event for the current file while its section is shown, and at no other time; it never applies a response for an earlier `fileId`, and takes every picture from the scene-tile route and none from the frame route. It draws the Visual Index part under the drawing rules of a native video. A tile that fails draws a blank tile-sized block, with its time label and click-to-seek.

Written by the author after R-5 (a plain ffmpeg read of the rendition URL was throttled by YouTube to about 15 KB/s after the first ~10 MB, so a long video could never finish within the time limit); the human chose to download with yt-dlp and approved this wording on 2026-11-16 ("承認します"). Normal flow step 3.6 follows it: the download is yt-dlp's, not ffmpeg's; the lookup (`yt-dlp -J`) still decides "no rendition" and the disk guard.

I2. A fetch downloads at most one rendition, video only, of height at most 720, over `https`, with yt-dlp (`-f "bv*[height<=720][protocol=https]"`, `--http-chunk-size 10M`, `--no-playlist`, `--ignore-config`, the stored URL, and no cookie, credential or account option) to the fetch directory only; it stops the download after 120 s without growth, when free space falls below 1 GiB, or at the time limit; the downloaded file is deleted when the fetch ends, whatever happened; at start the fetch directory is emptied before any fetch is queued; nothing is written next to the `.loft`; log lines and stored errors name only the file id.
