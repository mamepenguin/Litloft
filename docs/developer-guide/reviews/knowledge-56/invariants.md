# R-0 invariants — knowledge feat/graph-focus-from-note (9104fcf)

1. The Related-tab link for a text/Markdown file points to `/drive/{encoded drive}/addons/knowledge/connections?focus={encoded fileId}`; non-text files still render no link.
2. Opening the page with `?focus=X` where X is a node in the graph starts in focus mode on X (banner names X, only nodes within depth 2 of X are drawn) and X is selected (detail card shown).
3. Opening with `?focus=X` where X is not a node, and the drive has nodes or orphans, draws the whole graph unfocused and shows the `focus.notInGraph` notice.
4. A drive with no nodes and no orphans shows only `emptyGraph`, never the notice, with or without `?focus`.
5. Without `?focus`, the page behaves exactly as before (no banner, no notice, full graph).
6. Resetting the focus (button or Escape) after arriving via `?focus` returns to the whole graph and does not re-apply the initial focus.
7. No request to the backend changes: one `GET /connections-graph` per mount, same drive header; the focus id never reaches the server.

## Revisions

- After R1 (approved by the user): 3 is reworded — the notice states the file is not in the graph, not that it has no connections (a truncated graph can omit a connected file).
- After R1 (approved by the user): 8. A `?focus` id from another drive, or one that does not exist, yields exactly the same page as a same-drive file that is not in the graph: same single request, same text.
- After R1 (approved by the user): 5 also covers an empty `?focus=` value.
