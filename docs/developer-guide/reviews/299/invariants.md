# R-0 invariants: core fix/known-issues-frontend-small
1. A failed inline rename still shows its error message on the same drive until the timer clears it (the fix clears it on drive change, not immediately).
2. A successful rename's behaviour (listing update, no error) is unchanged.
3. The search modal on drive X never shows recent terms recorded on drive Y (drive boundary), and still shows drive X's own recent terms.
4. Recording a search term still persists it for the drive it was made on.
5. Every surface that names Recently Viewed uses one icon, and every surface that names Recently Added uses one icon (sidebar, Home, the ?view=recent / ?view=recent-added empty states); the two icons differ. (revised after round 1, F2)
6. Properties panel shows a translated label (en and ja) for every origin value the backend can emit; no raw message key is rendered.
7. Removing a recent term in the search modal removes it for the current drive only. (added after round 1)
