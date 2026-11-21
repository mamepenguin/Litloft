# FileGrid's app card menu opt-in

SPEC-ID: SPEC-CORE-169

Approval:

## Summary

Photo Diary draws its photos with the core `FileGrid`, whose cards already open the core
`FileContextMenu` on a right-click or a 500 ms press. Compared with the card menu of the
Video, Reading, Notes and Clips apps (SPEC-CORE-157 / SPEC-ADDON-164), a `FileGrid` card
differs in two ways. Its menu has no **Open in new tab** row, and its rows run on the next
frame instead of in the click (`immediateRows`). Its link does not set `user-select: none`,
so a long press can start a text selection on the title. Two things the apps have are
already true of `FileGrid` and need nothing: the iOS link preview is suppressed for every
card (`body` sets `-webkit-touch-callout: none` in `globals.css`, and the property is
inherited), and the click that ends a press that opened the menu is swallowed by the
menu's `DismissScrim` (`DismissScrim.test.tsx`, "swallows for the press that raised it").

This change adds one opt-in prop to `FileGrid`, `appCardMenu`, that gives its cards the
row, the in-click rows and `user-select: none`. It is off by default, so every current
`FileGrid` user is unchanged. Photo Diary turns it on for every grid it draws, under its own
spec SPEC-PD-026 (`addons/photo_diary/docs/specs/card-menu.md`). The user is the one person
who runs Litloft.

The human decided (2026-11-21):

- Photo Diary keeps re-reading its lists after a trash, rename or move (today's `onUpdate`
  → `onRefresh`). Taking cards out in place, as the apps do, is not part of this change.
- The opt-in is off by default. The core grids keep today's menu.

## Required items

### 1. Normal flow

1. A caller draws `FileGrid` with `appCardMenu`.
2. The viewer right-clicks a card, or presses one for 500 ms on a touch device. The menu
   opens as today.
3. The menu shows **Open in new tab** where `useFileMenuItems` already places it (after any
   `extraMenuItems` rows and their divider, before Download), then the rows the card offers
   today, in today's order. Every row runs in the click itself (`immediateRows`).
4. **Open in new tab** calls `window.open(fileLinkHref(file, sortQuery), "_blank")`, the
   href the card's link carries, and the menu closes. In a browser the page stays where it
   is. In the iOS app, which has no tabs, the row opens the file in place, as it already does
   for the apps' row (`docs/user-guide/ios-app.md`).
5. Every other row behaves as today, including `onUpdate` once after a successful trash,
   rename or move.

### 2. Failure cases

- The browser blocks the new tab: nothing opens and the menu closes, with no message, as for
  the apps' row. Running the row in the click keeps `window.open` inside the user gesture.
- Every other failure is today's (the menu's dialogs and toasts are unchanged).

### 3. States

None new: the menu is closed or open on one target, as today. The opt-in is a fixed prop,
not a state.

### 4. Data read and written

None: **Open in new tab** only reads the file id and the grid's `sortQuery` to build a URL.

### 5. External services

None: the row opens a URL in the browser and sends no request.

### 6. Authorization

None new: the new tab loads the file page, which applies the drive's access check as today.

### 7. Effect on existing features

- `FileGrid` callers: `components/folder/FolderContent.tsx`, `components/CollectionDetail.tsx`,
  `components/folder/RightPaneFolder.tsx`, `addons/intelligence/frontend/pages/pickup.tsx`
  (with `extraMenuItems`), `e2e-components/fixtures/justifiedHold.tsx`, and Photo Diary. None
  but Photo Diary passes `appCardMenu`.
- `FileCard` is also drawn directly by `CarouselSection.tsx` and `ContinueWatchingSection.tsx`;
  `JustifiedFileCell` only by `FileGrid`. Each card gains one boolean prop (a primitive, so the
  cards' `memo` still holds); the other callers do not pass it.
- `useContextMenu`, `useFileCardLink` and `DismissScrim` are used unchanged.
- With `selectable` the cards attach no menu handlers today, and that holds with the opt-in.
  `user-select: none` goes on the card's wrapper element whatever it is (a link, or the `div`
  that `selectable` or a navigation override gives). The opt-in with a navigation override
  (`CollectionDetail`) would offer a row that opens `fileLinkHref`; no caller combines them,
  and it is not a supported combination.

### 8. Error behavior

None new: the new row has no error path of its own; a blocked pop-up shows nothing, as for
the apps' row.

### 9. User-visible behavior

- The menu of a grid with the opt-in has **Open in new tab** (existing core string), and its
  rows act on the click that chooses them.
