"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const PLAYER_PEEK_PX = 48;

/**
 * Width at which the companion may sit beside the player, in rem:
 * 552px player + 384px rail + 24px gap. Kept in rem, and resolved
 * against the root font size when measured, so a viewer who scales
 * text gets the layout these numbers were chosen for. Must stay in
 * step with the `[data-media-width="wide"]` rules in `globals.css`.
 */
const RAIL_MIN_REM = 60;

export interface CompanionMetrics {
  /** Visible height of whatever scrolls, published as `--rail-avail`. */
  railAvailable: number | null;
  /** The same budget minus the player's offset and peek, `--player-avail`. */
  playerAvailable: number | null;
  /** Attach to the player wrapper so its offset can be measured. */
  playerWrapperRef: React.RefObject<HTMLDivElement | null>;
  /** Callback ref for the element `data-media-width` is written onto. */
  attachRailHost: (node: HTMLDivElement | null) => void;
}

/**
 * The measuring half of the media detail layout.
 *
 * Two budgets and one attribute, all derived from live sizes rather
 * than breakpoints, and all published to CSS rather than to React —
 * see the comments inside for why each one is measured the way it is.
 * Lifted out of `FileDetailContent` unchanged: the `@container`
 * avoidance and the `flex-basis: 0%` workaround it encodes were paid
 * for on real devices (`DESIGN.md` §8.5, hako 7bFYOh3vFZP9EEuf9Ym_5),
 * so this is a move, not a rewrite.
 *
 * @param resolvedFileId  The id of the file that has actually *resolved*,
 *                not the id being requested. The two differ for the whole
 *                of the first fetch, and the player wrapper this measures
 *                against does not exist until the file lands — depending
 *                on the requested id would run the effect once, before
 *                there was anything to observe, and never again.
 * @param miniPlayerRoot  The host's scroll container, or null/undefined
 *                when the document scrolls.
 */
