"use client";

import { useEffect, useRef, useState } from "react";

const PLAYER_PEEK_PX = 48;

export interface CompanionMetrics {
  /** Visible height of whatever scrolls, published as `--rail-avail`. */
  railAvailable: number | null;
  /** The same budget minus the player's offset and peek, `--player-avail`. */
  playerAvailable: number | null;
  playerWrapperRef: React.RefObject<HTMLDivElement | null>;
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
  const railAvailableRef = useRef<number | null>(null);
  const playerAvailableRef = useRef<number | null>(null);

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
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(pane ?? document.documentElement);
    if (playerWrapperRef.current) observer.observe(playerWrapperRef.current);
    return () => {
      observer.disconnect();
    };
    // `resolvedFileId` is here for the player wrapper, which renders on
    // every branch as soon as there is a file, so one dependency covers it.
  }, [resolvedFileId, miniPlayerRoot]);

  return { railAvailable, playerAvailable, playerWrapperRef };
}
