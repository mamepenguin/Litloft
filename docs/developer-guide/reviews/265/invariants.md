# PR #265 invariants (R-0)

Approved by the supervisor before round 1, with two revisions folded in at approval
(required keys spelled out; pass-through of undeclared keys added to 1).

1. An addon with a valid `navigation` — registered through `manifest.json` or
   `ADDON_META` — appears in `GET /api/addons/status` with that `navigation`
   exactly as declared, **including keys inside the block the host does not
   validate**, with and without `?drive=`.
2. An addon with an invalid `navigation` has no `navigation` in its catalogue
   entry, while its other fields, its entries under `slots`, and its external
   proxy registration (`get_external_addons`) remain.
3. Invalid means any of: `placement` outside {primary, sources, utility} or
   missing; `label` missing, empty, or not a string; `priority` missing or not an
   integer (bool, float, string included); `i18n_key` present and not a string;
   `icon` present and not a string; `navigation` itself not an object (list,
   string, null). An invalid `i18n_key` or `icon` drops the whole block, not the
   key. None of these raises at startup or import.
4. One addon's invalid `navigation` neither removes nor changes another addon's
   `navigation`.
5. An addon that declares no `navigation` has no `navigation` key in its entry
   (not `null`, not `{}`).
6. `?drive=` behaves as before: an addon whose `index` policy is false is gone,
   `navigation` included; an unconfigured drive gets the empty catalogue; no
   `drive` returns everything. No new endpoint, and no new branch whose answer
   depends on lock state or credentials.
7. Keys outside `_FRONTEND_FIELDS` (e.g. `proxy`, `health_check`) still do not
   reach the response.

## Revised by the supervisor after r1 (`265-r1.md`)

- **2, added:** through the in-process path too, an invalid `navigation` does not
  make `register_in_process` raise, and that addon's `on_startup` still runs.
- **3, added:** "`placement` outside {primary, sources, utility}" includes values
  that are not strings — number, array, object, null.
