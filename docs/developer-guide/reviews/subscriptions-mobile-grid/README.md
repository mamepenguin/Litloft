# The subscription grid at phone width

One round on the media_import change (its PR #26), recorded here because
the submodule pointer that ships it is a core commit. `invariants.md` is the
list the round was briefed with.

- **r1** on `f9ba8aa`: every invariant held when measured in Chromium, with
  the real `SubscriptionsDashboard` rendered inside `PageFrame`. At the parent
  the document was 784 px wide at 320 to 393 px. Below `sm`, the grid had no
  column template, so its implicit `auto` column grew to the width of the
  truncated title. The one finding is that nothing guards the fix: jsdom
  lays nothing out, and core's component layout harness leaves addon modules
  out on purpose. Closed as B.

Read the code for what the system does now. These files quote it as it stood
at the SHA the round reviewed.
