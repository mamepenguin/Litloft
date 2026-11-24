# Spec review r1: docs/specs/frame-ocr-hit-place.md (SPEC-ADDON-136, SPEC-CORE-134, SPEC-CORE-135)

Reviewed at commit ab16d7aa6 (the crop rule was revised in 0bc388ee0 while the review ran).

1. Touch points: `t` is wired into find in `FileDetailContainer.tsx` (it already receives `initialTime`), not `FileDetailFullScreen.tsx` (collection surface, find disabled). Decided by: author.
2. The YouTube outline needs the media_import embed (`YouTubeEmbed.tsx` owns the full-screen wrapper and the iframe box); a core layer in `LoftPlayer` cannot show in full screen. Where does the layer live, and the `LoftEmbedProps` / `docs/ADDON-DEVELOPMENT.md` change. Decided by: human.
3. The mini player is the same player subtree (`MiniPlayerContainer` in `FilePreview.tsx`); "find does not run there" is false. Show or hide the outline there. Decided by: author.
4. Browser controls (`playerUi === "browser"`), iPhone native full screen and the YouTube-UI mode: a layer covers the controls or cannot show. Decided by: human.
5. The landing seek can be lost (controller not yet published) or overridden by the player's own `initialTime` seek to `floor(start)`, leaving `t < start`. Decided by: author.
6. Step 15 ("a retry does not apply") contradicts I6 ("the first hits answer"). Decided by: author.
7. The last segment ends at `last_time + 1.0`; after `ended` the outline stays. Decided by: author.
8. `highlight_terms` holds kana variants of equal length; the longest-earliest term may not occur in the segment, so find opens on no hits. Decided by: human.
9. The crop slot's loading state and stage transitions, and the time label in I4. Decided by: author.
10. `line_frame_url`'s `t` format is ambiguous (milliseconds vs 3 decimals). Decided by: author.
11. Revises: SPEC-CORE-040 I11 (screen-text link) and I18 (row picture is `frame_url`); whether SPEC-ADDON-075 I6 covers videos (`frame_size`). Decided by: author.
12. No design is saved in the repository; state the agreed look or that `.find-box` styles are reused unchanged. Decided by: human.
13. Step 5 does not say what happens when no folded term occurs in the joined text. Decided by: author.
14. What counts as a usable `frame_size` on the client. Decided by: author.
15. "One warning per file" in search: per request, per passage, or deduplicated. Decided by: author.
16. `image_query.py` builds the same `SearchPassage` schema; its passages gain null fields. Decided by: author.
17. I5 omits step 14's tie rule and the no-term case. Decided by: author.

Regression risks named: the row fallback chain and slot sizes (SPEC-CORE-040 I14, I18, I24); byte-identical links for other kinds; `?find=` alone; no re-render of the players at 4 Hz and no re-parenting of the iframe; pointer events to the gesture overlay and YouTube's UI; find answers unchanged; one extra DB read per keyword screen-text passage; idempotent migration; concurrent 1280-px ffmpeg extractions on cache misses.

TOTAL: 17 findings
