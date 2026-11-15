# Hide home and sidebar entries per drive

SPEC-ID: SPEC-CORE-114


## Summary

A drive's Home entry row, its sidebar navigation and the jump palette list the same apps: the
built-in Video and Reading apps and the addon entries placed as primary navigation. A drive
that does not use one of them still shows it. This change lets the operator list, in
`drives.json`, the entries to hide for that drive. The default hides nothing. The setting is
edited by hand. It is for the operator who set up the drive. It is not an access control: a
hidden entry's page still opens by its URL.

## Required items

### 1. Normal flow

1. The operator adds `"hidden_entries": ["video"]` to a drive entry in `drives.json` and
   restarts the backend (a save through the admin settings page applies at once, as it does
   for every key; see Checked, no action).
2. A viewer opens the drive. The browser calls `GET /api/drives/{drive}/entry-visibility`
   and receives `{ "hidden": ["video"] }`.
3. The Home entry row, the sidebar navigation and the jump palette omit each listed entry.
   The rest keep their order.

### 2. Failure cases

- The key is missing: nothing is hidden, and the output is identical to today's.
- The list names a key that matches no hideable entry (an unknown builtin, an addon that is
  not installed or not enabled for the drive, or `library` / `inbox`): the key is ignored.
  The config still loads, and the key stays in the file.
- The value is not a list of strings: the endpoint answers 500 `Configuration error` and logs
  the schema fragment server-side. The shared loader does not raise for this key (see I6), so
  every other route keeps working. The browser then shows every entry.
- The visibility request fails or times out: the browser shows every entry. No error message.
- The drive switches while a list is pending: the hideable entries of the previous drive are
  not shown for the new one (see I10).

### 3. States

For the drive on screen, the browser's visibility is one of `loading`, `loaded(list)` or
`failed`. `loading` and `loaded` are the only states that change during a page load. The
hideable entries wait in `loading`; Library, Inbox and the other non-hideable items render at
once. `failed` shows every entry.

### 4. Data read and written

- Read: `drives.json` through `config.load_drives()`, as `addon-policies` does.
- Written by this change: nothing. The admin settings page and the setup wizard already send
  each drive as a whole object, so an unknown key survives their save (verified against
  `frontend/src/app/admin/settings/DrivesSection.tsx` and `setup/SetupWizard.tsx`; I8 pins it).
- Not written: no database table, no localStorage, no cache file. The list is held in memory
  for the page load, keyed by drive name.

### 5. External services

None. The browser's request goes to the backend only.

### 6. Authorization

- The visibility endpoint runs `check_drive_access` with the viewer's unlocked groups, as
  `GET /api/drives/{drive}/addon-policies` does. A locked drive answers 404 and does not
  reveal the hidden list.
- Hiding is display only. Routes, pages and APIs of a hidden entry are unchanged and keep
  their existing checks.

### 7. Effect on existing features

- The addon policy endpoint and its contract are not changed.
- Items not in the hideable set (library, inbox, shortcuts, smart folders, collections,
  tags, the system section) are not affected.
- A hidden entry whose page is open: the entry is not listed, so no sidebar row is marked
  active (see 9).

### 8. Error behavior

- A malformed value: the endpoint logs the schema fragment and answers the generic
  `Configuration error`, as `addon-policies` does for a malformed addon value.
- Browser fetch failure: nothing is shown as an error; all entries appear once the failure
  is known.

### 9. User-visible behavior

- Hidden entries are absent from the Home entry row, the sidebar navigation rows and the
  jump palette. The remaining entries keep their order.
- A hidden entry's page, reached by URL or by a link, shows no active row in the sidebar.
- While the list is `loading`, the hideable entries are not shown in the Home row, the sidebar
  or the jump palette; they appear together when the list arrives. The three surfaces show the
  same set during that time.
- A failed or timed-out request is a failure in the browser's own sense: no timeout duration
  is set by this spec, and the result is the same as a failed request (I9).
- Default (no key): no visible change apart from the short wait before the hideable entries
  appear (see Required items 3 and the open question on the loading state).

### 10. Non-functional

- The list is short (at most the number of builtins and addon navigation keys).
- `load_drives()` caches the parsed file per process (`config._drives_cache`). The endpoint
  uses it and adds no cache of its own.

## Hideable entries

| Entry | Key | Shown on |
|---|---|---|
| Built-in Video app | `video` | Home row, sidebar, jump palette |
| Built-in Reading app | `reading` | Home row, sidebar, jump palette |
| Addon navigation entry with `placement: "primary"` | the key from `addonNavEntries` (`<addon>` or `<addon>/<path>`) | Home row, sidebar, jump palette |

Not hideable: Library (the only way to browse folders), Inbox (its count is shown when
nonzero), user shortcuts, smart folders, collections, tags, and the system section. Those are
user data or the core's own navigation. Keys for them are ignored.

## Touch points

- `backend/app/routers/drive_policies.py`: `GET /api/drives/{drive}/entry-visibility`, with
  its own validation of `hidden_entries` (the shared loader is not changed).
