"use client";

import { useEffect, useState, type RefObject } from "react";

import { SHEET_SNAP_HALF_FALLBACK, halfSnapUnderPlayer } from "@/lib/sheetSnap";

/**
 * What `half` is worth for the page currently on screen.
 *
 * `half` stops being a fixed fraction of the window: it is the snap that
 * lands the sheet's top edge on the player's bottom edge, so the video
 * stays whole and everything under it goes to the sheet. The arithmetic
 * is `halfSnapUnderPlayer`; this is the measuring half of it.
 *
 * **Measured, and re-measured.** vaul re-derives its offsets from
 * `window.innerHeight` on every render, so a viewport that changes under
 * a stale snap moves the sheet without moving the player. A phone's URL
 * bar collapsing mid-scroll is the case that finds it — `globals.css`
 * already records that it really happens on this app, in the note on
 * `--player-avail` — and it changes `innerHeight` without changing the
 * player's own box, so the element observer alone would not see it.
 * Hence both: a `ResizeObserver` for the player (a `.loft` frame
 * resolving its ratio, `--rail-avail` moving the width cap) and the
 * window's own events for the viewport.
 *
 * **Nothing here touches the player.** It reads a rect. Re-parenting a
 * player reloads any `<iframe>` in it and remounting a `<video>`
 * restarts it at zero with `ended` rebound, which writes a watch
 * position nobody played (`.claude/rules/design-decisions.md`, watch
 * history; hako `vjPOVv5gXepgO8Io-es1m`).
 *
 * The player is `position: sticky; top: 0` inside the canvas on a phone
 * (`globals.css`, `[data-sheet-snap] .media-detail-player`), so its
 * bottom edge is the same viewport coordinate however far the page has
 * been scrolled. That is what makes one measurement good for the whole
 * of a scroll rather than only for the top of it.
 *
 * @param playerRef The player wrapper — `.media-detail-player`, which is
 *   the box that sticks, and therefore the box that has to stay clear.
 *   It holds the action row under the frame as well as the frame, which
 *   is right: those controls are as unreachable behind the sheet as the
 *   picture is.
 * @param enabled False wherever there is nothing to measure — a desktop
 *   pane, a Markdown note, a PDF, an image — which is what falls back to
 *   the fixed fraction.
 * @param fileId The file whose player is being measured. The wrapper is
 *   a different element for a different file, and a `RefObject` gives no
 *   notification when its contents change; this is the same dependency,
 *   and for the same reason, that `useCompanionMetrics` names.
 */
export function useSheetHalfSnap(
  playerRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  fileId: string,
): number {
  const [halfSnap, setHalfSnap] = useState(SHEET_SNAP_HALF_FALLBACK);

  useEffect(() => {
    const node = enabled ? playerRef.current : null;
    if (!node) {
      setHalfSnap(SHEET_SNAP_HALF_FALLBACK);
      return;
    }

    const measure = () => {
      const derived = halfSnapUnderPlayer({
        viewportHeight: window.innerHeight,
        playerBottom: node.getBoundingClientRect().bottom,
      });
      setHalfSnap(derived ?? SHEET_SNAP_HALF_FALLBACK);
    };

    // Before the observer, not instead of it: `ResizeObserver` reports a
    // first size on its own where one exists, but it does not exist in
    // jsdom and a pane that never resizes again would leave the sheet on
    // the fallback for the life of the page.
    measure();

    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(node);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    // The one the URL bar moves. On iOS it is the visual viewport that
    // reports first, and `innerHeight` is already the new value by the
    // time this runs — the listener is the notification, not the source.
    window.visualViewport?.addEventListener("resize", measure);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [playerRef, enabled, fileId]);

  return halfSnap;
}
