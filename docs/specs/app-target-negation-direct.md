# App targets send exclusions directly

SPEC-ID: SPEC-CORE-177
SPEC-ID: SPEC-ADDON-185

Approval:

## Summary

A Smart Collection chosen as the target of Video, Reading, Notes or Clips whose query holds
an exclusion (`-tag:`, `-type:`, `-path:`, `-in:`, `-is:`) or a `has:` / `-has:` token, and
no free text, is requested directly: every request the app sends carries the exclusions as
the listing's own keys (`exclude_tag`, `exclude_type`, `exclude_folder`,
`exclude_collection`, `favorite=false`, `liked=false`, `has_tag`, `has_collection`), as
`tag:` or `path:` are carried today. The member path, where the browser first reads every
listing page of the Smart Collection and then sends the members' ids with every request,
stays only for a query with free text, and for a query the app cannot express directly for
another reason (`duration:` in Reading, Notes and Clips). This replaces the decision of
SPEC-CORE-172 (sending step 9, 2026-11-23) that every query with a new token goes through
the member path. Measured on the production drive `main` with the Smart Collection 全般
(`-path:レシピ`, 3,752 files): each visit to an app read 8 listing pages of 500, about
3.1 MB, one after another before the first card could show, and then sent 3,752 ids with
every request; a direct target sends one listing request per view, as no target does. The
listing, shelves and tag-count endpoints already accept every key used here (SPEC-CORE-172
I2), so no backend change is needed. For the owner using the apps on a phone.

## Required items

### 1. Normal flow

1. The viewer chooses a Smart Collection as an app's target, or opens the app with it saved
   or named in `?target=`.
2. The app resolves the target (`resolveVideoTarget` for Video, `resolveAppTarget` for
   Reading, Notes and Clips). For a query with no free text and no `modified:`, the new
   tokens become listing keys:
   - `-tag:a` → `exclude_tag` (each value, as written);
   - `-type:k` → `exclude_type` (each value, as written; see step 3);
   - `-path:A` → `exclude_folder` (each value, as the parser normalised it, as `path:`);
   - `-in:x` → `exclude_collection` (each name, without classifying it, as
     `evaluateSmartCollection` sends it);
   - `-is:favorite` → `favorite: false`, `-is:liked` → `liked: false`;
   - `has:tag` / `-has:tag` → `has_tag: true` / `false`, and the same for `collection` with
     `has_collection`.
   The keys the target carries today (`search`, `tag`, `folder`, `collection`, `favorite`,
   `liked`, `size`, and `duration` in Video) are unchanged.
3. Kinds: the request's `type` is the app's base kinds intersected with the query's
   positive kinds, as today, less every base kind that an excluded kind holds (`kindHolds`,
   so `-type:document` holds text, PDF and EPUB). `exclude_type` is sent as well, with the
   excluded kinds as written, so a row whose `file_type` disagrees with its mime or suffix
   is dropped exactly as the member evaluation drops it (the backend applies
   `NOT _kind_predicate(k)`). When no base kind is left, the target is empty: usable,
   nothing is requested, and every face shows its empty state, as for a Smart Collection
   limited to images today.
4. A query that `hasImpossibleConditions` reports impossible (`tag:a -tag:a`,
   `is:favorite -is:favorite`, `has:tag -has:tag`, `path:A -path:A` and the others it lists)
   is an empty target in the same way.
5. Every request the app sends under the target carries these keys, because each one is
   built by spreading the target's params: Video's count, Discover shelves and its restrict
   calls (on Discover and on the provider See all page), Library listings, groups, folder
   chips and tag filter, and the See all page; Reading's faces and shelf page; Notes'
   listings, tag shelves, counts and rail folder counts (`folder-counts`); Clips' count,
   shelves, grid and tag lists. `AppTargetParams` and `VideoTargetParams` gain the eight
   keys, so a site that spreads the params carries them. The face's own conditions are added to them as today (a folder chip replaces the
   target's `folder` with folders inside it and leaves `exclude_folder` as it is; a tag
   filter adds to `tag`).
