# Decisions

decision: r1 HUMAN_REVIEW_REQUIRED -> continue (human: "コンティニュー")
ran_in_app: yes
at: db3cd213798e2f7ecc1fc90f660e13837a604fb6
by: agent
evidence: Re-run after the ImageCanvas fix (db3cd2137, paintedId reset on file change). Stack built and started with `docker compose up -d --build` at db3cd2137 (no other Litloft stack running), driven in Chrome at http://localhost:3000, 1280x723 viewport, dark theme. Test pictures in test_images/r5-transparent/ (drive テスト画像). A requestAnimationFrame logger recorded, on every change, the file id of the <img>, the span's background-image (bg:<id> or nobg), the img opacity and whether the img was complete. Screenshots: /private/tmp/claude-502/-Users-libre-Sources-video-share/3ef377fd-2ae0-4059-a853-fd5a34d852dd/scratchpad/r5b/screenshot-*.jpg.
  1. Return to an earlier picture (the fixed path), small picture: opened Alpha from its card -> `bg:Alpha|0|complete` (179 ms) -> `bg|1` (190 ms) -> `nobg|1` (196 ms). Next to Icon -> `Icon|bg:Icon|0|loading` -> `Icon|nobg|1|complete`. Prev back to Alpha -> `Alpha|bg:Alpha|1|complete` then `Alpha|nobg|1|complete` 5 ms later. Alpha's thumbnail was painted under it again on return, then dropped. Screenshot-1792333528522-19.jpg (Alpha, no background, bg-bg-card around the circle).
  2. Same with big_rgba (4000x3000): `Big|nobg|1|complete` -> next to Logo white rgba (`bg:LogoWhite|0|loading` -> `nobg|1|complete`) -> prev back: `Big|bg:Big|0|loading` -> 81 ms `bg:Big|1|complete` -> 9 ms `nobg|1|complete`. Final span style.backgroundImage "" (computed none), outer box rgb(35,18,22) = bg-bg-card. Screenshot-1792333566865-20.jpg. On the big_rgba -> Logo white hop the logger saw one frame with no [data-image-canvas] in the DOM before the next file's canvas appeared (it did not on Alpha -> Icon or on either return hop).
  3. Earlier SPEC-CORE-007 observations, re-checked: opening noisy_big (12 MB) from its card logged `bg|0|loading` -> 23 ms `bg|1|complete` -> 92 ms `nobg|1|complete`. No frame had the background gone before the picture had loaded or while opacity was 0, in any of steps 1-3. The next file painted its own thumbnail (bg:<its id>) each time.
  4. SPEC-CORE-006 brief recheck: card grid of the folder (dark) shows the transparent regions of Alpha, Icon, Palette trns and Noisy big in the card colour; only Opaque is black (screenshot-1792333520116-18.jpg).
  Not exercised this run: light theme, justified grid, list view, migration and serving headers (covered at 262a16a29 and not touched by db3cd2137).
pending: none (no part of this change is under agent_cannot_verify)
