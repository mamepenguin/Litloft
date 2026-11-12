# Decisions

decision:
ran_in_app: yes
at: 67fc97e0befb1abc55fbc9e71a7887fa9215e967
by: agent
evidence: |
  Scratch stack: compose project litloft-r5-recsee, LITLOFT_PORT=3996, started from this tree with
  `docker compose -p litloft-r5-recsee -f docker-compose.yml -f .r5/override.yml up -d --build`,
  after `./setup-addons.sh`, then `down` at the end. The override mounts this tree's scratch `data/`
  and `drives.json`, the scratch `passwords.json` (`[]`), `.r5/drive` at `/app/drives/r5drive`, and an
  intelligence service with its own `.r5/intelligence-data` and `.r5/search-config.yml` (no LLM,
  default features), `./data:/data:ro` and the `/dev/null:/data/.jwt_secret:ro` mask. The other stack
  on :3000 (project video_share) was never touched. UI language en (`<html lang="en">`).

  Drive r5drive: 40 videos of 2.5 s made with ffmpeg plus one PNG and one Markdown file (42 scanned).
  The Pickup feed was seeded, as instructed, by writing pickup_profile/pickup_item rows from inside
  the intelligence container into its search.db: viewer b984b062497e967e (sha256("r5tester")[:16]),
  drive r5drive, 42 rows in rank order (40 videos; the PNG at rank 4 and the Markdown at rank 18).
  A profile named r5tester was then set through /settings. Headless Chromium via the frontend's
  Playwright 1.58.2 at 1280x800 and 375x812. Screenshots are in
  docs/process/reviews/feature-recommended-see-all/shots/; driver scripts and JSON dumps under .r5/.

  1. Discover, /drive/r5drive/apps/video, 1280 (01-discover-desktop-1280.png). Two shelves were drawn:
     "Recommended" (3 cards: Video-11, Video-03, Video-28) with See all ->
     /drive/r5drive/apps/video/shelf?entry=pickup&slot=recommended, and "New" (3 cards) with See all ->
     /drive/r5drive/apps/video/shelf?by=all&key=all&from=discover (unchanged form). Discover made one
     GET /api/addons/intelligence/pickup?limit=60&offset=0 and one shelves call with
     type=video&watch=unwatched&ids=... (42 ids). No "Continue" shelf and no addon shelf was drawn on
     this stack, so only New's other-shelf link could be observed; it is the previous form.
     Phone 375 (03-discover-phone-375.png): same Recommended shelf with 4 cards and the same See all href.

  2. Followed Recommended's See all by clicking it (02-shelf-page-desktop-1280.png,
     04-shelf-page-phone-375.png). Desktop: URL .../shelf?entry=pickup&slot=recommended, h1
     "Recommended", no Sort button (only Collections and the Target menu in the header), 40 cards. The
     first three cards were Video-11, Video-03, Video-28 — the same ids, same order, as the shelf — and
     the page held 40 where the shelf held 3. All 40 cards were feed video ids. Phone: h1
     "Recommended", 40 cards, first four identical to the phone shelf's four in the same order.
     Marked the shelf's first card (Video-11, jNiYbwqVBBR2) watched by playing it to the end: the file
     page played 2.5/2.5 and GET /api/files/jNiYbwqVBBR2/progress returned {position: 2.5,
     duration: 2.5}. Reloaded Discover (06-discover-after-watch.png): Recommended drew
     Video-10, Video-12, Video-03 and did not contain Video-11; its See all still pointed at the same
     URL. The page then drew 39 cards (07-shelf-page-after-watch.png), again without Video-11.

  3. No smart folder existed in the drive (GET /api/drives/r5drive/smart-folders returned []), and the
     video app's Target menu offered only "All videos"; smart folders are not created from this screen,
     so the app's default target was the path checked. The PNG (vsecAc9CQPFA, feed rank 4) and the
     Markdown (Dap3Sa7CQZWs, feed rank 18) were drawn on neither the shelf nor the page, and every
     restrict call the page made was `.../shelves?by=all&key=all&type=video&watch=unwatched&ids=...`
     (one 42-id call), so the page kept the type=video filter and the unwatched condition.

  4. Cleared the profile through Settings ("Clear profile", then the confirmation button). Discover
     then drew only "New" (10-discover-no-profile.png), no Recommended. Opening
     .../shelf?entry=pickup&slot=recommended directly showed h1 "Recommended" with the no-files empty
     state ("No files" / "Drop files here to add them.") and 0 cards (11-recommended-no-profile.png).

  5. .../shelf?entry=does-not-exist&slot=recommended showed h1 "Recommended" and the same empty state
     (12-stale-entry.png). .../shelf?entry=pickup with no slot showed h1 "Video" and the same empty
     state (13-entry-no-slot.png).

  6. Stopped the intelligence container (`docker compose ... stop intelligence`) while the stack ran,
     then opened .../shelf?entry=pickup&slot=recommended: h1 "Recommended", a Retry button, 0 cards,
     and no "No files" empty state (08-page-intelligence-down.png). Started the container again, polled
     /health inside it until ready, and clicked Retry on the same page: 39 cards were drawn
     (09-page-after-retry.png) and the feed endpoint answered 200 with 42 ids.

  Browser console: repeated next-intl MISSING_MESSAGE for pageJump.aliases.app-video / app-reading /
  continue (en) on every page (present before the shelves were touched); 502s for
  /api/addons/intelligence/* while the container was stopped. The watched file's page also logged a
  502 for the not-installed knowledge addon and 404s for intelligence subtitles/transcript on a video
  with none; neither is on the changed path and no visible error appeared. No 4xx from the pages under
  test when the addon was up.
pending: |
  None for a human. Observation gap only: no Continue shelf and no addon shelf were drawn on this
  scratch stack, so their See all links could not be compared; New's See all was observed unchanged.
  Nothing in PROJECT.md's agent_cannot_verify touches this change.
