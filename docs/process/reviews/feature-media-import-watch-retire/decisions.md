# Decisions

decision:
ran_in_app: yes
at: 8d30efb1ab47f35240bb457307ee4a5ca060efb4
by: agent
evidence: |
  Scratch stack: compose project litloft-r5-mi, LITLOFT_PORT=3994, started from this tree with
  `-f docker-compose.yml -f .r5/override.yml` (the override mounts .r5/drives.json, .r5/data, the scratch
  passwords.json `[]` and .r5/drives), `./setup-addons.sh` first, then `down` at the end. media_import
  submodule at 105dfed. Two scratch drives, r5a and r5b, both empty at the start. Headless Chromium from
  the frontend's Playwright at 1280x900 and 375x812, driven only through the UI. Subscriptions were added
  on the page with Advanced -> backfill: Computerphile (feed, 35), Numberphile (feed, 35), 3Blue1Brown
  (regular, 4); 74 imports, 0 failed. List and detail values below were read from what the page drew;
  the JSON dumps and driver scripts are under .r5/ (mi-*.mjs, out/*.json).

  1. Media Import page, /drive/r5a/addons/media_import (shots/1280-01/02/03, 375-01/02/03/06).
     Holding the subscriptions read showed only the header and the loading line ("Loading drive..." /
     "ドライブを読み込み中..."). After it settled the page drew the add-a-source form, the subscription
     dashboard and Recent activity; no tab row at either width (`role=tab` count 0) and no 見る / 管理 /
     Watch / Manage tab label. On r5b (no subscription) the Composer was expanded; on r5a
     (3 subscriptions) it was collapsed. The display-mode field read exactly, ja:
     動画アプリでの表示 / ライブラリのみ / 購読の新着に表示 / よく見るソース, with hints
     取り込んで検索・Ask の対象にします。動画アプリの発見には並びません。 /
     新しい動画を、動画アプリの発見の「購読の新着」に新しい順で並べます。 /
     習慣的に見るチャンネルとして、動画アプリの発見の「よく見るソース」に並べます。; en:
     Show in the video app / Library only / Show in New from subscriptions / Regular source, with
     Imported and searchable, including Ask. Not shown on the video app's Discover. / New videos appear
     newest first in "New from subscriptions" on the video app's Discover. / A source you watch
     habitually, shown in "Regular sources" on the video app's Discover. The three radio values were
     library, feed, regular. No horizontal overflow at 375 (scrollWidth 375 = innerWidth).

  2. Discover, /drive/r5a/apps/video (shots/1280-07/09, 375-07/09). Shelves in order:
     よく見るソース / Regular sources, 購読の新着 / New from subscriptions, then 新着 / New. Every card of
     the two addon shelves had a second line: "3Blue1Brown · 2026年10月25日", "Numberphile · 2026年11月9日"
     (ja) and "3Blue1Brown · Oct 25, 2026", "Numberphile · Nov 9, 2026" (en). See all hrefs:
     /drive/r5a/apps/video/shelf?entry=media-import-regular and .../shelf?entry=media-import-feed; clicking
     each opened that page. The Recommended shelf was not drawn on this stack: the intelligence addon's
     service is not part of it and /api/addons/intelligence/... answered 502 (it is untouched by this
     change). The two shelves therefore sat directly above New, in the expected relative order.

  3. See all page (shots/1280-12..17, 375-12/13/15). Feed entry: title 購読の新着, breadcrumb 動画, no sort
     control (no button or select matching Sort/並び替え). 60 cards on arrival, one scroll to the end
     loaded 10 more: 70 cards, 70 distinct file links, 0 duplicates, counts then stayed at 70 and no
     loader, skeleton or Retry appeared. All 70 had a byline, and publish dates ran strictly downward
     from 2026年11月9日 to 2026年1月21日 (newest publish date first). Regular entry: title よく見るソース,
     2 cards (3Blue1Brown · 2026年10月25日, 2026年10月16日). Selecting the smart folder "Computerphile
     videos" (created through the search page's Save as Smart Folder) in the target picker reset the page
     to 35 cards, all Computerphile, 35 distinct, bylines 2026年11月5日 ... 2026年3月19日, target
     対象: Computerphile videos, counter "r5a · 35 本の動画". At 375 the feed page behaved the same
     (60 then 70, 70 distinct, no overflow) and its entry in See all opened from the phone Discover; the
     header title is ellipsised to "購読の…" at that width (full text in the h1 element).

  4. UI language (shots/1280-07/09, 375-07/09; .r5/mi-langcache.mjs). The same video read "Nov 9, 2026" on an
     en visit and "2026年11月9日" on a ja visit. Switching without a reload also held: Discover in ja ->
     Library face -> Discover (bylines still ja) -> profile settings -> English -> browser back ->
     Discover drew "Numberphile · Nov 9, 2026" with `<html lang="en">`, no stale-language date.

  5. Another drive (shots/1280-18/19, 375-18/19). From r5a's page, the drive switcher to r5b landed on r5b
     home; opening YouTube & Feeds there showed the loading line and then r5b's own state: Composer
     expanded, "No subscriptions yet", "No imports on this drive yet". Opening r5a again showed its 3
     subscriptions, 74 imported and the collapsed Composer.

  Failure case: with the subscriptions read answered 500, the page still drew the management view with the
  Composer expanded and no tabs (shots/1280-20).

  Browser console on these pages: repeated next-intl MISSING_MESSAGE for pageJump.aliases.app-video /
  app-reading / continue (en, and the same keys in ja on the first load) on every page, and 502s for
  /api/addons/intelligence/... because that addon was not running in this stack. Neither appeared as a
  visible error on the pages under test.
pending: |
  The position of the two shelves relative to the Recommended shelf could not be observed: the
  intelligence addon's service is not part of this scratch stack, so Recommended was absent (the two
  shelves were drawn between the top of Discover and New). A human with the full stack can confirm the
  three-shelf order.
  Nothing in PROJECT.md's agent_cannot_verify touches this change.
