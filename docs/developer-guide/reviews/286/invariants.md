# P2 R-0 invariants — All notes browser (core b94e2bb8, knowledge ae250f1)

1. `GET /api/drives/{drive}/folder-counts?type=text` returns, for each exact `folder_path` holding at least one active (not trashed, not missing) text file, that folder and the count of such files directly in it; nothing else; ordered by path; the drive root as `""`.
2. `GET /api/drives/{drive}/tags?type=text` counts only active text files per tag and omits tags with none; without `type` the response is unchanged from before this change.
3. Both endpoints enforce drive access exactly like the file listing: a locked or unknown drive is 404, never a partial answer.
4. The All notes list requests exactly the scope in the URL: `type=text`, the sort's field and order, `path` only when `folder` is present (an empty `folder` is the drive root, exact, not recursive), `tag` and `search` only when set.
5. Every rail link and menu choice changes one part of the scope and keeps the others; choosing the selected tag again removes it; defaults are omitted from the URL.
6. Rows are grouped by age only when sorted by update, each note appearing once; inside a folder rows show the note's tags instead of its folder.
7. A failure loading folder counts or tags leaves the list working; a failure loading the list leaves the rail.
8. The landing (`q=` without `view=all`, and no params) behaves as before this change.

Revised during round 3 by the user (F-9): **8b.** With a folder chosen, each rail
tag count equals the number of notes that choosing the tag lists in that folder
(notes directly in it); the chosen tag can always be taken off. It does not
cover an active search.
