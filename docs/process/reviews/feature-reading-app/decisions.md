# Decisions

decision:
ran_in_app: yes
at: ac5e6d3005b1a125011633025064d907a2ed98af
by: agent
evidence: >-
  Scratch stack (compose project litloft-r5-reading, port 3995, .r5/override.yml,
  scratch data/, generated drive "main": Books/Manga 8 PDF + 4 ZIP, Books/Tech 8 EPUB
  + 8 PDF, Books/Tech/Swift 4 EPUB, 6 loose books in Books, 10 extra one-book folders,
  Videos/Movies 30 clips + 3 images, Videos/ 4 clips, Videos/Series 2 clips). Profile
  "Reviewer" created through /settings; 12 books tagged through the API; 5 books left
  in progress and 4 finished through the progress API; 7 smart folders (tech tag,
  Books/Tech folder, no-match text, type:video, duration, negated path, Videos/Movies).
  Driven with Playwright/Chromium at 1440, 1024, 768 and 390 px on a mouse environment
  and once at 390 px with hover:none / pointer:coarse emulated through CDP. Screenshots
  in docs/process/reviews/feature-reading-app/shots/.

  (1) Sidebar: Home, Inbox, Library, Video, Reading, then the addon rows; Reading is
  the filled row on /apps/reading, /apps/reading?face=library and the reading shelf
  page, and is not filled on /apps/video, Video's Library, or the drive's Library.
  (2) Discover at every width draws Continue reading / Not read yet / New (Continue
  reading only with a profile; without one, Not read yet is the random all-books shelf
  and has no See all). Each shelf has See all inside the container. Cards are portrait:
  cover box 271x407 (2:3) at 1440 with the thumbnail cropped to fill, a PDF / EPUB /
  Archive badge, a two-line title and "<folder segment> · <time>" ("Books · 08/11",
  "Manga · 2 days ago"). Progress bars appear on the four Continue reading cards only
  (25/50/50/35%) and on no other card. Columns: 4 at 1440, 3 at 1024, 2 at 768, 2 at
  390; every card in a shelf has one width and one height (271x453 / 323x530 /
  362x589 / 173x306); document scrollWidth equals innerWidth at every width and no
  element has horizontal overflow. (3) Library chips are All, Tech, Manga, Extra 01-10
  (Books descended past; the six loose Books/ files have no chip and are under All,
  48 cards). Chip Tech narrows to 20 and leaves the chip set unchanged. Controls are
  Tag, State, Group None/By tag, Sort; State and the watch request are absent without
  a profile. Tag "tech" narrows to 3 inside Tech. State In progress -> 5, Finished -> 4.
  By tag draws swift 4, tech 4, manga 2, reading-list 2, favorite 1, research 1,
  scans 1, No tag 4 (last), each with See all. Sort Title reorders inside the shelves
  and See all carries sort=title (shelf page shows Sort: Title). Shelf titles: "New"
  from Discover's New See all, "All books" for by=all&key=all&from=library (opened by
  URL; Library's Group None draws no See all for it), "swift" for the tag shelf.
  (4) Reading Target menu: All books 48 then every usable smart folder, then Manage…;
  "Long books" (duration) and "Not manga" (negated path) are disabled with "This target
  cannot be used". Manage… opens a dialog with a search field and a checklist: all six
  folders, the two unusable ones disabled and unchecked, the four usable ones checked
  because nothing was saved. The first toggle (unchecking Tech folder) stores
  litloft.readingApp.targets.main = the three remaining usable ids; the menu and a
  reload then list exactly those three. Choosing Tech tag changes the scope to "main ·
  4 books"; choosing "Nothing here" shows "No books"; choosing "Clips only" shows
  "This target cannot be used". Video has the same menu, dialog, first toggle and
  reload behaviour, and picking "Only movies" changes 36 videos to 30. In Video,
  however, "Not manga" (negated operator) is enabled and selectable, and picking it
  leaves "main · 0 videos" with the listing's "No files" empty text. (5) Video Discover
  has See all on Recommended and New, 4/3/2/2 columns, See all inside the width and no
  sideways scrollbar. Video Library still classifies by Folder with shelves Movies
  (key Videos/Movies, 30), Videos (key Videos/, 4) and Series (key Videos/Series, 2),
  and its Sort Title reaches See all ("Movies", Sort: Title). (6) Reading empty
  states: a smart folder with no match gives "No books"; a target whose kinds leave
  the app's base empty gives "This target cannot be used". (7) At 390 px both faces
  work with the mouse and with touch emulation (tab switch, chip tap narrows 48 -> 20,
  Target/Group menus open). With hover:none / pointer:coarse the chip row is
  nowrap, overflow-x auto, 1062 px of chips in a 358 px frame and scrollLeft moves
  0 -> 400, while the page has no horizontal scrollbar; with the fine pointer at the
  same width the chips wrap in a 128 px (three-line) frame with vertical overflow.
pending: >-
  The iOS app on a device (PROJECT.md agent_cannot_verify), audio/video quality, and
  playback over the real home LAN. The touch check used Chromium's coarse-pointer media
  emulation, not a physical device.
