# Decisions

decision:
ran_in_app: not-applicable
at: e7cb8ce
by: agent
evidence: The spec (item 9) states that nothing a viewer sees changes: no text, control or ordering, and no UI reads the new data. The observable additions are two endpoints and a background request while playing, which the acceptance tests hold, including the real-browser test in frontend/e2e-components/played-ranges.spec.ts (a real <video> in Chromium played from 20 s for about 12 s through usePlaybackProgress; the intercepted request carried keepalive and ranges starting within 1 s of the start and totalling within 1.5 s of the distance played). The application was not started.
pending: After deployment, a human confirms through GET /api/files/{id}/played-segments that the stored seconds are within 3 seconds of what was played, for 60 seconds of each of: (1) the iOS shell in the foreground; (2) the iOS shell with the screen locked (background audio); (3) a YouTube embed at 1x; (4) a YouTube embed at 2x. All four are pending (agent_cannot_verify) and do not block the merge.

## Human decisions

- r2-mutation.md F2 (bucket C) and r2-deep-read.md F1: the spec states two rules that disagree. Normal flow step 4 continues a stretch across a pause, an interruption or a resume read when playback carries on within 1 second, and sets the end to the larger of the two positions. The state table and I3 say that time spent not eligible adds nothing. The implementation follows step 4, so up to 1 second can be counted across such a gap. The user accepts this 1-second deviation and keeps the code as it is (2026-11-01). The spec is unchanged.
