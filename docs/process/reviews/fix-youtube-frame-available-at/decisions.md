# Decisions

decision: human kept the description on the new 504 as an exception to SPEC-ADDON-076 I4, recorded here with no spec revision (2026-11-24)
ran_in_app: yes
at: 3058822f8ea71177e54aed3a0ebccc942bc1f05f (addons/intelligence 96b1d43)
by: agent
evidence: Stack from `r5_stack.py clone` + `up` on a CoW copy of the data (intelligence image contains `available_at` wait code, checked in container). Real network to YouTube. Drive header sent percent-encoded (X-Lit-Drive: %E5%8B%95%E7%94%BB; the raw UTF-8 header gave 403 "Drive not accessible", a client-side artifact, not the change).
  1. Frame route, GET /api/addons/intelligence/files/<id>/frame?t=N, all 200 image/webp, no cache entry before (first request per file/time):
     - kLe852pwBh6B t=37 200 9.7s; t=112 200 3.0s; t=151 200 0.8s
     - EKCONLkv6vZZ t=37 200 12.2s; t=112 200 7.9s; t=151 200 5.2s
     - X_DGFSRCk1CV t=600 200 10.6s; t=3000 200 1.8s
     - CLYviIMcAi8l t=20 200 3.7s
     Image sizes 2.7-9.4 KB. Intelligence log: 0 lines matching ffmpeg_failed / "youtube frame failed" / returncode for the whole run.
  2. Ask, POST /files/<id>/ask, question "What is shown on screen in this video, and what is it about?", files with no earlier frame requests:
     - q5AQyH2NguR8: log `frames_dropped: chosen=8 dropped=0 (file q5AQyH2NguR8)`; stream finished with `meta: image attached`, `done`; total 61.0s
     - fG8JOxB2acSX: log `frames_dropped: chosen=8 dropped=0 (file fG8JOxB2acSX)`; `meta: image attached`, `done`; total 75.8s
     The stream sends `: keepalive` from about 5s; the first answer_chunk time was not measured separately (curl time_starttransfer = 5.0s is the keepalive). Total time includes frame fetch plus answer generation. Answer text came back (Japanese summary with citations).
  3. No frame failed, so no failure class or lookup-to-failure time to record.
  Not done: browser screenshots (the check went through the same routes with curl; the waiting is invisible on screen). Stack stopped with `r5_stack.py down`.
pending: none from the agent. Not measured: wait time attributable to available_at alone (no log line for the wait), and time to first answer chunk in the browser.
author_resolutions:
  - F1 accept: measured on production, available_at minus lookup end over 8 random YouTube .loft files was -1.5 to 5.5 s, so a wait past the 15 s deadline did not occur (frequency 0); the Visual Index worker also prefers the scan's small cache entry (SPEC-ADDON-118 I8).
  - F2 accept, raised to the human: the new 504 keeps the description, which departs from the wording of SPEC-ADDON-076 I4; dropping it would make every retry pay a fresh wait. Score 1x5.
  - F3 accept: 1x5, below threshold.
  - F4 accept: 1x3, below threshold.
