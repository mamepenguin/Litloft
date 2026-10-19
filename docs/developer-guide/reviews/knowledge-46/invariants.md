# knowledge #46 (P3-5a, Notes landing) — invariants (R-0)

Approved by the supervisor (video-share-38) on 2026-09-14, with items 1 and 12 amended at approval.

1. The landing state (no `q`, no `view`) has one `PageHeader` and exactly one `<h1>`. New note sits in the `PageHeader` actions. Below the header, in order: Find a note, Continue writing (when present), Recent notes, the link to All notes, the clip form with recent clips, and last the connections graph.
2. Continue writing uses `getWatchHistory(drive, 6, "all", "text")`. When `useProfile().nickname` is empty it sends no request and renders nothing, heading included. When the request returns 0 rows it renders nothing, heading included.
3. Recent notes uses `getDriveFiles(drive, { type: "text", sort: "updated_at", order: "desc", limit: 8 })`. All notes (`view=all`) pages the same query, 30 per page. Find a note (`q=`) adds `search=q` to it. Both show `meta.total`, the count after filtering. Paging is a "show more" button, and `page` is not put in the URL.
4. A note row opens `buildCanonicalFileUrl(file, id)` with nothing else, so no `sort`, `nav` or `edit`; `.txt` and `.md` open in the existing viewer. Only New note opens `/files/{id}?edit=1` after creating.
5. Failure isolation: Continue writing, the note list (Recent notes, or the Find / All results) and clipping each own their fetch and catch. A note-list failure shows an error in that section only, while the clip form and recent clips (including the #44 lookup) still render and work, and vice versa.
6. On an empty drive (Recent notes `total` 0) the landing only explains that Markdown and text files in this drive appear here, and shows no unfinished-work wording. New note is still offered.
7. New note shares one dialog, create call and navigation with the Add-menu New note row. The logic lives in one place. The button is absent when the editor policy is off. Cancel creates nothing, and a create error stays in the dialog.
8. The `q=` and `view=all` states show only their results and a way back to the landing. Submitting Find pushes `q` into the URL with `router.push`, with no full reload.
9. The legacy `?edit={fileId}` redirect keeps working.
10. When the page is opened with `?prefill=`, the clip form is placed first on the landing (above Find a note) with the URL filled, and `autosubmit=1` still submits exactly once. Without `prefill`, the clip form sits below the note content.
11. The recent-clips lookup (#44), ClipNotifier / pendingClips and the clip duplicate prompt behave as before.
12. On the landing the only resting accent-filled control is New note, or none when the editor policy is off. Core's `accent-budget.test.tsx` stubs addon screens, so knowledge holds this with its own test using core's `accentFills` helper.

Decided out of scope for stage 3: a Capture basket entry on the landing (the basket stays in the header). The connections graph stays at the bottom here and moves to its own page in P3-5b.

## Revised by the supervisor after r1

- Added to 3: however many times and whenever Show more is pressed, each note is shown exactly once, and the button disappears once `total` is reached.
- Added to 10: returning to the same landing URL by in-page navigation or browser back/forward adds no clip submission and no duplicate prompt, and a clip that is being sent or was sent does not disappear from recent clips.
