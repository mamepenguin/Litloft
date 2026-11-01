# Decisions

decision:
ran_in_app: yes
at: f279eac48a20e8adf7158e4fe0751a39d33743c4
by: agent
evidence: Compose project litloft-r5h on port 3180 with temporary data and drive directories, headless Chromium through Playwright (the Chrome extension was not connected), desktop 1440x900 and mobile 390x844. Fixtures were generated with pillow-heif in the backend container; no real phone HEIC was available. Addons present: cloud-sync, media_import, intelligence (frontend only, needed for the build), photo_diary (temporary clone). Screenshots are under /private/tmp/claude-502/-Users-libre-Sources-video-share/3cc43a00-a217-40bc-aeb6-704b58d12aea/scratchpad/r5h/shots.
  (1) Existing photo, on pre-fix exif.py bind-mounted over the image: legacy.heic scanned with no file_exif row, a WARNING "EXIF extraction failed ... AttributeError" in the log, no Photo Info on its page (01-prefix-legacy-heic-no-exif.png). Added a like, favorite, tag and comment in the UI. Restarted on the fix: the startup scan created the row. A DB snapshot before and after was identical in files, tags, file_tags, watch_history, comments and file_versions; file_exif gained that row only.
  (2) Deleted that row, used Rescan in the folder menu: the row came back, the page shows date, camera, exposure and GPS, and the like, favorite, tag and comment are still there (02-legacy-row-deleted-no-exif.png, 04-legacy-after-rescan.png). The toast said "Rescan finished — nothing changed" (03-rescan-toast.png).
  (3) Upload through Add > Files of upload.heic and exif.jpg: DIFFERENCE from the brief. Neither got a file_exif row or a Photo Info section on upload; their pages requested /exif and got 404 (07-uploaded-before-rescan-upload_heic.png, 07-uploaded-before-rescan-exif_jpg.png). complete_upload in services/upload.py creates the row without calling extract_exif. On pre-fix exif.py a JPEG upload behaved the same (no row). After the next rescan both show full EXIF (09-upload_heic.png, 09-exif_jpg.png, 10-upload-heic-desktop.png, 10-upload-heic-mobile-sheet.png).
  (4) placed.heic copied into the drive, Rescan: toast "1 added, 0 recovered, 0 missing", the page shows full EXIF including southern latitude (08-rescan-with-placed.png, 09-placed_heic.png).
  (5) JPEG with EXIF: the same bytes read by pre-fix code (old_exif.jpg) and by the fix (exif.jpg) gave identical file_exif fields and the same UI (09-old_exif_jpg.png, 09-exif_jpg.png).
  (6) plain.jpg, plain.png, plain.heic without EXIF: no row, no Photo Info section, no page error, no visible error; the browser console logs the /exif 404. The extraction WARNING for plain.heic no longer occurs on the fix (09-plain_jpg.png, 09-plain_png.png, 09-plain_heic.png).
  (7) After all scans: 9 files, 0 missing, 0 trash; no Traceback in the backend log.
  (8) Photo Diary: upload.heic listed on March 15, 2024 and at its point near Tokyo; legacy.heic and placed.heic appear as points; the EXIF-less files count under "No capture date" 3 (14-diary-march-15.png, 15-diary-map.png, 16-diary-map-point-tokyo.png). The map needed software WebGL flags in headless Chromium.
pending: A HEIC from a real phone was not available; only pillow-heif output was exercised.
