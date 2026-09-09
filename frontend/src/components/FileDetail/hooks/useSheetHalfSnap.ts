"use client";

import { useEffect, useState, type RefObject } from "react";

import { SHEET_SNAP_HALF_FALLBACK, halfSnapUnderPlayer } from "@/lib/sheetSnap";
import { useViewportHeight } from "@/hooks/useViewportHeight";

/**
 * What `half` is worth for the page currently on screen.
 *
 * `half` stops being a fixed fraction of the window: it is the snap that
 * lands the sheet's top edge on the player's bottom edge, so the video
 * stays whole and everything under it goes to the sheet. The arithmetic
 * is `halfSnapUnderPlayer`; this is the measuring half of it.
 *
 * **Measured, and re-measured.** Two quantities move independently and
 * each has its own channel. The viewport is `useViewportHeight` — vaul
 * re-derives its offsets from `window.innerHeight` on every render, so a
 * viewport that changes under a stale snap moves the sheet without moving
 * the player, and a phone's URL bar collapsing mid-scroll is the case
 * that finds it (`globals.css` already records that it really happens on
 * this app, in the note on `--player-avail`). The player's own box is a
 * `ResizeObserver`: a `.loft` frame resolving its ratio, or `--rail-avail`
 * moving the width cap, changes the rect without changing the window.
 *
 * **Nothing here touches the player.** It reads a rect. Re-parenting a
 * player reloads any `<iframe>` in it and remounting a `<video>`
 * restarts it at zero with `ended` rebound, which writes a watch
 * position nobody played (`.claude/rules/design-decisions.md`, watch
 * history; hako `vjPOVv5gXepgO8Io-es1m`). That holds for the re-render
 * this hook causes as much as for the first: the snap goes to the sheet,
 * which is the canvas's sibling, and `MediaShell.test.tsx` pins the
 * player's element identity across every one of these channels.
 *
 * **The snap is solved once and held for the whole of a scroll**, so
 * what it needs from the player is that measuring it later would not
 * give a different answer. The player is `position: sticky; top: 0`
 * inside the canvas on a phone (`globals.css`,
 * `[data-sheet-snap] .media-detail-player`), and the stylesheet takes
 * the host's top padding off on that surface so the wrapper starts at
 * the scrollport's own top edge — it has nowhere to travel *before* it
 * pins, which is the drift that would matter. With that padding back the
 * wrapper starts that far down and a measurement taken while scrolled
 * would put the sheet's top edge that far over the player once the
 * reader scrolled back.
 *
 * It is not motionless, though. Sticky travels only inside its
 * containing block, so a player taller than the canvas can show is
 * pulled up with the page's last line at the end of a scroll. The
 * direction is what makes that safe: the edge only ever rises, so the
 * room under it only ever grows, and a snap solved before the rise is a
 * sheet that takes less room than it could rather than one reaching over
 * the player. `e2e-layout/mobile-inspector-sheet.spec.ts` measures the
 * travel and re-solves this arithmetic from the travelled edge at every
 * viewport it draws, so a shape where the two answers actually diverge
 * is red rather than silent.
 *
 * @param playerRef The player wrapper — `.media-detail-player`, which is
 *   the box that sticks, and therefore the box that has to stay clear.
 *   It holds the action row under the frame as well as the frame, which
 *   is right: those controls are as unreachable behind the sheet as the
 *   picture is.
 * @param enabled False wherever there is nothing to measure — a desktop
 *   pane, a Markdown note, a PDF, an image — which is what falls back to
 *   the fixed fraction.
 *
 * **No file dependency, and that is measured rather than assumed.**
 * `useFileDetailData` does `setFile(null)` the moment `fileId` changes, so
 * `FileDetailContainer` returns its spinner and this whole subtree —
 * shell, canvas, player and hook — is unmounted and built again for the
 * next file. There is no state to carry across, so nothing to depend on:
 * `MediaShell.test.tsx` pins that the wrapper really is a different
 * element afterwards, which is the fact the missing dependency rests on.
 */
export function useSheetHalfSnap(
  playerRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): number {
  const viewportHeight = useViewportHeight();
  const [halfSnap, setHalfSnap] = useState(SHEET_SNAP_HALF_FALLBACK);

  useEffect(() => {
    const node = enabled ? playerRef.current : null;
    if (!node) {
      setHalfSnap(SHEET_SNAP_HALF_FALLBACK);
      return;
    }

    const measure = () => {
      const derived = halfSnapUnderPlayer({
        viewportHeight,
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

    return () => {
      // Not decoration. The effect re-runs on every viewport change and
      // on a rotation across the mobile breakpoint, and an observer left
      // behind keeps a closure over the window it was built for and goes
      // on writing the snap from it — one more of them per re-run, all
      // answering the same question differently.
      observer?.disconnect();
    };
  }, [playerRef, enabled, viewportHeight]);

  return halfSnap;
}
