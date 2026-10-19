"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { RAIL_MIN_REM } from "@/lib/layoutSizes";

const PLAYER_PEEK_PX = 48;

export interface CompanionMetrics {
  /** Visible height of whatever scrolls, published as `--rail-avail`. */
  railAvailable: number | null;
  /** The same budget minus the player's offset and peek, `--player-avail`. */
  playerAvailable: number | null;
  playerWrapperRef: React.RefObject<HTMLDivElement | null>;
  attachRailHost: (node: HTMLDivElement | null) => void;
}

/**
 * @param resolvedFileId  The id of the file that has actually *resolved*,
 *                not the id being requested: the player wrapper this measures
 *                against does not exist until the file lands.
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
  // Measured rather than asked of a container query: on iOS Safari a
  // `@container` wrapped around a <video> or a cross-origin iframe renders
  // the whole subtree rotated and spinning.
  const railHostRef = useRef<HTMLDivElement | null>(null);
  const railAvailableRef = useRef<number | null>(null);
  const playerAvailableRef = useRef<number | null>(null);
  // Reached by the callback ref below, which runs on commits the
  // measuring effect does not.
  const railObserverRef = useRef<ResizeObserver | null>(null);
  const railMeasureRef = useRef<() => void>(() => {});

  // A callback ref rather than a dependency on "does the wrapper
  // render". The wrapper appears for several independent reasons, and a
  // dependency list would have to name every one of those and would
  // eventually miss one.
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

      // The player gets a separate budget because it starts below the scroll
      // root's visible top and deliberately leaves a small peek of the title
      // below the frame.
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
