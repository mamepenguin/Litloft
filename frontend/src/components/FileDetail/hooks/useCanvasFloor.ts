"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * The fraction and the absolute minimum live in the `min-height` in
 * `globals.css` and nowhere else.
 */
export const CANVAS_HEIGHT_VAR = "--canvas-h";

/**
 * **Measured, not `cqh`.** `container-type: size` implies `contain: layout`,
 * which makes the element the containing block for every `position: fixed`
 * descendant, and the archive canvas holds un-portalled ones.
 */
export function useCanvasFloor(
  enabled: boolean,
): (node: HTMLElement | null) => void {
  const hostRef = useRef<HTMLElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  /**
   * Read through a ref, not a dependency: the returned callback ref has to
   * keep one identity for the life of the mount, or React detaches and
   * reattaches it.
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