6. Member path: `resolveMemberTarget(folder, baseKinds, options?)` returns a member target
   only when the query has free text, or when it holds a new token and a `duration:` and
   the caller does not take `duration` directly. `options.directDuration` (default `false`)
   says it does; `resolveVideoMemberTarget` passes `true`, and Reading's call and the
   knowledge addon's two calls (`useNotesTarget.ts`) keep their current two arguments, so
   no addon code changes. `modified:` stays refused on both paths, as today.
7. `resolveAppTarget` drops its `hasNegatedOperator` refusal and accepts the new tokens as
   step 2 states. The spellings it caught that the parser does not negate (`-size:`,
   `-duration:`, `!tag:` and the like) are free text to the parser, so such a query is a
   member target, which is decided before the direct resolver, as today. Called on its
   own for such a query, `resolveAppTarget` returns what it returns for any free text
   today: usable, with the text in `search`. `resolveVideoTarget` drops its `hasNewToken`
   refusal in the same way.
8. Usability: every place that decides whether a Smart Collection can be chosen (the Target
   menu, Manage…, `?target=`, Home shortcuts) keeps today's expression, direct usable or
   member non-null, so a target is never listed usable and then resolved to the default.

### 2. Failure cases

- A listing request fails: each face shows today's load failure for a direct target, with
  its retry. The member path's "evaluation failed" state no longer occurs for a direct
  target, since there is no evaluation.
- The Smart Collection list fails to load, or the saved id names a Smart Collection that is
  gone: unchanged (the default target is in force and the saved id is kept).
- A `-in:` name that only a Smart Collection carries: sent as `exclude_collection`, which
  names no collection and excludes nothing, exactly as the member evaluation sends it today
  (SPEC-CORE-172 sending step 8). The search page refuses such a query; saving it is
  refused, so only a query saved before SPEC-CORE-172 can hold it.
- A value the listing rejects (422): cannot be produced, since the parser leaves as text
  every value the core would reject (SPEC-CORE-172 I10), and a query with text is a member
  target.

### 3. States

A Smart Collection target is in exactly one of:

- **direct**: no free text, no `modified:`, and every part the app can express. Requests
  are sent at once with the target's keys. New: a query with a new token lands here.
- **direct, empty**: as direct, but no base kind is left or the query is impossible.
  Nothing is requested.
- **member**: free text, or a new token together with a part only the member path can
  express. Evaluating → ready (requests carry `file_ids`) / failed (retry) / too large
  (この対象は使えません in Video and Reading; Notes and Clips keep their current fallback).
  Unchanged from today.
- **unusable**: `modified:`, or a part neither path can express. Listed disabled. Unchanged.

A target moves between these only when its query or the chosen target changes.

### 4. Data read and written

- Read: the Smart Collection list (`GET /api/drives/{drive}/smart-folders`), and the
  listing, shelves, tag-count and folder-count endpoints with more keys than before.
- Written: nothing new. The saved target id in `localStorage` and the Discover cache are
  written as today; a direct target with new tokens now uses the Discover cache, which a
  member target never does (its key includes every param, so a different exclusion is a
  different entry).

### 5. External services

None. The intelligence addon's providers are called with the same restrict callback, which
now carries the target's keys instead of `file_ids`.

### 6. Authorization

Unchanged. The listing endpoints apply drive access as today; the target's keys only
narrow.

### 7. Effect on existing features

- Smart Collections with neither free text nor a new token: unchanged requests and
  usability.
- Smart Collections with free text: unchanged (member path).
- Smart Collections with a new token and no free text: requested directly. They were
  usable up to 10,000 members; now they are usable at any size, except one that also holds
  `duration:` in Reading, Notes and Clips (member path, step 6). The files listed are the
  same as on the member path, since without free text the member evaluation is the listing
  with the same keys (SPEC-CORE-172 I2) and nothing else. In Reading, Notes and Clips one
  that also holds `duration:` stays a member target with its 10,000-member bound.
- The search page, the search window, Smart Collection play, Ask's scope, the
  `smart-collection-members` route and `in:` resolution: unchanged (they do not use the
  app target resolvers).
- Home shortcuts that open an app on a target: unchanged; they open the app, which
  resolves as above.