export function useCompanionMetrics(
  resolvedFileId: string | undefined,
  miniPlayerRoot: Element | null | undefined,
): CompanionMetrics {
  // How tall the rail may be: the visible height of whatever scrolls.
  // Measured rather than computed, because the two hosts do not differ
  // by a knowable amount — the right pane carries its own header row on
  // top of the app header, and only it knows that.
  const [railAvailable, setRailAvailable] = useState<number | null>(null);
  const [playerAvailable, setPlayerAvailable] = useState<number | null>(null);
  const playerWrapperRef = useRef<HTMLDivElement>(null);
  // Whether this host is wide enough for the rail form. Measured rather
  // than asked of a container query: `@container` establishes a
  // containment context, and on iOS Safari one wrapped around a <video>
  // or a cross-origin iframe renders the whole subtree rotated and
  // spinning. Confirmed on device 2026-08-12 by removing that one word;
  // no desktop browser shows it. hako 7bFYOh3vFZP9EEuf9Ym_5.
  //
  // A viewport breakpoint is still wrong for the same reason it always
  // was — this renders both full-width and inside the 2-pane right pane
  // — so the question stays "how wide is this element", only the way of
  // answering it changes.
  //
  // Written straight onto the node rather than held in state: the
  // layout is decided entirely in CSS from the attribute, the same way
  // `lib/mediaLayout.ts` drives `data-media-layout`. Nothing has to
  // re-render for the columns to change, so a window drag costs no
  // React work at all.
  const railHostRef = useRef<HTMLDivElement | null>(null);
  // Both budgets are recomputed on every resize frame and usually come
  // back unchanged; the guards keep an identical value from being
  // dispatched sixty times a second during a drag.
  const railAvailableRef = useRef<number | null>(null);
  const playerAvailableRef = useRef<number | null>(null);
  // Reached by the callback ref below, which runs on commits the
  // measuring effect does not.
  const railObserverRef = useRef<ResizeObserver | null>(null);
  const railMeasureRef = useRef<() => void>(() => {});

  // A callback ref rather than a dependency on "does the wrapper
  // render". The wrapper appears for several independent reasons — the
  // file resolving, an addon publishing `player-side`, chapters
  // answering, the Knowledge editor policy settling — and `getFile`
  // routinely wins the race against the addon catalogue, so the effect
  // would run while this is still null and never look again. A
  // dependency list would have to name every one of those and would
  // eventually miss one; this fires exactly when the node arrives,
  // whatever brought it.
  const attachRailHost = useCallback((node: HTMLDivElement | null) => {
    const previous = railHostRef.current;
    if (previous && railObserverRef.current) {
      railObserverRef.current.unobserve(previous);
    }
    railHostRef.current = node;
    if (!node) return;
    railObserverRef.current?.observe(node);
    // The observer reports a first size on its own, but only where one
    // exists: a fixed-height right pane may never resize again, which
    // would leave the attribute unset until the window changed.
    railMeasureRef.current();
  }, []);

  useEffect(() => {
    const pane = miniPlayerRoot ?? null;
    const publishAvailable = (value: number) => {
      if (value === railAvailableRef.current) return;
      railAvailableRef.current = value;
      setRailAvailable(value);
    };
    const publishPlayerAvailable = (value: number | null) => {
      if (value === playerAvailableRef.current) return;
      playerAvailableRef.current = value;
      setPlayerAvailable(value);
    };
    const measure = () => {
      let available: number;
      let visibleTop: number;
      if (pane) {
        available = pane.clientHeight;
        visibleTop = pane.getBoundingClientRect().top;
      } else {
        const header = Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            "--app-header-h",
          ),
        );
        visibleTop = Number.isFinite(header) ? header : 0;
        available = window.innerHeight - visibleTop;
      }

      // Keep the C-1 rail budget unchanged. The player gets a separate
      // budget because it starts below the scroll root's visible top and
      // deliberately leaves a small peek of the title below the frame.
      publishAvailable(available);
      const player = playerWrapperRef.current;
      const scrollOffset = pane ? pane.scrollTop : window.scrollY;
      publishPlayerAvailable(
        player
          ? Math.max(
              0,
              available -
                Math.max(
                  0,
                  player.getBoundingClientRect().top -
                    visibleTop +
                    scrollOffset,
                ) -
                PLAYER_PEEK_PX,
            )
          : null,
      );

      const host = railHostRef.current;
      if (!host) return;
      const rootFontSize =
        Number.parseFloat(getComputedStyle(document.documentElement).fontSize) ||
        16;
      host.dataset.mediaWidth =
        host.clientWidth >= RAIL_MIN_REM * rootFontSize ? "wide" : "narrow";
    };
    railMeasureRef.current = measure;
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    railObserverRef.current = observer;
    observer.observe(pane ?? document.documentElement);
    if (playerWrapperRef.current) observer.observe(playerWrapperRef.current);
    // Safe to observe the element this callback writes an attribute to:
    // the attribute only re-columns the grid *inside* it, while the
    // wrapper itself stays full-width. Nothing it sets can change what
    // it measures, so there is no resize loop to converge.
    //
    // Attached here as well as in the callback ref: whichever of the
    // two runs second finds the other already done, and re-observing an
    // element a ResizeObserver already watches is a no-op.
    if (railHostRef.current) observer.observe(railHostRef.current);
    return () => {
      observer.disconnect();
      railObserverRef.current = null;
    };
    // `resolvedFileId` is here for the *player* wrapper, which renders
    // on every branch as soon as there is a file, so one dependency
    // covers it exactly. The rail host does not rely on it — its callback ref
    // covers every reason that wrapper can appear, including an addon
    // publishing `player-side` after the file has already resolved.
  }, [resolvedFileId, miniPlayerRoot]);

  return { railAvailable, playerAvailable, playerWrapperRef, attachRailHost };
}
