# R-0 invariants: knowledge fix/known-issues-web-clip
1. Every clip job that ends failed publishes exactly one `knowledge.clip.failed` event for its drive; a job that ends ready publishes no failed event. Exception: a job reclaimed after restart carries no drive and publishes nothing. (revised after round 1)
2. A clip event is delivered only to viewers with access to that drive (no leak for locked drives).
3. (Add menu dialog and bookmarklet) Submitting a URL whose earlier clip succeeded still shows the duplicate notice with "open existing" pointing at that successful note. (revised after round 1: surface named)
4. Submitting a URL whose only earlier clips failed never offers to open a failed placeholder, and creates a new clip.
5. A submit that fails is reported to the user exactly once, whether or not the dialog is still open; a submit that is accepted is not reported as failed.
6. Leaving the Notes landing view via back/forward closes its clip dialogs; returning does not reopen them; the first Escape afterwards behaves as on a page with no dialog.
7. No placeholder or note content already written by the user is deleted by these changes.
8. A URL with an earlier clip still fetching (not failed, not ready) still shows the duplicate notice. (added after round 1)
