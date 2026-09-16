"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
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
  sheetTopAtSnap,
} from "@/lib/sheetSnap";
import {
  knobReleaseDismisses,
  releaseVelocity,
  type VelocitySample,
} from "@/lib/sheetDismiss";
import { useViewportHeight } from "@/hooks/useViewportHeight";
import { useSheetDismissMotion } from "@/hooks/useSheetDismissMotion";
import { useSheetPullToCollapse } from "@/hooks/useSheetPullToCollapse";

/**
 * A state, not a snap: what `half` means in vaul's units is derived per file
 * from the player's measured bottom edge, so storing the number would make
 * the shell's own state go stale the moment a phone's URL bar collapsed.
 */
export type SheetState = "peek" | "half" | "full";

export const SHEET_STATE_PEEK: SheetState = "peek";
export const SHEET_STATE_HALF: SheetState = "half";
export const SHEET_STATE_FULL: SheetState = "full";

/**
 * vaul translates the drawer down and publishes that as `--snap-point-height`,
 * so whatever the snap, the last `--snap-point-height` pixels of the drawer
 * are below the fold and a scroller that fills the drawer ends off screen.
 * No snap value, no handle height and no viewport unit belongs in this
 * expression.
 */
export const SHEET_VISIBLE_HEIGHT =
  "calc(100% - var(--snap-point-height, 0px))";

/** The resting strip, and the room the page keeps free for it. */
export const SHEET_PEEK_HEIGHT = `calc(${SHEET_PEEK_PX}px + env(safe-area-inset-bottom, 0px))`;

export const SHEET_SCROLLER_PADDING_BOTTOM =
  "calc(env(safe-area-inset-bottom, 0px) + 16px)";

export function isSheetExpanded(state: SheetState): boolean {
  return state !== SHEET_STATE_PEEK;
}

export function sheetSnapPoints(halfSnap: number): (number | string)[] {
  return [halfSnap, SHEET_SNAP_FULL];
}

/**
 * Decided by `full`'s value, which is the one that is fixed. Reading it the
 * other way round would compare a float vaul may have rounded against one
 * derived here.
 */
export function sheetStateForSnap(snap: number | string | null): SheetState {
  return snap === SHEET_SNAP_FULL ? SHEET_STATE_FULL : SHEET_STATE_HALF;
}

