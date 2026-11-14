"use client";

import { useEffect, useRef, useState } from "react";

const WORKBENCH_ROW_SELECTOR = ".media-detail-workbench-row";
const BESIDE_SELECTOR = '[data-row-beside="on"]';
/** The host's `mt-4` above the workbench and its `p-4` bottom padding. */
const ROW_BLOCK_EXTRA_REM = 2;

export interface CompanionMetrics {
  /** Visible height of whatever scrolls, published as `--rail-avail`. */
  railAvailable: number | null;
  /** The visible height minus the player's offset and the row under it, `--player-avail`. */
  playerAvailable: number | null;
  playerWrapperRef: React.RefObject<HTMLDivElement | null>;
}

function rootFontSize(): number {
  return (
    Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  );
}

/**
 * The room the toggle row takes under the frame. Zero when the row is not in
 * the flow under the player: it is absent, or it sits beside the frame.
 */
function rowBlockPx(row: HTMLElement | null): number {
  if (!row || row.closest(BESIDE_SELECTOR)) return 0;
  return row.offsetHeight + ROW_BLOCK_EXTRA_REM * rootFontSize();
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
    const scope: ParentNode & Node = pane ?? document;
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

    let observedRow: HTMLElement | null = null;
    let observer: ResizeObserver | null = null;
    // The row mounts and unmounts with the panels and the toggles, which can
    // happen after this effect has run. Its element is looked up on every
    // measure, and the observer follows whichever element is current.
    const followRow = (): HTMLElement | null => {
      const row = scope.querySelector<HTMLElement>(WORKBENCH_ROW_SELECTOR);
      if (row === observedRow) return row;
      if (observedRow) observer?.unobserve(observedRow);
      if (row) observer?.observe(row);
      observedRow = row;
      return row;
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

      publishAvailable(available);
      const player = playerWrapperRef.current;
      const scrollOffset = pane ? pane.scrollTop : window.scrollY;
      const row = followRow();
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
                rowBlockPx(row),
            )
          : null,
      );
    };

    measure();
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(measure);
      observer.observe(pane ?? document.documentElement);
      if (playerWrapperRef.current) observer.observe(playerWrapperRef.current);
      followRow();
    }

    // A row that mounts or unmounts changes no observed size, so the subtree
    // is watched for it. The callback measures only when the row element has
    // changed, so unrelated DOM changes cost one query.
    let mutationObserver: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined") {
      mutationObserver = new MutationObserver(() => {
        const current = scope.querySelector<HTMLElement>(WORKBENCH_ROW_SELECTOR);
        if (current !== observedRow) measure();
      });
      mutationObserver.observe(scope, { childList: true, subtree: true });
    }

    return () => {
      observer?.disconnect();
      mutationObserver?.disconnect();
    };
    // `resolvedFileId` is here for the player wrapper, which renders on
    // every branch as soon as there is a file, so one dependency covers it.
  }, [resolvedFileId, miniPlayerRoot]);

  return { railAvailable, playerAvailable, playerWrapperRef };
}
