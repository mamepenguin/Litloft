# PR #343 — the captions choice the viewer made

One round, on `5ee95b9d`. `invariants.md` is the list it was briefed with,
including the revision the round prompted.

- **r1**: bucket A empty. The three Chromium claims the design rests on all
  hold, and the task ordering behind `addtrack` was measured 210/210 under 20x
  CPU throttling rather than taken on trust. Of four findings, one was this
  change's own prose — a docstring that said every mutation handler replaces
  the file wholesale, which would lead a reader to revert the fix — and the
  other three were pre-existing: the preference is not enforced under the
  browser's own controls, `rename` drops the subtitle list the way `save` used
  to (truthful today, wrong the day the backend carries sidecars along), and
  the switch is blind for one media-clock tick, which is the residue of the
  reported symptom. All three are in `known-issues.md`.
- The one hole it names in the tests: substituting `change` for `addtrack` in
  `useReassertCaptions` kills nothing, though it would make the hook fight the
  subtitle track picker. Left untested deliberately.

Read the code for what the player does now. This file quotes it as it stood at
the SHA the round reviewed.
