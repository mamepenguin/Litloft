# Decisions

decision: continue (human, 2026-11-06, r3). The human chose 「続ける：専用の受け口に作り直す」 — revert every change to `UploadZone`, and give the search page its own drop target for a one-image drop, so the folder pages' upload path is unchanged.

ran_in_app: yes
at: 5addec5e175a9da6b6efb158328603558dee23de
by: agent
evidence: |
  Environment: compose project litloft-r5-a4 on port 3994; intelligence built from
  addons/intelligence at the pin in this commit (69a7b64). The worktree's data/ is a
  symlink to the live checkout, so the stack used a scratch .r5/data for the core and a
  named Docker volume for the intelligence DB (model cache from the a3 checkout,
  read-only). drives.json is the scratch drive; passwords.json is []. No other stack was
  started, stopped or written. The first attempt put /intelligence-data on the .r5 bind
  mount; SQLite reported "database disk image is malformed"/"disk I/O error" while the
  indexer ran, and the image route answered 500/502. Moving /intelligence-data to a
  Docker volume and reindexing removed it; every result below is from the volume.
  Screenshots under shots/.

  1. Normal flow, modal (1440x900). The search modal's image button opened the picker;
  choosing inbox/slide-budget.png closed the modal and navigated to
  /drive/scratch/search?img=2a46d869aa37 (12 lowercase hex, no other parameter). The
  header showed the image chip (thumbnail, 「Image」/「画像」, ✕), the field was empty and
  the h1 was visually hidden. The answer rendered documents first, then pictures:
  "Documents with this text 1", the read text in 「」 (「予算の見直し会議メモ …」), a row
  linking to budget-review-memo.md with its stored text, and "Similar pictures 1" with
  the slide itself. Scope line: "Documents 1 · Pictures 1" (English UI locale). A second
  query with a frame from clip.mp4 gave "Similar pictures 1" and "Similar scenes in
  videos 1" (0:00–0:14, clip.mp4), so all three groups render and the order is the
  spec's. 03-image-query-documents.png, 04-image-query-scenes.png, 01/02.
  Timing: the first query during heavy indexing took 13.4 s; after an addon restart with
  cold process memory it took 10.7 s; warm queries took 0.47–2.55 s. All are inside the
  route's 28 s proxy timeout and the 30 s rewrite cut. 13.4 s is above the spec's "about
  10 s" guide only while the drive was still being indexed, not with idle models.

  2. Paste. A synthetic paste of one image with no text started a query
  (…?img=27b0dc24b029). A paste carrying "office text" and the same image left the page
  on /drive/scratch and started nothing. On the text results page, both the field's image
  button (…?img=3fb8dd08f10d) and a paste in the field (…?img=8e5014d03323) started
  queries. 14-results-field.png.

  3. Drop on the results page. With /drive/scratch/search?q=litloft, a drag of one image
  showed "Drop to search by this image" (07-drop-overlay.png); its drop went to
  …?img=739a59e2c9ee, not to the upload. A text-file drag showed "Drop files to upload"
  and did not start an image query. The image drop did not add a file to the drive.

  4. Phone (390x844). The modal's 「Search by image」 pill measured 44 px high and the
  image view's pill 44 px; document.scrollWidth equalled clientWidth (390), and the chip
  and field stayed inside the header. 05-modal-phone.png, 06-image-query-phone.png.

  5. Image query view. A drop of one image on the view started a new query (absent
  0123456789ab → e4618858ff09); a text-file drop left the URL unchanged; a paste in the
  field started one (…?img=208621d2bf25); ✕ on the chip opened /drive/scratch; Enter on
  "litloft" opened /drive/scratch/search?q=litloft with no other key; reloading the
  answered URL showed 「Choose the image again」 with the image button and the field.
  08-gone-reload.png.

  6. Failure and retry. With availability already granted in the tab, stopping the
  intelligence container and giving another image produced, in 1.0 s, "Couldn't search
  by this image" with Retry (10-failure-retry.png). A fresh tab while it was down showed
  no image button and a paste started nothing. After starting the addon, Retry answered
  with the documents and pictures groups (11-retry-answered.png).

  7. Unavailable policy. With drives.json addons.intelligence.search=false and the
  backend restarted, GET /api/addons/intelligence/search/by-image/available answered
  404 and a fresh modal had no image button (13-policy-off.png). Restored drives.json and
  the route answered 200 again.

  8. Privacy. After an answered query, localStorage was empty, sessionStorage held only
  the existing hv_list_snapshot, indexedDB.databases() was empty, and neither the query
  id nor the read text appeared in web storage. 12-storage-check.png.

  9. Docs. docs/user-guide/search.md's "Searching by an image" matches what was used:
  the three ways in, the three groups and their order, the image not being saved, the
  20 MB/50 MP limit, the documents group depending on readable text and Text in pictures,
  and no Smart Folder save. No mismatch found.

Second R-5 after the B-2/B-3 fix (5addec5), same scratch stack and drive; the first run
above used 77d5f83:

  1. Normal flow still works. The modal's slide-budget.png gave
  /drive/scratch/search?img=26be5cce042b, the chip and hidden h1, and "Documents with
  this text 1" then "Similar pictures 1"; the documents row links
  budget-review-memo.md. frame.png gave "Similar pictures 1" then "Similar scenes in
  videos 1" (clip.mp4, 0:00–0:14). r5b-01-documents.png, r5b-02-scenes.png.
  2. Text-query page. On /drive/scratch/search?q=litloft a text-file drag showed neither
  "Drop files to upload" nor "Drop to search by this image" (0 and 0) and its drop left
  the URL unchanged. A one-image drag showed "Drop to search by this image" and its drop
  went to ?img=36e59616fb2f. r5b-03-text-page.png.
  3. Availability transition. With the availability route delayed 1.5 s and answering
  200 {}, the <h1> node marked before it resolved was still connected and present after
  (no remount), window.scrollY was still 160, and the upload zone/image button had
  appeared. 16-b3-search-page.png.
  4. Several-file drag. A browser-level CDP drag of two image files
  (Input.dispatchDragEvent, dragOperationsMask: 1) reached drop: "Choose one image"
  appeared and the URL stayed /drive/scratch. 17-several-real-drag.png; the committed
  e2e-components/image-search-drag-desktop.spec.ts runs the same drag.
  5. View drops. On an absent image URL one image dropped on the view started a new query
  (0123456789ab → d8880ffaea47); a text-file drop left the URL unchanged.
  r5b-05-view-drop.png.
  6. Phone at 390x844: both pills measured 44 px high and document.scrollWidth equalled
  clientWidth (390). 05-modal-phone.png, 06-image-query-phone.png (refreshed).
  7. Reload of an answered image URL showed "Choose the image again" and the image
  button. r5b-07-gone.png.

pending: |
  - The iOS photo picker and camera on a real device (agent_cannot_verify); the picker's
    accept="image/*" was used in Chromium only.
  - HEIC/HEIF decode was not exercised: no HEIC sample was available and the test image's
    pillow-heif cannot encode one. The code registers the opener at import; the path is
    covered only by a skipped acceptance test.
  - The 20 MB and 50 MP refusals, the 20-character read gate, and scenes_partial were not
    produced in the running app; the first two are boundaries, the last needs a drive
    larger than the 4096-row scene cap (one drive here).
  - Text insertion from a paste carrying both text and an image is the browser's default
    action; a synthetic ClipboardEvent cannot show it, only that no image query started.
