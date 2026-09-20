# R-0 invariants — the folder toolbar while the listing loads

Approved by the user 2026-09-20.

1. While a listing has not answered, the toolbar shows the controls it will show once the files arrive: view, sort, filter, and Play's place.
2. Once the listing has answered and is empty and unfiltered, the arranging controls are hidden, as before.
3. The Play held in place while loading cannot start playback.
4. Play is enabled only once the listing is known to hold playable files.
5. The listing itself — folders, files, the empty state — is unchanged; only the toolbar row's contents differ while loading.

## Measured, and deliberately not in this change

The plan's Phase 2 also proposed a skeleton for the listing and a frame for the
addon page routes. Both were built and measured (150 ms latency, 4x CPU, CLS
per navigation) and both made the reflow worse, because the core cannot know
the listing's shape (folder cards, justified thumbnails, title line counts) or
an addon page's own frame:

| navigation | develop | with the listing skeleton | this change |
|---|---|---|---|
| home → Library (desktop) | 0.069 | 0.135 | 0.135 |
| Library → folder (desktop) | 0.022 | 0.051 | 0.022 |
| home → folder (mobile) | 0.097 | 0.186 | 0.097 |
| Ask → Library (mobile) | 0.139 | 0.506 | 0.139 |
| Notes → Ask (desktop) | 0.001 | 0.147 (the addon frame) | 0.001 |

The user decided to drop both. The remaining cost of this change is the
desktop home → Library path (0.069 → 0.135), accepted so that the controls
stop disappearing on every navigation.

## Revisions

After r1 (user decision, 2026-09-20), prompted by r1 F1/F2/F4: the toolbar no
longer shows controls because a listing is in flight. It **holds what it was
already showing** until the listing answers. Invariants 1–4 are replaced by:

1. While a listing is in flight, the bar shows what it was showing for the
   listing before it — no more, no less.
2. A first load shows nothing the bar has not already shown: a toolbar that
   has never seen a listing offers no arranging controls and no Play.
3. Once a listing answers, the bar reflects it: an empty unfiltered listing
   loses the arranging controls, a listing without media loses Play.
4. A search, special view or tag-filtered listing offers no Play at any
   point, in flight or answered.
5. (unchanged) The listing itself — folders, files, the empty state — is not
   affected; only the toolbar row differs while loading.
6. The wiring is held at the screen level: `FolderBrowser` hands the toolbar
   the same `loading` the listing uses, and a test fails if it stops.

After r2 (author, wording only, 2026-09-20), prompted by r2 N5: invariant 2
above describes a first load as offering no arranging controls. On a search or
a filtered listing that is not what the code does or has ever done — a filter
is what emptied the listing, so the controls that undo it stay. Read invariant
2 as covering plain folder and view listings only.
