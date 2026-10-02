# R-0 invariants — measuring a YouTube embed's picture in the iOS shell

Awaiting the user's approval (2026-10-02). Branch `feat/ios-embed-video-size`,
stacked on #426.

## Touch points

- Contract: new shell → page `embed.size { videoId, width, height }`.
- Shell: `EmbedFrames` (the user script and its handler), `ShellBridge`,
  `ShellMessage`. Page: `lib/nativeBridge.ts`, new `lib/embedVideoSize.ts`;
  addon `YouTubeEmbed.tsx`.
- `design-decisions.md`: nothing in the drive boundary, file state or watch
  history is touched. Trust boundary: the shell's account of a frame
  (`EmbedFrames.videoId`) decides what is an embed.

## Invariants

1. A `.loft` full screen asks for landscape only when the shell has reported a
   size for that embed with `width > height`. A video that has not reported
   (every video before its first play), a portrait video and a square one ask
   for nothing.
2. A size is delivered to the page only for a frame the shell judges to be an
   embed by WebKit's account (not the main frame, provider scheme and host,
   `/embed/<id>` path). What the script says about where it runs is never used.
3. A reported size is delivered only if both numbers are finite, greater than
   zero and at most 16384; anything else is dropped, not clamped.
4. The page applies a size only to the embed whose `videoId` it names; another
   embed's message changes nothing.
5. The YouTube frame gains nothing: the script posts a size and nothing else,
   and the handler exists only in the shell's own content world.
6. A size report never opens or closes full screen, never posts
   `page.immersive`, and never touches playback state or watch progress.
7. With an older shell, no `embed.size` arrives and `.loft` behaves as in #426.
   With an older page, `embed.size` is ignored.

## Revisions

None yet.
