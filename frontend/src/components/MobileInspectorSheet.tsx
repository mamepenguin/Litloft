"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { Drawer } from "vaul";

import {
  SHEET_PEEK_PX,
  SHEET_SNAP_FULL,
  SHEET_SNAP_HALF_FALLBACK,
  sheetDrawerHeightPx,
} from "@/lib/sheetSnap";
import { useViewportHeight } from "@/hooks/useViewportHeight";
import { useSheetPullToCollapse } from "@/hooks/useSheetPullToCollapse";
import { DialogPortalProvider } from "./DialogPortal";

/**
 * Which of the three states the sheet is in.
 *
 * **A state, not a snap.** `full` is always the same fraction of the
 * window, but what `half` means in vaul's units is derived per file from
 * the player's measured bottom edge, so the number changes with the
 * viewport and with what is being watched. Storing the number would make
 * the shell's own state go stale the moment a phone's URL bar collapsed
 * — it would name a snap point that is no longer in the list vaul was
 * handed. The shell stores which state it is in and this component
 * resolves it, which is the only place the two representations meet.
 */
export type SheetState = "peek" | "half" | "full";

export const SHEET_STATE_PEEK: SheetState = "peek";
export const SHEET_STATE_HALF: SheetState = "half";
export const SHEET_STATE_FULL: SheetState = "full";

/**
 * The part of the drawer that is actually on screen.
 *
 * vaul translates the drawer down by `vh × (1 − snap)` and publishes
 * that as `--snap-point-height`, having assumed the drawer's untranslated
 * top is the viewport top. `Drawer.Content` is `fixed bottom-0`, so its
 * untranslated top is its own height above the bottom edge and the
 * translate is added to that: whatever the snap, the last
 * `--snap-point-height` pixels of the drawer are below the fold. A
 * scroller that fills the drawer therefore ends off screen, and reports
 * nothing left to scroll while its last screenful is where nobody can
 * reach it.
 *
 * This is the box that is not: the drawer's own height less what vaul
 * pushed past the bottom edge. `100%` is the drawer's height rather than
 * a copy of it — the surface between the two fills it (`h-full`) — so a
 * later change to that height, or a snap point added between these two,
 * moves this with it. No snap value, no handle height and no viewport
 * unit belongs in this expression; every one of them would be a second,
 * quieter definition of what vaul already publishes.
 *
 * The `0px` fallback is the no-snap-points case, where vaul sets no
 * variable and the whole drawer is on screen.
 *
 * The drawer's own height is on the element as a px value rather than
 * as a `vh` class, for the reason `sheetDrawerHeightPx` gives: `100%`
 * of a box sized in the large viewport would be the wrong box on a
 * phone showing its URL bar, and this subtraction would inherit it.
 */
export const SHEET_VISIBLE_HEIGHT =
  "calc(100% - var(--snap-point-height, 0px))";

/**
 * The gap under the last line of the sheet.
 *
 * 16px of breathing room plus whatever the device puts between the
 * bottom edge and something a finger can reach. Named rather than
 * inlined because jsdom cannot round-trip an `env()` through
 * `style.paddingBottom`, so the layout fixture's copy of it has nothing
 * to be compared against otherwise.
 */
export const SHEET_SCROLLER_PADDING_BOTTOM =
  "calc(env(safe-area-inset-bottom, 0px) + 16px)";

/** Whether the sheet is in one of the two states that cover the page. */
export function isSheetExpanded(state: SheetState): boolean {
  return state !== SHEET_STATE_PEEK;
}

/**
 * The two snap points vaul is handed, in order.
 *
 * `peek` is not among them — the drawer is not mounted there at all, see
 * the note on modality below — so these two are every state vaul sees.
 * `half` is a parameter because it is derived from what the page is
 * showing; `full` is not, because reading without following playback
 * does not depend on the player's size (hako `vjPOVv5gXepgO8Io-es1m`).
 */
export function sheetSnapPoints(halfSnap: number): (number | string)[] {
  return [halfSnap, SHEET_SNAP_FULL];
}

/**
 * The state a snap point vaul hands back belongs to.
 *
 * Decided by `full`'s value, which is the one that is fixed. Reading it
 * the other way round — "is this the half number" — would compare a
 * float vaul may have rounded against one derived here, and would fall
 * through to `full` whenever they differed by a bit. `null` is vaul's
 * "no active snap point", which happens while a drag is settling.
 */