- A long press on such a card on a touch device opens the menu without selecting the title's
  text.
- On desktop, the title of such a card can no longer be selected with the mouse, the same
  trade SPEC-CORE-157 made for the app cards.

### 10. Non-functional

No new requests, no new strings; one CSS class and one menu row.

### PROJECT.md questions

- Drive boundary: unchanged.
- Addons: a generic `FileGrid` prop that names no addon. Photo Diary is not a core submodule,
  so its half lands in its own repository after this one merges (its CI runs against core
  `develop`), with no pointer bump.

## Touch points

- `frontend/src/components/FileGrid.tsx`: the `appCardMenu` prop; with it, `onOpenInNewTab`
  and `immediateRows` on the menu, and the flag to the cards.
- `frontend/src/components/FileCard.tsx`, `frontend/src/components/JustifiedFileCell.tsx`: a
  boolean prop that puts `select-none` (and `[-webkit-touch-callout:none]`, as on the app
  cards) on the card's wrapper.
- `frontend/src/lib/canonicalFileUrl.ts` (`fileLinkHref`): read only.
- `frontend/src/hooks/useContextMenu.ts`, `frontend/src/hooks/useFileCardLink.ts`,
  `frontend/src/components/DismissScrim.tsx`: used unchanged.
- `frontend/e2e-layout/fixtures/justified-grid.html` and
  `frontend/src/components/__tests__/justifiedGridFixtureParity.test.tsx`: a row for the
  justified cell with the opt-in (a new render state of the cell).
- `frontend/e2e-components/fixtures/` (a `FileGrid` fixture, registered in `fixtures/app.tsx`)
  and a spec beside `app-card-menu.spec.ts`: the computed `user-select` in Chromium.
- `frontend/src/components/__tests__/`: the menu rows, the row's href, and the in-click rows.
- `docs/ADDON-DEVELOPMENT.md`: the `appCardMenu` prop beside `extraMenuItems`.
- Files this change does not touch (the folder-structure work, SPEC-CORE-165/166, edits
  them): `components/videoapp/{LibraryFace,VideoShelfPage,shelfLinks,useVideoApp,VideoApp}`,
  `components/readingapp/{LibraryFace,folders,useFolderChips,ReadingShelfPage,shelfLinks,useReadingApp,ReadingApp}`,
  `components/Breadcrumb.tsx`, `app/drive/[name]/apps/{video,reading}/page.tsx` and their
  `shelf/page.tsx`, `e2e-layout/reading-video-faces.spec.ts` and its layout fixture.
- No protected path is edited.

## Invariants

I1. With `appCardMenu`, the menu on a grid card lists **Open in new tab** right after any `extraMenuItems` rows and their divider, followed by the rows the same card offers without the opt-in, in the same order, in both layouts (16:9 card and justified cell).
I2. With `appCardMenu`, **Open in new tab** calls `window.open` with exactly `fileLinkHref(file, sortQuery)` and `"_blank"` within the row's click, sends no API request, and closes the menu.
I3. With `appCardMenu`, every row of the menu (Download, Add to collection, Copy, Cut, Copy ID, Rename, Move, Move to Trash) starts its action within the click that chooses it.
I4. With `appCardMenu`, every card the grid draws, in both layouts, computes `user-select: none` on its wrapper in Chromium.
I5. With `appCardMenu`, a successful trash, rename or move from the menu calls the grid's `onRefresh` exactly once, and a failed or cancelled one does not call it.
I6. Without `appCardMenu`, a `FileGrid` card's menu rows (with and without `extraMenuItems`), the moment each row acts, its wrapper's class list, and its right-click, press and tap behaviour are exactly today's; so are the `FileCard`s drawn by `CarouselSection` and `ContinueWatchingSection`.

## Checked, no action

- `-webkit-touch-callout`: already `none` on `body` and inherited, so the link preview is
  suppressed for every card today. The class is added only for parity with the app cards; no
  invariant rests on it, since no test can tell it from the inherited value.
- The click that ends a press that opened the menu: already swallowed by `DismissScrim` for
  every caller, so no new swallow is added and the press behaviour is unchanged.
- WebKit's long press on a real device is agent_cannot_verify; the component e2e runs
  Chromium.
- Taking cards out in place in Photo Diary, moving the apps to a re-read, and turning the
  opt-in on for the core grids: decided against by the human (Summary).
- Photo Diary's README and `docs/user-guide/` describe no photo menu; the new row explains
  itself, so no user-guide sentence is added.
