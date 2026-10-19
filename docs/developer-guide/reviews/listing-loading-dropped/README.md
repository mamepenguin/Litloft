# Listing loading states: measured, and dropped

Three attempts at making a folder listing's loading state look like its loaded
state. None shipped. The files here are the rounds that measured them, kept so
nobody builds the same thing again from the same reasoning.

## What was tried, and what it cost

A skeleton in place of the listing's spinner, and a frame for the addon page
routes while their code loads. Both were built and measured in the running app
(150 ms latency, 4x CPU throttling, CLS per navigation):

| navigation | develop | with the listing skeleton |
|---|---|---|
| home → Library (desktop) | 0.069 | 0.135 |
| Library → folder (desktop) | 0.022 | 0.051 |
| home → folder (mobile) | 0.097 | 0.186 |
| Ask → Library (mobile) | 0.139 | 0.506 |
| Notes → Ask (desktop) | 0.001 | 0.147 (the addon frame) |

A placeholder is a claim about what is coming. The core cannot know a
listing's shape — how many folder cards sit above the files, whether the
thumbnails justify, how many lines a title takes — or an addon page's own
frame, so the placeholder is replaced rather than filled, and the replacement
moves more than the spinner it saved. An addon knows its own page; that
skeleton belongs in the addon.

The same work made the file view draw at once from the list's copy of the
file (#324) and pointed cards at the file's own page (#325). Those held,
because the card already had the data.

## The toolbar hold, and why three rounds were not enough

Separately: view, sort and filter vanish while a listing is in flight, because
an unanswered listing and an empty one look the same to the bar. Three
mechanisms were tried inside `FolderToolbar` — show the controls while
`loading`; hold what the last answered listing showed; hold the decision that
was rendered rather than the counts behind it. Each round's reviewer found the
next one's hole, and the user-visible symptom never changed: moving from a
listing that hides Play (Liked, search, a tag) to a folder that has media
shows Play before the folder answers.

The reason is in `FolderBrowser`'s own comment at the item count: `reset()`
lives in an effect, so the render where the subject changes carries the new
subject's identity and the old subject's data. Only the screen knows when a
subject has become trustworthy — it already keeps `countedSubject` / `trusted`
for exactly this. A hold keyed on the bar's own props is at the wrong altitude.

Dropped by the user after round 3. If the flicker is worth fixing later, the
place to start is that existing screen-level state, not a fourth mechanism in
the bar.

- **r1** on `6920c69c`, **r2** on `88fe4cb7`, **r3** on `da746aae` — the
  branch was `feat/listing-skeletons`, never merged. `invariants.md` carries
  the list each round was briefed with and both revisions.
