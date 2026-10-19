# knowledge #47 (P3-5b, connections page) — invariants (R-0)

Approved by the supervisor (video-share-38) on 2026-09-14. Item 7 was added at approval, and the entry is always shown.

1. `/drive/{d}/addons/knowledge/connections` (`frontend/pages/connections.tsx`) draws `ConnectionsGraph` at full width. It has one `PageHeader` and exactly one `<h1>`, plus a link back to Notes.
2. The Notes landing no longer draws `ConnectionsGraph`. Its last item is one plain, unfilled link to the connections page, always shown. The `q=` and `view=all` states show no such link.
3. The graph's own behaviour is unchanged: fetching, navigation when a node is pressed, zoom, and the empty and failure states.
4. On the landing the only accent-filled control is still New note.
5. The entry link's target is built from the current drive with `encodeURIComponent`, and following it does not reload the page (`next/link`).
6. The counting detectors move 47 → 48 for the one new module.
7. While `/drive/{d}/addons/knowledge/connections` is open, only the Notes row is lit in the sidebar.

## Revised by the supervisor after r1

- 3 now reads: the graph's behaviour is unchanged except that it no longer opens and closes.
- 8. The connections page's body (the graph, or its empty or failure state) cannot be emptied by a single user action.