- The knowledge addon's Notes and Clips use the core's `resolveAppTarget` and
  `resolveMemberTarget`; their request builders spread the target's params and fix `type`
  and `origin` / `exclude_origin` last, so no addon code changes. Their acceptance tests
  are written in the addon repository under SPEC-ADDON-185 (tests only). The addon CI runs
  its frontend tests against core `develop`, so the order is: the core PR (resolvers, core
  tests, docs) merges first; then the addon PR with the tests; then a core PR that bumps
  the `addons/knowledge` pointer, after which SPEC-ADDON-185's citations count.
- `docs/ADDON-DEVELOPMENT.md` documents `resolveAppTarget`'s `unsupported_part` and
  member-target rules; it is updated to the new rules.

### 8. Error behavior

As today for each state (section 2). Nothing new is logged.

### 9. User-visible behavior

- A Smart Collection such as `-path:レシピ` shows its first cards as soon as one listing
  request answers, as with no target, instead of after every member page is read.
- Such a Smart Collection over 10,000 files, previously この対象は使えません in Video and
  Reading and disabled in Notes and Clips, is now usable, unless in Reading, Notes or Clips
  it also holds `duration:`.
- The tag filter of Video's Library and of Clips no longer offers a tag the target's own
  `tag:` names (the face leaves out `params.tag`), as for a target without a new token
  today; on the member path it was offered.
- Counts, lists, order and grouping are the same as the member path gave for the same
  query, up to its 10,000-member bound.
- `docs/user-guide/search.md`, `video.md` and `reading.md` are updated: what counts as
  search text (a word, or a spelling the parser does not read as an operator, such as
  `-size:` or `!tag:`; no longer a `-` condition), that only such a Smart Collection, or in
  Reading one with a length and an exclusion, is limited to 10,000 files, and that a
  Smart Collection filtering by length can be chosen in Reading when it also holds an
  exclusion or `has:`.

### 10. Non-functional

- One listing request per view under a direct target, as with no target; no request
  carries a `file_ids` body for it.
- No new endpoint, key, table or index.

## Touch points

- `frontend/src/lib/appTarget.ts`: `resolveAppTarget`, `AppTargetParams`, the
  `hasNegatedOperator` refusal.
- `frontend/src/lib/videoAppTarget.ts`: `resolveVideoTarget`, `VideoTargetParams`,
  `resolveVideoMemberTarget`.
- `frontend/src/lib/memberTarget.ts`: `resolveMemberTarget`.
- `frontend/src/lib/readingAppTarget.ts`: `resolveReadingMemberTarget`,
  `isReadingTargetUsable` (read through).
- `frontend/src/lib/searchQuery.ts`: `hasNewToken`, `hasImpossibleConditions`, `kindHolds`
  (read).
- `frontend/src/lib/listingRequest.ts`: `appendListingFilters` (read; already sends every
  key).
- `frontend/src/components/videoapp/useProviderShelfPage.ts`,
- `frontend/src/components/videoapp/useVideoApp.ts`,
  `frontend/src/components/videoapp/VideoAppHeader.tsx`,
  `frontend/src/components/videoapp/LibraryFace.tsx`,
  `frontend/src/components/videoapp/VideoShelfPage.tsx`,
  `frontend/src/components/videoapp/useDiscover.ts`,
  `frontend/src/components/videoapp/restrict.ts`,
  `frontend/src/components/videoapp/discoverCache.ts` (the params reach these).
- `frontend/src/components/readingapp/useReadingApp.ts`,
  `frontend/src/components/readingapp/LibraryFace.tsx`,
  `frontend/src/components/readingapp/ReadingShelfPage.tsx`,
  `frontend/src/components/readingapp/useDiscover.ts`.
- Existing tests that pin the behaviour this spec reverses, rewritten to the new
  invariants under `## Revises`: `frontend/src/lib/__tests__/appTarget.test.ts` (the
  UNUSABLE list for negated spellings) and `frontend/src/__tests__/appTargetNegation.test.tsx`
  (sending step 9 resolvers and the I12 / I17 member evaluation).
- `frontend/src/components/appshell/useMemberTarget.ts`,
  `frontend/src/components/appshell/TargetMenu.tsx`.