- `backend/app/schemas.py`: response model `{ hidden: string[] }`. The endpoint returns the
  configured strings as they are; the browser keeps only the keys it knows (I5).
- `backend/app/routers/admin_config.py`: read only. Its save path already keeps unknown keys;
  I8 pins it with a test.
- `frontend/src/hooks/` (new hook: in-memory per drive, fail-open, `loading` / `loaded` /
  `failed`).
- `frontend/src/components/DriveHome.tsx` (builds `addonEntries` and the row) and
  `components/home/HomeAppEntries.tsx` (renders the row; filtered list in, no empty container).
- `frontend/src/components/Sidebar.tsx` (computes `primaryAddons` and passes the filtered list
  down), `components/sidebar/SidebarLibrarySection.tsx` (renders `builtinApps`) and
  `components/sidebar/AddonNavRows.tsx`.
- `frontend/src/lib/pageJump.ts` and `components/search/useJumpDestinations.ts` (jump palette:
  built-in apps and `addonNavEntries`).
- `frontend/src/lib/builtinApps.ts` and `lib/addonNavigation.ts`: read only.
- `docs/reference/configuration.md` (the `drives.json` key), `docs/reference/api.md` (the
  endpoint), `docs/user-guide/` (one sentence on the Home page: a missing app entry is
  configured per drive by the operator, so a viewer does not take it for a bug).
- Protected paths: none. Checked against `docs/process/risk-and-human-review.md`.

## UI seams

The browser code is reached through these names, so the acceptance tests can drive the
behaviour without reading the implementation.

- `frontend/src/hooks/useEntryVisibility.ts` exports
  `useEntryVisibility(drive: string | null)`, returning `{ hidden: ReadonlySet<string> | null }`.
  `null` means only that the list is still loading for the drive on screen. A failed list is
  returned as an empty set, so every entry shows (I9). A result belongs to one drive only (I10).
- `HomeAppEntries` takes `hiddenKeys: ReadonlySet<string> | null`. `null` renders no hideable
  entry; a set removes the matching keys.
- `SidebarLibrarySection` and `AddonNavRows` take the same `hiddenKeys` prop. `Sidebar.tsx`
  passes it down and filters `primaryAddons` before the children receive it.
- `pageJump.ts` and `useJumpDestinations.ts` take the same set, with the same meaning of `null`
  (no hideable entry while loading), and omit matching built-in apps
  and addon entries.
- A hidden entry is not rendered, so it cannot carry an active style (I11).

## Invariants

I1. A drive with no `hidden_entries` key shows, once its visibility list has loaded, the same
    Home entry row, sidebar navigation and jump palette as before this change. While the list
    is loading, the hideable entries are not shown (see UI seams).
I2. A key listed in a drive's `hidden_entries` removes exactly that entry from that drive's
    Home entry row, sidebar navigation and jump palette, and from no other drive.
I3. Hiding an entry does not change its route: the page at its URL still renders, and its
    backend endpoints still answer with the same checks.
I4. `library` and `inbox` are never removed from a drive's Home or sidebar, whatever the list
    contains.
I5. A key that matches no hideable entry is ignored, does not fail the config load, and stays
    in `drives.json`.
I6. A `hidden_entries` value that is not a list of strings, including JSON `null`, does not fail
    `load_drives()`; the visibility endpoint answers 500 `Configuration error` and the browser
    shows every entry. Every other route that reads drives keeps working.
I7. The visibility endpoint answers 404 for a locked drive and never returns the list to a
    viewer who cannot open the drive.
I8. A save of `drives.json` through `PUT /api/admin/config/drives`, from the admin settings
    page or the setup wizard, keeps each drive's `hidden_entries` value unchanged.
I9. A failed or timed-out visibility request shows every entry, with no error message.
I10. When the drive changes, the hideable entries of the previous drive are never shown for
    the new one; they wait in `loading` until the new drive's list arrives.
I11. A hidden entry's page shows no active row in the sidebar, and the remaining rows keep
    their order.

## Checked, no action

- A UI control for hiding entries (pin-style or settings page). Considered and not chosen:
  the setting is changed rarely and belongs to the operator. The admin page can gain a
  checkbox later if hand-editing proves a burden.
- Hiding empty entries automatically. Rejected: the entry would appear and disappear as files
  change, and an empty entry is not proof of no use.
- Per-viewer hiding in localStorage. Rejected: it differs by device and is not shared with the
  drive's other users.
- Hiding smart folders or collections. They are user data; deleting them is the way to remove
  them.
- Hiding Library or Inbox. Library is the only way to browse folders; Inbox is shown only when
  it has items.
- A new watch on `drives.json`. A hand edit applies after a restart. A save through the admin
  settings page already clears `_drives_cache` (`admin_config.py`), so it applies at once;
  this change inherits that and adds nothing.
- Changing `load_drives()` to validate the new key. Rejected: the shared loader feeds about
  twenty call sites, and a bad optional key should not take the whole app down (I6).
