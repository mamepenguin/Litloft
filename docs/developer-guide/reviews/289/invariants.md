# P4 R-0 invariants — Quick Note Save and open (core 59af18ae, knowledge 7be2e290)

1. Save and open sends the same create request Save would (drive, path, content,
   collision handling) and, only after it succeeds, navigates to that file's
   canonical URL with `edit=1`.
2. Save still never navigates; a failed request of either button navigates
   nowhere and keeps the typed text.
3. The remembered drive and folder are written only after a successful save,
   by either button.
4. `open({ drive, folder })` preselects that destination for that opening only;
   an inaccessible drive is never preselected; opening creates nothing.
5. A double activation (click twice, click plus Cmd+Enter, Save and Save and
   open together) creates at most one file.
6. The Notes page New note opens Quick Note with the drive and, on All notes with
   a folder chosen, that folder, and creates no file by itself.
7. The Quick Note panel has exactly one accent fill (Save) at rest.
8. Every Quick Note footer button keeps its label on one line inside the panel at every width (measured on the preview at 320/390/768/1440).

Added after round 1 by the supervisor:
9. Opening again while the panel is open changes nothing, including an unanswered discard confirmation.
10. Each opening's destination is decided only by that opening's own drive-list response.