- `addons/knowledge/frontend/notesapp/useNotesTarget.ts`,
  `addons/knowledge/frontend/notesapp/listing.ts`,
  `addons/knowledge/frontend/library/useRailEntries.ts`,
  `addons/knowledge/frontend/clipsapp/requests.ts` (read; no product change planned),
  `addons/knowledge/frontend/clipsapp/__tests__/`, `addons/knowledge/frontend/__tests__/`
  and `addons/knowledge/frontend/library/__tests__/` (new acceptance tests,
  SPEC-ADDON-185).
- `addons/knowledge` submodule pointer.
- Endpoints, read with new keys: `GET /api/drives/{drive}/files`,
  `GET /api/drives/{drive}/shelves`, `GET /api/drives/{drive}/tag-counts`,
  `GET /api/drives/{drive}/folder-counts`.
- `docs/user-guide/search.md`, `docs/user-guide/video.md`, `docs/user-guide/reading.md`,
  `docs/ADDON-DEVELOPMENT.md`.

No protected path is edited.

## Invariants

I1. A Smart Collection target with neither free text nor a new token sends exactly today's requests and has today's usability in Video, Reading, Notes and Clips; one with free text is a member target exactly as today.
I2. A Smart Collection target whose query has no free text and no `modified:`, holds a new token, and holds no part the app's direct resolver refuses otherwise, is never a member target: the app reads no listing page to evaluate it and sends no `file_ids` body for it.
I3. Under such a direct target, every listing, shelves, tag-count and folder-count request the app sends, in every face, the See all and shelf pages, Video's count and restrict calls, and Notes' and Clips' requests, carries each of the query's exclusions and `has:` values as the key named in Normal flow step 2, alongside the face's own conditions.
I4. For a query with no free text and at most 10,000 matching files, the files an app lists under the direct target, and their count, equal the ids `evaluateSmartCollection` returns for the same query, drive and `file_type`, restricted to the app's base kinds (and, in Notes and Clips, to the app's own `origin` condition).
I5. A base kind held by an excluded kind is not in any request's `type`; when no base kind is left, or `hasImpossibleConditions` holds for the query, the target is usable, every face shows its empty state, and no listing, shelves, tag-count or folder-count request is sent.
I6. A Smart Collection with a new token and more than 10,000 matching files, no free text, and (in Reading, Notes and Clips) no `duration:` is usable in Video, Reading, Notes and Clips, and never shows この対象は使えません.
I7. In Reading, Notes and Clips a query with a new token and `duration:` and no free text stays a member target; a query with `modified:` stays unusable in every app.
I8. A folder chip or Library position narrows the target's `folder` and leaves its `exclude_folder` in every request; a tag filter adds to the target's `tag` and leaves its `exclude_tag`.
I9. Two direct targets of one drive that differ only in an exclusion or a `has:` value never read each other's Discover cache entries.
I10. A Smart Collection that the Target menu, Manage… or `?target=` treats as usable in an app is, once chosen, the app's target (direct or member), never resolved to the default target; one they treat as unusable is never applied.

## Revises