export function sheetStateForSnap(snap: number | string | null): SheetState {
  return snap === SHEET_SNAP_FULL ? SHEET_STATE_FULL : SHEET_STATE_HALF;
}

/**
 * Bottom Sheet that carries the inspector on a phone.
 *
 * Three states, not two. It rests at `peek` rather than closing, so the
 * title and the action row are permanently on screen; `half` and `full`
 * bring the rest of the inspector up over the page.
 *
 * **The drawer is mounted only while expanded, and the peek strip is
 * drawn outside it.** This is not a preference. vaul renders Radix's
 * `Dialog.Root` with `open`, `defaultOpen` and `onOpenChange` and
 * nothing else — its own `modal` prop never reaches Radix, which
 * therefore defaults to modal and calls `hideOthers()` on every other
 * body child. A drawer mounted at rest puts `aria-hidden="true"` on the
 * whole application, permanently, on every file page a phone opens. The
 * page stays scrollable, so nothing looks wrong; it is simply gone for
 * anyone using a screen reader.
 *
 * The cost is that the content below the strip unmounts on collapse and
 * refetches on the way back up. That is what `develop` already did with
 * a closed sheet, and it is the cheaper of the two prices.
 *
 * `fadeFromIndex={0}` because vaul defaults it to the *last* snap point,
 * which would leave `half` — the state the toggle actually opens —
 * covering the page with no dim to say so.
 *
 * A dismiss gesture collapses to `peek`; there is no closed state to
 * dismiss to, and refusing the gesture would leave a reader who tapped
 * the dim with nothing happening.
 *
 * **Two gestures, and each moves exactly one thing** (`handleOnly` plus
 * `useSheetPullToCollapse`):
 *
 * - The **knob** moves the sheet between its states. `handleOnly` is what
 *   makes that the only way: it stops `Drawer.Content` from calling
 *   vaul's `onPress`/`onDrag`, leaving `Drawer.Handle` as the only
 *   element that does.
 * - A **pull on the content** collapses the sheet to `peek`, and can do
 *   nothing else — not `full` to `half`, and not upward. Which pulls
 *   qualify is `sheetPullGesture`'s subject.
 *
 * Without `handleOnly` vaul decides per frame, from whether the scroller
 * happens to be at its top, so reading with a finger still down turned
 * into dragging the sheet and a fling that coasted to the top became a
 * drag on the frame it arrived.
 *
 * Sits in the surface tier (`DESIGN.md` §Layering), above the sidebar
 * overlay and mini player but below modal dialogs — it hosts the file
 * `[...]` menu, so anything that menu opens has to paint above the sheet
 * it was launched from. Correct stacking is necessary but not
 * sufficient, which is what the dialog host at the bottom is for.
 */
