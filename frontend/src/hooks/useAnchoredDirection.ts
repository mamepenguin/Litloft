"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

/**
 * Which horizontal edge of the trigger the panel hangs from.
 *
 * Physical, not logical. The tree has no RTL form, and the classes these
 * map to (`left-0` / `right-0`, `left-7`, `right-3`) are physical too, so
 * a logical name here would be a promise nothing keeps.
 */
export type AnchoredSide = "left" | "right";

/**
 * The vertical pair a panel hangs by, and the gap in that pair, together.
 *
 * The number and the class are one entry rather than two declarations,
 * because the failure they are written against is drift between them:
 * unit E's `MENU_WIDTH_PX` could be halved with every test green, since
 * the constant *stated* a measurement and nothing compared it against the
 * class the box was drawn at. Two things in one object cannot disagree —
 * there is no second place to change.
 *
 * Keyed by the Tailwind step, so the key names the class and `px` is what
 * that step is worth. Spelled out rather than built: a class assembled at
 * runtime is not in the text Tailwind scans, so the rule is never emitted
 * — measured in unit G, where a runtime-built token left dead rules
 * behind.
 *
 * `sm:`-scoped spellings are **not** here. `ToolbarMenu`'s surface is a
 * viewport-spanning sheet below 640 and an anchored panel above it, so
 * its direction classes are `sm:top-full` / `sm:bottom-full` and its gap
 * is `MENU_SURFACE_GAP_PX`. Merging the two tables would put a caller one
 * character away from giving an always-anchored panel no vertical
 * placement at all below the breakpoint.
 */
export const ANCHORED_VERTICAL = {
  1: { px: 4, down: "top-full mt-1", up: "bottom-full mb-1" },
  2: { px: 8, down: "top-full mt-2", up: "bottom-full mb-2" },
} as const;

/**
 * The corner `animate-fade-in-scale` grows an anchored panel out of.
 *
 * A corner and not an edge, so it takes both axes: the animation starts
 * at `scale(0.95)`, and scaling out of the corner the panel is pinned to
 * is what makes it look attached to the trigger rather than sliding
 * towards it. An origin naming the top while the panel hangs from the
 * bottom is the one combination that reads wrong, and measuring the
 * direction is what makes it reachable.
 *
 * Only for the panels that carry the animation. A panel with no
 * `animate-*` has nothing to scale and takes no origin — adding one there
 * would be a class that can never bind.
 */
export const ANCHORED_ORIGIN = {
  "down-left": "origin-top-left",
  "down-right": "origin-top-right",
  "up-left": "origin-bottom-left",
  "up-right": "origin-bottom-right",
} as const;

export interface AnchoredDirectionOptions {
  /**
   * The **positioned wrapper** the panel is `absolute` inside — the
   * `relative` box, not the button in it.
   *
   * Two things depend on that: the walk starts at this element's parent,
   * so a frame *between* the wrapper and the button would be missed if the
   * button were passed; and the space arithmetic is against the box the
   * panel hangs off, which is the wrapper's edge that `top-full` /
   * `bottom-full` resolve to.
   */
  triggerRef: RefObject<HTMLElement | null>;
  /** The panel box. Its rendered size is what the decision is made from. */
  panelRef: RefObject<HTMLElement | null>;
  /** Whether the panel is mounted. Nothing is measured while it is not. */
  open: boolean;
  /**
   * The panel's own margin away from the trigger, in px — the `mt-*` /
   * `mb-*` (or `ml-*` / `mr-*`) it carries.
   *
   * Required rather than defaulted, because it is not the same number at
   * every site and a default is how a site ends up measuring someone
   * else's gap. The gap is part of the room the panel needs, so it belongs
   * inside the comparison: without it a panel whose height lands in the
   * last few pixels of the space below is kept downward and its final
   * pixels sit past the edge.
   */
  gapPx: number;
  /**
   * The side the panel hangs from wherever it has the room. Defaults to
   * `right`, which is the majority and the side a menu on a toolbar's
   * right-hand end needs.
   */
  preferSide?: AnchoredSide;
}

export interface AnchoredDirection {
  /** `true` when the panel should hang above the trigger. */
  openUp: boolean;
  /** The edge the panel should hang from. */
  side: AnchoredSide;
}

