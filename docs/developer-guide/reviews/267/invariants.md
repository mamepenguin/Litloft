# PR #267 invariants (R-0)

Approved by the supervisor before round 1, with 11 added at approval.

1. While the addon catalogue is loading, and when its request fails (fetch
   rejects), every Core row (Home, Library, the five views, the user's sections,
   Trash, Missing, Dashboard) is drawn and pressable, and no addon row and no
   Sources heading appears.
2. An addon row's position is set by its placement: `primary` right after
   Library and before the Views heading; `sources` after the five views, under
   the Sources heading, before the user's sections; `utility` unheaded after the
   user's sections, before Trash. Within a placement rows are in ascending
   priority (ties by addon name), and each addon appears once.
3. A row appears only for an addon with a valid `navigation` whose route core can
   build: no `navigation`, no top-level `href`, or a drive-scoped addon with no
   current drive gives no row; an addon absent from the catalogue (index policy
   false) gives no row. The old Addons heading and the href-only rows are gone.
4. The Sources heading appears exactly when at least one `sources` row does.
5. A row's label is the translation of its `i18n_key` when that resolves, else
   `navigation.label`; never `AddonMeta.label` and never the raw key.
6. A missing or unknown icon draws `Package`; the row still appears.
7. A row links only to the route core builds (`/drive/{drive}/addons/{name}`, or
   `/addons/{name}` for global); the manifest `href` value is never the link.
8. On an addon's route and on routes under it (`/drive/x/addons/knowledge/<slug>`)
   that addon's row alone is lit, and exactly one row in the sidebar is lit.
   `/drive/x/addons/knowledgebase` does not light knowledge. Core rows' lighting
   rules are unchanged (no prefix matching for Core rows).
9. Saved `sidebar:order:*`, `sidebar:sort:*` and `sidebar:section:*:collapsed`
   keep working; addon rows do not enter `availableSections`.
10. Pressing an addon row closes the sidebar only in overlay mode, like Core rows.
    The `sidebar-sections` slot is still rendered where it was.
11. Switching from drive A to drive B, the addon rows are decided by B's catalogue
    alone: a row shown on A (index false on B) does not remain for a single frame
    on B, and a late response for A does not overwrite B's rows.

## Revised by the supervisor after r1 (`267-r1.md`)

- **6, added:** every icon token listed in `docs/ADDON-DEVELOPMENT.md`
  (`download`, `message-circle-question`, `notebook-pen`, `package`, `rss`) is
  drawn with its own icon.
- Not added: rows on pages with no current drive (no bundled addon is global or
  both; F6 stays B), and keeping a cached drive's rows through a switch (F9 stays
  B, unmeasured, moved to the browser check).