/**
 * The drawer is mounted only while expanded, and the peek strip is drawn
 * outside it: an open drawer is a Radix layer, which takes every Escape on
 * the page, and vaul lifts it over the keyboard for any focused field.
 *
 * Not modal, so the page and the player stay usable while it is up. vaul
 * draws no backdrop for a drawer that is not modal.
 *
 * Without `handleOnly` vaul decides per frame, from whether the scroller
 * happens to be at its top, so reading with a finger still down turns into
 * dragging the sheet.
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
  halfSnap?: number;
  peek: ReactNode;
  children: ReactNode;
}): ReactElement | null {
  const t = useTranslations("inspector");
  // State rather than a ref: the drawer is not mounted at `peek`, so this
  // node comes and goes with the sheet's state and the gesture's effect
  // has to re-run when it does.
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const expanded = isSheetExpanded(state);
  const { dismiss, isDismissing } = useSheetDismissMotion({
    surfaceRef,
    expanded,
    onDismissed: useCallback(
      () => onStateChange(SHEET_STATE_PEEK),
      [onStateChange],
    ),
  });
  useSheetPullToCollapse({
    scroller,
    surfaceRef,
    onDismiss: dismiss,
    isDismissing,
  });

  const knobSamples = useRef<VelocitySample[] | null>(null);
  // How fast the knob left, kept for the length of the release's own
  // dispatch: when vaul decides to close, it does so inside that dispatch.
  const knobReleaseVelocity = useRef(0);
  // A `vh` class here would size the box in the large viewport while
  // every snap point was computed in `window.innerHeight`.
  const viewportHeight = useViewportHeight();
  const drawerHeight = `${sheetDrawerHeightPx(viewportHeight)}px`;
  // Rebuilt only when the derived snap moves. vaul re-derives its own
  // offsets when this array changes identity, so an inline literal would
  // hand it a new list on every render of the page behind it.
  const snapPoints = useMemo(() => sheetSnapPoints(halfSnap), [halfSnap]);

  const onKnobPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    const onKnob = (event.target as Element).closest?.("[data-vaul-handle]");
    knobSamples.current = onKnob
      ? [{ at: event.timeStamp, y: event.clientY }]
      : null;
  };

  const onKnobPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    knobSamples.current?.push({ at: event.timeStamp, y: event.clientY });
  };

  /**
   * Runs before vaul's own release, which with snap points settles on the
   * nearest one however far below `half` the knob was let go. Stopping the
   * event here is what keeps vaul from springing the sheet back while it
   * leaves.
   */
  const onKnobPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (isDismissing()) {
      event.stopPropagation();
      return;
    }
    const samples = knobSamples.current;
    knobSamples.current = null;
    if (!samples) return;
    const velocity = releaseVelocity(samples, event.timeStamp);
    const dismisses = knobReleaseDismisses({
      sheetTop: event.currentTarget.getBoundingClientRect().top,
      halfTop: sheetTopAtSnap(window.innerHeight, halfSnap),
      viewportHeight: window.innerHeight,
      velocity,
    });
    if (dismisses) {
      event.stopPropagation();
      dismiss({ velocity });
      return;
    }
    knobReleaseVelocity.current = velocity;
    window.setTimeout(() => {
      knobReleaseVelocity.current = 0;
    }, 0);
  };

  /** vaul treats a pointer leaving the drawer as a release. */
  const swallowWhileDismissing = (event: ReactPointerEvent<HTMLElement>) => {
    if (isDismissing()) event.stopPropagation();
  };

  if (!expanded) {
    return (
      <div
        data-testid="mobile-inspector-peek"
        style={{
          height: SHEET_PEEK_HEIGHT,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
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
      setActiveSnapPoint={(next) => {
        // vaul resets its snap point 500ms after it closes.
        if (isDismissing()) return;
        onStateChange(sheetStateForSnap(next));
      }}
      modal={false}
      handleOnly
      onOpenChange={(next) => {
        if (!next) dismiss({ velocity: knobReleaseVelocity.current });
      }}
    >
      <Drawer.Portal>
        <Drawer.Content
          data-testid="mobile-inspector-sheet"
          data-snap={state}
          // Under the overlay sidebar and its backdrop, which can be opened
          // while the sheet is up.
          className="fixed bottom-0 left-0 right-0 z-[25] flex flex-col outline-none"
          style={{ height: drawerHeight }}
          onPointerDownCapture={onKnobPointerDown}
          onPointerMoveCapture={onKnobPointerMove}
          onPointerUpCapture={onKnobPointerUp}
          onPointerOutCapture={swallowWhileDismissing}
        >
          {/* The box a content pull translates. It carries the paint
              because `Drawer.Content` above cannot: vaul writes that
              element's own transform on every frame of a knob drag. */}
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
              {/* The guide tells readers they can drag the sheet to full,
                and a sheet with no handle does not say so. */}
              <Drawer.Handle className="mx-auto mt-3 h-1 w-12 shrink-0 rounded-full bg-bg-border" />
              <Drawer.Title className="sr-only">{t("title")}</Drawer.Title>
              {/* vaul (Radix Dialog) requires either a Description or an
                explicit `aria-describedby={undefined}` to silence the
                warning. */}
              <Drawer.Description className="sr-only">
                {t("sheetDescription")}
              </Drawer.Description>
              {/* `overscroll-contain` is here for the iOS rubber band and
                the scroll chain, not for anything Chromium does. */}
              <div
                ref={setScroller}
                data-testid="mobile-inspector-content"
                data-inspector-scroller=""
                className="min-h-0 flex-1 overflow-auto overscroll-contain"
                style={{ paddingBottom: SHEET_SCROLLER_PADDING_BOTTOM }}
              >
                {children}
              </div>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