/** The four edges of the box a panel is bounded by. */
interface Frame {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The box that actually clips a panel anchored inside `wrapper`.
 *
 * Not the same as the first ancestor with an `overflow` value. An overflow
 * box clips a positioned descendant only while it is still in that
 * descendant's containing-block chain, and the chain leaves the DOM
 * parentage twice:
 *
 *   - at a `fixed` ancestor. It is laid out against the viewport, so
 *     nothing above it clips the subtree. The Bottom Sheet's resting strip
 *     is exactly that (`fixed bottom-0`), so without the stop a scroller
 *     anywhere above the shell would hand both axes a box the strip is not
 *     inside.
 *   - at an `absolute` ancestor, and then only as far as *its* own
 *     containing block: the nearest positioned ancestor. Static boxes in
 *     between are not in the chain and do not clip. Once that positioned
 *     ancestor is reached the detour is over — a `relative` or `sticky`
 *     box is itself in flow, so statics above it clip again; an `absolute`
 *     one starts a fresh detour.
 *
 * The exception this does **not** implement is an ancestor with
 * `transform` / `filter` / `contain`, which becomes the containing block of
 * even a `fixed` descendant. vaul's drawer is one. A panel drawn inside the
 * expanded sheet is inside that drawer, and this walk will read the frame
 * as though it were not; what saves it there is that the sheet's own
 * scroller is found first, before the walk reaches the drawer.
 *
 * Returns `null` when nothing in the chain clips, which is the caller's cue
 * to fall back to the visual viewport.
 */
function clippingFrame(wrapper: HTMLElement): Frame | null {
  // Set while the walk is between an `absolute` ancestor and that
  // ancestor's containing block, where only a positioned box counts.
  let inAbsoluteDetour = false;
  for (let el = wrapper.parentElement; el; el = el.parentElement) {
    const { overflowX, overflowY, position } = getComputedStyle(el);
    // Positive test rather than `!== "static"`: an unset `position` reads
    // as `""` outside a browser, and the whole point of the flag is that a
    // *static* box inside the detour cannot clip.
    const positioned =
      position === "relative" ||
      position === "absolute" ||
      position === "fixed" ||
      position === "sticky";
    if (
      (positioned || !inAbsoluteDetour) &&
      /auto|scroll|hidden/.test(overflowX + overflowY)
    ) {
      const rect = el.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      };
    }
    if (position === "fixed") return null;
    // Only a positioned box moves the flag: it is the one that ends a
    // detour, or starts one. A static ancestor leaves it alone, which is
    // what keeps the detour running across the statics inside it.
    if (positioned) inAbsoluteDetour = position === "absolute";
  }
  return null;
}

/**
 * The part of the window that is actually on screen, in the coordinates
 * `getBoundingClientRect()` reports.
 *
 * `window.innerHeight` is the layout viewport, which an on-screen keyboard
 * does not move; `visualViewport` is what is left visible. The two are in
 * the same units and `visualViewport`'s offsets are expressed against the
 * layout viewport's origin — the same origin a client rect is — so the
 * visible band is `[offsetTop, offsetTop + height]` and not `[0, height]`.
 * Dropping the offset is right only while it is zero.
 */
function viewportFrame(): Frame {
  const vv = typeof window === "undefined" ? undefined : window.visualViewport;
  if (!vv) {
    return {
      left: 0,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
    };
  }
  return {
    left: vv.offsetLeft,
    top: vv.offsetTop,
    right: vv.offsetLeft + vv.width,
    bottom: vv.offsetTop + vv.height,
  };
}

/**
 * Which corner of its trigger an anchored panel should hang from.
 *
 * ## What this is for
 *
 * A panel hung off a trigger's edge — a menu, a filter popover, a folder
 * picker, a typeahead. Hanging below and to one side is right wherever the
 * trigger has the room; where it has none, a panel that can only open one
 * way is drawn off the edge. `DESIGN.md` §Context Menus / Dropdowns states
 * the rule; this is the one place it is worked out.
 *
 * Both axes resolve against the same box — the first ancestor that clips
 * *this panel* — falling back to the visual viewport when there is none.
 * What bounds a panel is the enclosing column, not the window.
 *
 * The decision is made from the **rendered box**, not from a breakpoint and
 * not from a row count: a menu's height is its content's to change, and no
 * constant here would follow it. It is re-derived while the panel is open,
 * because the things it reads move — an addon slot resolving a dynamic
 * `import()` makes the panel taller a frame later, and an on-screen
 * keyboard changes the visible band without changing anything the panel
 * itself can observe.
 *
 * ## Two other families, which this is not
 *
 * Named because the next reader will otherwise try to unify them:
 *
 *   - **Point-anchored menus** — `ContextMenu` and its callers, and the
 *     knowledge addon's `MediaCaptureAction`. These clamp a panel to a
 *     cursor position. There is no trigger box to flip against, and a
 *     shared recipe that grows a mode flag per caller is how the last
 *     three extractions here went wrong.
 *   - **Frame-parked panels** — `OverFrameSettingsPanel` and its two
 *     callers, anchored to the viewer chrome by a measured decision of
 *     their own rather than to any trigger.
 *
 * ## What it does not decide
 *
 * A panel that is not anchored has no direction to pick, and this says so
 * by leaving both answers where they were. The bar menus are a `fixed`
 * bottom sheet below `sm` and an anchored panel above it, and the sheet
 * spans the viewport — there is nothing to flip and no trigger it is
 * measured against. The test for that is the panel's own computed
 * `position`, which is a property of the arrangement the arithmetic below
 * needs; asking a media query which form is on screen would be a guess at
 * the same fact, and would be wrong the moment a site chose the form some
 * other way.
 *
 * ## Neither answer is cleared when the panel closes
 *
 * `FileActions` raises an error toast off the same trigger *after* its menu
 * has gone, and `DESIGN.md` requires it to use the same corner. A reset
 * would put the message in the corner the menu was not allowed to use. Both
 * are re-derived on every open, so a stale value never outlives one paint.
 */