export function MobileInspectorSheet({
  state,
  onStateChange,
  halfSnap = SHEET_SNAP_HALF_FALLBACK,
  peek,
  children,
}: {
  state: SheetState;
  onStateChange: (next: SheetState) => void;
  /**
   * What `half` is worth in vaul's units, for this page and this
   * viewport.
   *
   * Derived by `useSheetHalfSnap` from the player's bottom edge so the
   * sheet takes the room under it and the video stays whole. The default
   * is the surfaces that have no player to measure — a Markdown note, a
   * PDF, an image.
   */
  halfSnap?: number;
  /** The 56px row: the file's name and the controls that act on it. */
  peek: ReactNode;
  children: ReactNode;
}): ReactElement | null {
  const t = useTranslations("inspector");
  const [dialogHost, setDialogHost] = useState<HTMLDivElement | null>(null);
  // State rather than a ref: the drawer is not mounted at `peek`, so this
  // node comes and goes with the sheet's state and the gesture's effect
  // has to re-run when it does.
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const collapse = useCallback(
    () => onStateChange(SHEET_STATE_PEEK),
    [onStateChange],
  );
  useSheetPullToCollapse({ scroller, surfaceRef, onCollapse: collapse });
  // The drawer's height, against the viewport vaul solves its snaps in.
  // A `vh` class here would size the box in the large viewport while
  // every snap point was computed in `window.innerHeight`, and on a
  // phone with the URL bar showing those differ by the height of the
  // bar — the sheet's top edge would land that far above the player it
  // is meant to stop at. See `sheetDrawerHeightPx`.
  const viewportHeight = useViewportHeight();
  const drawerHeight = `${sheetDrawerHeightPx(viewportHeight)}px`;
  // Rebuilt only when the derived snap moves. vaul re-derives its own
  // offsets when this array changes identity, so an inline literal would
  // hand it a new list on every render of the page behind it.
  const snapPoints = useMemo(() => sheetSnapPoints(halfSnap), [halfSnap]);
  const expanded = isSheetExpanded(state);

  if (!expanded) {
    return (
      <div
        data-testid="mobile-inspector-peek"
        style={{ height: `${SHEET_PEEK_PX}px` }}
        // Floating surface (`DESIGN.md` §Layering), the tier
        // bottom-anchored mobile chrome belongs to. Below the sheet it
        // becomes, so the two never argue during the transition.
        className="fixed bottom-0 left-0 right-0 z-40 flex items-center gap-2 border-t border-bg-border bg-bg-card px-4"
      >
        {peek}
      </div>
    );
  }

  return (
    <Drawer.Root
      open
      snapPoints={snapPoints}
      activeSnapPoint={state === SHEET_STATE_FULL ? SHEET_SNAP_FULL : halfSnap}
      setActiveSnapPoint={(next) => onStateChange(sheetStateForSnap(next))}
      fadeFromIndex={0}
      modal
      handleOnly
      onOpenChange={(next) => {
        if (!next) collapse();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay
          data-testid="mobile-inspector-overlay"
          className="fixed inset-0 z-[45] bg-black/50"
        />
        <Drawer.Content
          data-testid="mobile-inspector-sheet"
          data-snap={state}
          className="fixed bottom-0 left-0 right-0 z-[46] flex flex-col outline-none"
          style={{ height: drawerHeight }}
        >
          {/* The sheet's visible surface, and the box a content pull
              translates. It carries the paint — background, top corners,
              border — because `Drawer.Content` above cannot: vaul writes
              that element's own transform on every frame of a knob drag
              and on every snap, so the two would overwrite each other.
              `h-full` so the subtraction below still resolves against the
              drawer's height. */}
          <div
            ref={surfaceRef}
            data-testid="mobile-inspector-surface"
            className="h-full flex flex-col rounded-t-2xl border-t border-bg-border bg-bg-card"
          >
            <div
              data-testid="mobile-inspector-visible"
              className="flex min-h-0 shrink-0 flex-col"
              style={{ height: SHEET_VISIBLE_HEIGHT }}
            >
              {/* Restored deliberately: the guide tells readers they can
                drag the sheet to full, and a sheet with no handle does
                not say so. `Drawer.Handle` is also vaul's own drag
                affordance, so tapping it cycles the snap points. */}
              <Drawer.Handle className="mx-auto mt-3 h-1 w-12 shrink-0 rounded-full bg-bg-border" />
              <Drawer.Title className="sr-only">{t("title")}</Drawer.Title>
              {/* Visually hidden description for assistive tech — vaul
                (Radix Dialog) requires either a Description or an
                explicit `aria-describedby={undefined}` to silence the
                warning. */}
              <Drawer.Description className="sr-only">
                {t("sheetDescription")}
              </Drawer.Description>
              {/* `overscroll-contain` keeps a gesture this scroller cannot
                answer from becoming the page's. Like the
                `preventDefault()` in `useSheetPullToCollapse`, what it
                answers is a platform this repository's browser suite
                cannot drive — it is green with the class removed
                (measured) — so it is here for the iOS rubber band and
                the scroll chain, not for anything Chromium does. */}
              <div
                ref={setScroller}
                data-testid="mobile-inspector-content"
                className="min-h-0 flex-1 overflow-auto overscroll-contain"
                style={{ paddingBottom: SHEET_SCROLLER_PADDING_BOTTOM }}
              >
                <DialogPortalProvider target={dialogHost}>
                  {children}
                </DialogPortalProvider>
              </div>
            </div>
          </div>
          {/* Host for dialogs opened from inside the sheet. vaul is
              modal, so `pointer-events: none` on <body> and
              `aria-hidden` on every other body child — a dialog
              portalled beside the sheet would be stacked correctly and
              still be inert. Landing it here keeps it inside the one
              subtree vaul leaves interactive. */}
          <div ref={setDialogHost} />
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
