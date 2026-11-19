# Decisions

decision:
ran_in_app: yes
at: 4b3983f2a60f2b179dc6695c20ebfdf7464ff76d
by: agent
evidence: Run on 2026-11-19 against core 4b3983f2a60f2b179dc6695c20ebfdf7464ff76d plus the addons/intelligence submodule checked out at f8ceff3652d061d5b7d9c8fb0e46a71f9e4c84b5 (feature/pickup-coverage; core pointer not yet committed). Stack: http://video-share-pickup-coverage.localhost:3101 on the cloned .r5-stack data, images built 15:12 JST, after the HEAD commit. Inside the intelligence container PROFILE_VERSION=5 and RECORDING_START=2026-11-05. Drive 動画. History was seeded through POST /api/files/{id}/progress and /played-ranges with the X-Lit-Viewer header, plus one real playback in Chrome. Viewers: r5pb (seeds) and r5pa (skims only). Sweeps were triggered three times with the app's rescan, POST /api/drives/動画/scan. Each one logged "Received scan-complete webhook" in the intelligence container and then rewrote pickup_profile.computed_at and its checkpoint (read with a read-only sqlite connection inside the container): 06:16:30, 06:18:03 and 06:23:07 UTC. Feed reads were GET /api/addons/intelligence/pickup, paged with offset/limit until a short page.
 (1) Viewer r5pa: five videos, each with a known duration, position at 95 % of it and 12 s of played ranges. After the sweep the stored total was 0 and the feed was empty, so skimming then seeking to the end gave no seeds. Later r5pa played 0-400 s of QArgCESBH8bs (D 646). After the next sweep r5pa's feed had 230 items: its five skimmed videos were in it as candidates, and QArgCESBH8bs (now watched) was excluded.
 (2) Viewer r5pb: five videos played 60 % (ranges and position). After the sweep the feed held 236 items, 4 pages of 60/60/60/56, all unique, reaching 236 = total. None of the five seeds was in it.
 (3) Changes made with no sweep in between (computed_at unchanged at 06:16:30). Three videos were glanced, and all stayed in the feed at their rank:
   - QArgCESBH8bs: position 614 of 646 with only 12 s played;
   - iztxeITPKpOp: opened with an empty POST;
   - mvkN6ascoy7o (.loft): opened with an empty POST.
   Two videos crossed the half-coverage line:
   - -_vHVyy_NjBW: 300/591 covered, so it was watched and removed from the next read. Total went 236 -> 235, order was otherwise preserved, and pages stayed full.
   - 8OgMzz3OFORW: 205/415 covered stayed in. Replaying 0-205 again stayed in (segments counted once). Adding 205-210 removed it.
   Short video AlWSycNkuiHE (D 4.37): position 2.0 stayed, position 2.2 was removed.
   Like and delete on the same read path:
   - Liking QArgCESBH8bs removed it (233 -> 232), and unliking brought it back.
   - DELETE /progress on -_vHVyy_NjBW brought it back (234).
   - r5pa watching QArgCESBH8bs did not change r5pb's feed.
   In every read, pages were full and the pages reached exactly total. window=daily returned 12 ids with total 234.
 (4) After the second sweep the stored feed had 239 items:
   - Glanced QArg, iztx and mvkN were still candidates.
   - -_vHVyy_NjBW was back after its history was deleted.
   - Watched 8Og, AlW and the five seeds were absent.
   - watch_state and profile_history, read inside the container, list exactly the seven watched videos as r5pb's engagement-1 seeds. The glanced rows have engagement 0 and are not seeds.
 (5) Browser, Chrome, English, profile r5pb:
   - Drive home: a Pickup row with "See all (239)".
   - Pickup page: shows the en description, and its first cards are the glanced videos. Scrolling loaded offsets 0-200 at limit 40 and drew 239 unique cards.
   - Discover: has a Recommended shelf. Its restrict (GET /api/drives/動画/shelves?by=all&type=video&ids=...&per_shelf=60) carries no watch parameter on every full page load. The SPA revisit is in 7b.
   - Recommended See all page: 4 restricts of 60/60/60/59 ids, none with watch, and 239 cards including the glanced mvkN, QArg, iztx and -_vH, with none of the watched videos.
   - The Regular sources and New from subscriptions shelf restricts are unchanged; the diff touches only the recommended call.
 (6) After the sweep, r5pb covered QArgCESBH8bs 0-330 of 646 with no new sweep. The next feed read had total 238 without QArg. The See all page drew 238 cards without QArg. Discover's Recommended restrict on the next visit no longer listed QArg.
 (7) Real glance in Chrome: z4hItdQwJKeQ (1125 s) played about 14 s and was then paused. The player recorded position 15.2 / D 1124.9 and segments 0-3. The video stayed in the feed (238), and after the third sweep it was still a candidate: stored total 241, 5 pages 60/60/60/60/1, 241 unique.
 (7b) Rebuild of Recommended from stored ids (SPA revisit). With profile r5pa, Discover was left by clicking the sidebar's Home and then its Video link. On the revisit, a 12-id restrict of the stored Recommended ids (starting Alx1ShvKJ5ny) went out at the same moment as the pickup request and before its answer, with no watch parameter. The provider's 60-id restrict that followed also had no watch.
 (7c) More state transitions on r5pb:
   Changes with no sweep:
   - Dismissing glanced iztxeITPKpOp kept it in the feed.
   - Favouriting mvkN6ascoy7o removed it (241 -> 240), and unfavouriting brought it back.
   - 8OgMzz3OFORW re-reported with D=500 (coverage 210, so now glanced) and AlWSycNkuiHE saved at position 1.0 of 4.37 (short, below half) did not reappear at read time. The serving filter only removes ids, and neither id was in the stored feed.
   After a fourth scan-triggered sweep (computed_at 06:27:38): both 8Og and AlW were back as candidates, QArg stayed absent, and the total was 237 (4 pages 60/60/60/57, all unique).
 (8) Without a profile:
   - Discover had no Recommended shelf and made no pickup request, both before the profile was set and after it was cleared.
   - The drive home had no Pickup row, both before and after clearing. The home makes one pickup request and gets an empty answer.
 (9) pickup.description on the Pickup page:
   - en: "Videos you have not watched yet, drawn from what you have been watching."
   - ja: 「視聴履歴から見つけた、まだ観ていない動画です。」
   The language was restored to English afterwards.
 Observations, for the author:
   - Seen once, not reproduced. On the first full-page Discover load after setting profile r5pb, the Recommended restrict (60 ids starting mvkN6ascoy7o, no watch) returned 200 with all 60 ids accepted, yet no Recommended shelf was drawn during that visit. The page showed Continue, Regular sources, New from subscriptions and New. A reload drew it. SPEC-CORE-057 I8 leaves Recommended undrawn only when no provider yields an item.
     The same sequence repeated with r5pa did not reproduce it: no-profile Discover, then set the profile, then a full Discover load drew Recommended within 1.5 s.
     On the r5pb visit, page text read about 1 s after navigation listed the pickup request as still pending.
   - The Recommended See all page without a profile shows "No files / Drop files here to add them." rather than nothing.
 Screenshots (scratchpad, /private/tmp/claude-502/-Users-libre-Sources-video-share/690f5d4f-2a7f-4af4-b4fb-f57c4e293742/scratchpad/r5-shots/):
   - screenshot-1795069172806-0.jpg: Discover with no profile;
   - screenshot-1795069195322-2.jpg: home Pickup row;
   - screenshot-1795069196895-3.jpg: Pickup page;
   - screenshot-1795069264345-4.jpg: Discover Recommended;
   - screenshot-1795069402262-5.png: en description;
   - screenshot-1795069410672-6.png: ja description;
   - screenshot-1795069434578-7.jpg: See all with no profile.
 Not run: a re-reported smaller D making a glanced video watched (its mirror, a larger D, was run in 7c). Not exercised (cannot be produced by ordinary use):
   - legacy rows with last_played_at before 2026-11-05 (the API stamps now);
   - NaN, infinite or negative durations;
   - sweep or serving read failures;
   - the evaluate command.
pending: none (no agent_cannot_verify part is touched)