export function useAnchoredDirection({
  triggerRef,
  panelRef,
  open,
  gapPx,
  preferSide = "right",
}: AnchoredDirectionOptions): AnchoredDirection {
  const [openUp, setOpenUp] = useState(false);
  const [side, setSide] = useState<AnchoredSide>(preferSide);

  useLayoutEffect(() => {
    if (!open) return;

    const measure = () => {
      const wrapper = triggerRef.current;
      const panel = panelRef.current;
      if (!wrapper || !panel) return;

      // The unanchored form. See "What it does not decide" above.
      if (getComputedStyle(panel).position === "fixed") return;

      const triggerRect = wrapper.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      // The room a panel has is what is *both* unclipped and on screen, so
      // the two frames are intersected rather than chosen between.
      //
      // Choosing between them made the visible band a fallback for panels
      // with no clipping ancestor and invisible to every other one — an
      // on-screen keyboard shrinks what is visible without moving any
      // element's box, so a panel inside a column read room below it that
      // the keyboard was covering. The rename dialog raises the keyboard on
      // the surface this menu sits on.
      //
      // A clipping ancestor usually is the smaller of the two, and then the
      // intersection is just its box.
      const clip = clippingFrame(wrapper);
      const visible = viewportFrame();
      const frame = clip
        ? {
            left: Math.max(clip.left, visible.left),
            top: Math.max(clip.top, visible.top),
            right: Math.min(clip.right, visible.right),
            bottom: Math.min(clip.bottom, visible.bottom),
          }
        : visible;

      // `triggerRect` is the wrapper's, which the panel — being absolute,
      // out of flow — does not move, and the panel's size is the same
      // whichever corner it is drawn in. So neither reading depends on the
      // answer it feeds.
      //
      // Each axis counts its gap once. The two margins on an axis are the
      // same class, so the gap cancels out of the "which side is bigger"
      // half and decides only whether the panel fits on the preferred side
      // at all. Each axis flips only when the other side is the better of
      // the two, so a trigger with room for neither keeps the direction the
      // panel reads as everywhere else.
      const spaceBelow = frame.bottom - triggerRect.bottom;
      const spaceAbove = triggerRect.top - frame.top;
      setOpenUp(
        panelRect.height + gapPx > spaceBelow && spaceAbove > spaceBelow,
      );

      // Hanging from the right edge puts the panel's left edge at
      // `right - width`, so the room it has is measured leftward from the
      // trigger's right edge; hanging from the left is the mirror. The
      // width is the panel's own rendered width rather than a constant
      // stating it, so there is no second number to disagree with the
      // `w-*` / `min-w-*` it is actually drawn at.
      const roomFromRight = triggerRect.right - frame.left;
      const roomFromLeft = frame.right - triggerRect.left;
      const [preferred, other] =
        preferSide === "right"
          ? [roomFromRight, roomFromLeft]
          : [roomFromLeft, roomFromRight];
      const flip = panelRect.width > preferred && other > preferred;
      setSide(
        flip ? (preferSide === "right" ? "left" : "right") : preferSide,
      );
    };

    measure();

    // Three things move under an open panel, and each has to say so:
    //
    //   - the panel's own size. `AddonSlot` resolves a dynamic `import()`
    //     inside an effect and renders null until it lands, so the first
    //     open after a page load sees a menu with no addon rows in it —
    //     the same wrong number a guessed row count would have given.
    //     Flipping cannot re-enter this: the direction classes move the
    //     panel, they do not resize it, and a ResizeObserver reports a
    //     changed box rather than a changed position.
    //   - the visible band, which an on-screen keyboard changes without
    //     resizing the panel or the window. A field's typeahead is opened
    //     *by* typing, so the keyboard is already up when it is measured
    //     and the event worth noticing is it going away again. Panning a
    //     zoomed page moves the band without resizing it, and moves no
    //     client rect either, so `scroll` is a second subscription rather
    //     than a duplicate of the first.
    //
    // `visualViewport` answers for the window wherever it exists, so
    // `window`'s own `resize` is the fallback for where it does not rather
    // than a third subscription — two listeners for one event would
    // re-derive twice per resize.
    //
    // What none of them see is a **frame that resizes on its own** — a
    // column narrowing because the inspector opened, say. The frame is
    // re-walked on every measurement, so the next event picks the change
    // up; nothing here promises the same paint.
    const panel = panelRef.current;
    const observer =
      panel && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measure)
        : null;
    if (panel) observer?.observe(panel);

    const vv = window.visualViewport;
    const viewport: Pick<
      EventTarget,
      "addEventListener" | "removeEventListener"
    > = vv ?? window;
    viewport.addEventListener("resize", measure);
    vv?.addEventListener("scroll", measure);
    return () => {
      observer?.disconnect();
      viewport.removeEventListener("resize", measure);
      vv?.removeEventListener("scroll", measure);
    };
  }, [open, gapPx, preferSide, triggerRef, panelRef]);

  return { openUp, side };
}
