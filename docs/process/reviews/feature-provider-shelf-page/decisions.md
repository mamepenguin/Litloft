# Decisions

decision:
ran_in_app: yes
at: fb7e50d1b7673e653c41e8e109e5cfdb780a7031
by: agent
evidence: |
  Scratch stack: compose project litloft-r5-provshelf, LITLOFT_PORT=3995, started from this tree with
  `-f docker-compose.yml -f .r5/override.yml` (override mounts .r5/drives.json, .r5/data, the scratch
  passwords.json `[]` and .r5/drive), then `down` at the end. Drive shelf-r5 = 71 videos (Clips 30,
  Talks 20 + one 60 s clip, Misc 20), so the grid pages past 60. data/setup_completed was planted, so the
  first-run wizard did not run. Headless Chromium driven by the frontend's Playwright 1.58.2 at 1280x900
  and 375x812. UI language en (`<html lang="en">`). Screenshots in
  docs/process/reviews/feature-provider-shelf-page/shots/; the driver scripts and JSON dumps are under .r5/.

  1. Discover, /drive/shelf-r5/apps/video (desktop-01-discover.png, phone-01-discover.png). Before any
     watch history: one shelf, "New", 3 cards at 1280 (4 at 375), See all ->
     /drive/shelf-r5/apps/video/shelf?by=all&key=all&from=discover. After setting a profile through
     Settings (name r5viewer; desktop-14, phone-14) and watching 7 s of the 60 s clip
     (desktop-12-player-progress.png): "Continue" then "New" (desktop-13-discover-with-history.png,
     phone-13-discover-with-history.png). Continue See all -> ...?by=watch&key=continue&from=discover;
     clicking it opened the Continue page titled "Continue", sort button "Last opened", 1 card
     (desktop-15-continue-shelf.png). Clicking New's See all opened the shelf page titled "New" with the
     sort menu and 60 cards (the from=discover title, the same as before). No anchor on Discover carried
     entry= . No Media Import shelf was drawn: the catalogue lists media-import-regular and
     media-import-feed with href addons/media_import, and the addon's lanes return nothing on a fresh
     stack, so an addon shelf could not be observed.

  2. Grouping page, ?by=all&key=all (desktop-02/03, phone-02/03). Title "All videos", count "shelf-r5 -
     70 videos", breadcrumb "Video", sort button "Added (newest first)", grid of 60 cards (60 unique).
     Scrolling to the bottom loaded the second page: 70 cards, 70 unique, no skeleton left. Opening the
     sort menu listed "Added (newest first)", "Added (oldest first)", "Title", "Size"; choosing
     "Added (oldest first)" reordered the grid (first card Talks/long-talk -> Clips/clip-01) and the
     button read "Added (oldest first)", URL unchanged (desktop-16, phone-16). ?by=folder&key=Clips&
     from=library (desktop-04, phone-04): title "Clips", 30 cards, sort menu present.

  3. Provider page without a page provider.
     ?entry=media-import-feed&by=all&key=all&sort=oldest (desktop-05, phone-05) and
     ?entry=does-not-exist&by=folder&key=Clips&sort=oldest (desktop-06, phone-06) and a bare
     ?entry=media-import-feed: in every case header title "Video" (the app name), the no-files empty state
     ("No files" / "Drop files here to add them."), no sort button (only Collections and Target in the
     header), 0 cards, no skeleton. The request log for those loads had no /api/drives/.../shelves call and
     no media_import watch call; only the app-shell reads (smart-folders, drives, summary, tags, status)
     ran. The by/key/sort parameters changed nothing between the variants.

  4. Client navigation between the two modes.
     - Discover -> New See all (client navigation, URL ...shelf?by=all&key=all&from=discover), then browser
       back: Discover returned with its 3 cards; browser forward: the grouping page again, title "New",
       60 cards. A window marker set before the See all click was still present after back and forward, so
       both were client navigations (desktop-07-forward-grouping.png).
     - Full-load ?entry=media-import-feed, then the header breadcrumb "Video" (client), then New See all
       (client): the grouping page rendered with the sort menu and 60 cards (desktop-08, phone-08); the
       same window marker survived. Browser back twice returned to the entry page (empty state, title
       "Video") without a reload (desktop-09, phone-09).
     - Full-load ?by=all&key=all, then full-load ?entry=does-not-exist, then browser back: the grouping
       page rendered correctly, title "All videos", 60 cards (desktop-10, phone-10). That back was a fresh
       document (a marker set on the entry document was gone), not a same-document client navigation.

  Browser console on these pages: repeated next-intl MISSING_MESSAGE for pageJump.aliases.app-video /
  app-reading / continue (en) on every page of the app, and 502s for /api/addons/intelligence/... (the
  intelligence addon was not running in this scratch stack). Neither comes from the pages under test and
  neither appeared as a visible error.
pending: |
  The page-provider path itself is not reachable today: no installed addon exports slotPageProviders
  (media_import exports slotProviders only, per /api/addons/status), so these were not drivable and are
  left to the addon change's R-5: the entry label as title, the first page at limit 60, cursor paging and
  its end rules, Retry on a rejected first and later page, the waiting/absent/failed states, ignoring
  results of a superseded load, the byline on Discover and on the page, the byline in the stored-ids
  cache, and an addon shelf's See all pointing at ?entry= (the Media Import shelf was not drawn on this
  stack, so its href could not be seen either).
  Nothing in PROJECT.md's agent_cannot_verify touches this change.