SPEC-CORE-172 I12. A Smart Collection evaluation and a member target built from a query with new tokens never list a file the search page for the same query does not list, except for a `-in:` name that only a Smart Collection carries, which the page refuses; a direct app target with a new token and no free text carries the new tokens as listing keys (SPEC-CORE-177).
SPEC-CORE-172 I17. A Smart Collection whose query holds a new token can be chosen as the target of Video, Reading, Notes and Clips, and Video accepts its `?target=` link; one with free text, or in Reading, Notes and Clips with `duration:`, is a member target, which above 10,000 members shows この対象は使えません in Video and Reading while Notes and Clips keep their current fallback; with no free text the evaluation reads no listing page after the first one whose `meta.total` exceeds 10,000.
SPEC-CORE-172 I26. A smart folder with a query part the app does not support as a direct target (`duration` in Reading, Notes and Clips) is chosen only through the member path, when its query has free text or a negated or `has:` token and no `modified:`; otherwise it cannot be chosen. A negated or `has:` token alone is supported as a direct target.
SPEC-CORE-172 I27. In Video and Reading, a member target sends no request under the target before its evaluation succeeds; every request after it carries `file_ids` = the evaluated members and `type` within the app's base kinds, and none of the target query's own conditions, while the face's and page's own conditions (folder chips, tag filter, watch state, URL folder and tag, `key`, `ids`) apply as today; no Discover cache entry is read or written; a failed evaluation replaces each face's or page's body with one retry control and a set over 10,000 with the この対象は使えません line, the header count is hidden, the Target control shows the Smart Collection's name, and neither falls back to the default target; a Smart Collection with no free text whose query the app can express directly, new tokens included, produces requests carrying the target, with today's requests for one with no new token (the apps also request the collection list on mount, SPEC-CORE-118).
SPEC-CORE-172 I30. `resolveReadingTarget` returns the same result as before for every folder with neither free text nor a negated or `has:` token, so the Reading app requests and lists the same books for those; a folder with free text, or with such a token and `duration:`, is a member target that lists its evaluated members of the base kinds and is always usable unless it holds `modified:`; a folder with such a token and neither is a direct target.
SPEC-CORE-099 I4. `resolveAppTarget` marks a folder unusable whenever its query has a duration part or a `modified:` part, whatever the base kinds; a negated or `has:` token is carried as a listing key (SPEC-CORE-177).
SPEC-CORE-099 I5. `resolveAppTarget` never returns a `type` outside the base kinds: a folder that names no kind gets every base kind not held by one of its excluded kinds, one whose kinds hold none of them, or whose excluded kinds hold all of them, is empty with no params, and an empty base list or one holding `document` throws instead of resolving.
SPEC-CORE-059 I12b. A smart folder with a query part the app does not support as a direct target (`duration` in Reading, Notes and Clips) is chosen only through the member path, when its query has free text or a negated or `has:` token and no `modified:`; otherwise it cannot be chosen. A negated or `has:` token alone is supported as a direct target.
SPEC-CORE-099 I6. `resolveReadingTarget` returns the same result as before for every folder with neither free text nor a negated or `has:` token, so the Reading app requests and lists the same books for those; a folder with free text, or with such a token and `duration:`, is a member target that lists its evaluated members of the base kinds and is always usable unless it holds `modified:`; a folder with such a token and neither is a direct target.
SPEC-CORE-117 I8. In Video and Reading, a member target sends no request under the target before its evaluation succeeds; every request after it carries `file_ids` = the evaluated members and `type` within the app's base kinds, and none of the target query's own conditions, while the face's and page's own conditions (folder chips, tag filter, watch state, URL folder and tag, `key`, `ids`) apply as today; no Discover cache entry is read or written; a failed evaluation replaces each face's or page's body with one retry control and a set over 10,000 with the この対象は使えません line, the header count is hidden, the Target control shows the Smart Collection's name, and neither falls back to the default target; a Smart Collection with no free text whose query the app can express directly, new tokens included, produces requests carrying the target, with today's requests for one with no new token (the apps also request the collection list on mount, SPEC-CORE-118).

## Checked, no action

- Making free-text Smart Collections cheaper (an ids-only evaluation, or a server-side
  evaluation through `smart-collection-members?ids=1`): a separate change. Only one
  production Smart Collection has free text.
- Caching a member evaluation across visits: not done; the member path is unchanged.
- The See all URL: it carries the face's conditions, not the target's; the shelf page
  resolves the target again from the saved id, so no key is added to the URL. The concern
  recorded in SPEC-CORE-172's `## Checked, no action` (six keys added to every See all URL)
  does not hold for that reason; the risk it named, a request that drops an exclusion, is
  I3.
- A `-in:` name that only a Smart Collection carries: excludes nothing on the direct path,
  as on the member path today (Failure cases).
- SPEC-CORE-165 I2 (a position with no folder inside the target sends nothing): it judges
  "inside" by the target's `folder`. A position inside an excluded folder (`-path:A`, at
  `A`) sends its requests and gets empty answers, so the files shown are right; the member
  path does the same today. Not changed.
- Backend: no change. Every key is accepted by the three endpoints (SPEC-CORE-172 I2).
- The knowledge addon: no product code change. Its acceptance tests for Notes and Clips
  (SPEC-ADDON-185) are added in the addon repository (Effect on existing features).
- An *Extension-point changes* entry in `docs/ADDON-DEVELOPMENT.md`: decided by the human
  at approval (the change widens `AppTargetParams` and narrows what `unsupported_part`
  means; the only addon caller spreads the params).
