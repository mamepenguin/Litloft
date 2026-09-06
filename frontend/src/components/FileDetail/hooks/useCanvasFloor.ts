"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * The custom property the CSS floor reads.
 *
 * The fraction and the absolute minimum are *not* here. They live in
 * the `min-height` in `globals.css` and nowhere else: a copy in TypeScript
 * would be a second statement of one rule that nothing forces to agree,
 * and this file cannot apply them anyway — it publishes a height.
 */
export const CANVAS_HEIGHT_VAR = "--canvas-h";

/**
 * Publish the canvas's own height so the viewer inside it can take a
 * floor as a fraction of it.
 *
 * **Measured, not `cqh`.** The obvious spelling is `min-height:
 * max(320px, 70cqh)` with `container-type: size` on the canvas, and it
 * is wrong here for a reason that has nothing to do with the height:
 * `container-type: size` implies `contain: layout`, which makes the
 * element the containing block for every `position: fixed` descendant
 * and gives it a stacking context of its own. The archive canvas holds
 * two — `ArchiveImageViewer`'s full-screen page-turner and the
 * toolbar's overflow backdrop, neither portalled. Under containment the
 * page-turner's `inset-0` resolves to the canvas rather than the
 * viewport: it covers the column, cannot rise above the header, and
 * scrolls away with the content, while `useInertBackdrop` has already
 * made everything behind it unclickable.
 *
 * Fixing that by portalling the viewer would move the inert semantics
 * that Bug-4 settled, and the toolbar backdrop would still need its own
 * answer. So the height is measured instead — the mechanism
 * `lib/cardGrid.ts` already uses for the card grids, and the same
 * `data-*`-attribute shape `DESIGN.md` prescribes wherever a subtree
 * may contain media.
 */
export function useCanvasFloor(
  enabled: boolean,
): (node: HTMLElement | null) => void {
  const hostRef = useRef<HTMLElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  /**
   * Read through a ref, not a dependency.
   *
   * The returned callback ref has to keep one identity for the life of
   * the mount: the host composes it with `onScrollRootChange`, and a new
   * identity makes React detach and reattach, which sends that setter
   * `null` and back. Downstream that tears down the mini-player portal
   * root and re-initialises the companion metrics — on a rotation across
   * the mobile breakpoint, or on paging from an archive to a video,
   * neither of which is a scroll-root change at all.
   */
  const enabledRef = useRef(enabled);

  const publish = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!enabledRef.current) {
      host.style.removeProperty(CANVAS_HEIGHT_VAR);
      return;
    }
    // `clientHeight` is the padding box. Nothing that reaches here is
    // padded — the shell pads the canvas only on mobile, and mobile has
    // no floor — but the subtraction is kept as the statement that the
    // floor is a fraction of the *content* box, so a padded desktop
    // canvas would not promise height it does not have.
    const style = getComputedStyle(host);
    const inner =
      host.clientHeight -
      (Number.parseFloat(style.paddingTop) || 0) -
      (Number.parseFloat(style.paddingBottom) || 0);
    // Zero is "not laid out yet", not "no room". Writing a floor from it
    // would claim a measurement that never happened.
    if (inner <= 0) return;
    host.style.setProperty(CANVAS_HEIGHT_VAR, `${inner}px`);
  }, []);

  useEffect(() => {
    enabledRef.current = enabled;
    publish();
  }, [enabled, publish]);

  return useCallback(
    (node: HTMLElement | null) => {
      const previous = hostRef.current;
      if (previous && observerRef.current) {
        observerRef.current.unobserve(previous);
        previous.style.removeProperty(CANVAS_HEIGHT_VAR);
      }
      hostRef.current = node;
      if (!node) {
        observerRef.current?.disconnect();
        observerRef.current = null;
        return;
      }
      if (typeof ResizeObserver !== "undefined") {
        if (!observerRef.current) {
          observerRef.current = new ResizeObserver(publish);
        }
        observerRef.current.observe(node);
      }
      // The observer reports a first size on its own where one exists;
      // a pane that never resizes again would otherwise never publish.
      publish();
    },
    [publish],
  );
}
