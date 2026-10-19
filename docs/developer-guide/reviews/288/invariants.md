# P3 R-0 invariants — Related tab (core 2f878a44, knowledge 621b6c1)

1. For a file, "Links from" lists exactly its `markdown` outgoing counterparts,
   "Links to" exactly its `markdown` incoming counterparts, "Related files"
   exactly the counterparts of its other relations — each once, trashed ones
   never, missing ones marked.
2. Two notes linking each other each show the other under both "Links from" and
   "Links to".
3. The Related tab is listed iff the file has a relation or any addon publishes
   to `file-relations`; the Info tab shows no relations.
4. Every row opens the counterpart's canonical file URL.
5. A relations fetch failure leaves the other tabs working and lists no stale
   rows from a previous file.
6. `GET /api/files/{id}/relations` never returns a counterpart the caller cannot
   access or from another drive (unchanged access rules).
