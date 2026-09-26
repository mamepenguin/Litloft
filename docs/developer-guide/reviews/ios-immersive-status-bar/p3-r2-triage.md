# Phase 3 r2 triage

Approved by the user 2026-09-26. Trajectory: one guard moved, no state or branch added; the reviewer warns that another condition on the same `.catch` line would read as patching. The fix below is in the mount effect, not that line.

| # | Bucket | Action |
|---|---|---|
| F1 | A | `mountedRef` is set true on every mount, so StrictMode's remount does not leave it false. StrictMode tests in the shell and a browser. |
| F2 | A | Test: turning the phone during a manual "opening" keeps the entry manual. Test-only. |
| F3 | B | A second press during "opening" asks for element fullscreen again; nothing happens on an iPhone. |
| F4 | A | Test: a manual element fullscreen survives turning the phone and back. Test-only. |
| F5 | B, pre-existing | A refusal that lands after the session settled can reopen it; needs asynchronous rejection. |
| F6 | B, pre-existing | The module-level holder count carries a leaked hold into later tests. |
