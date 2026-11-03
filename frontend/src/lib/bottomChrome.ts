/**
 * What owns the bottom of the screen right now. The upload drawer reads it to
 * stay clear of the mini-player and the mobile inspector's bar.
 */

import { useSyncExternalStore } from "react";

import { SHEET_PEEK_PX } from "./sheetSnap";

export type InspectorSheetState = "none" | "peek" | "half" | "full";

export interface BottomChrome {
  miniPlayer: boolean;
  sheet: InspectorSheetState;
}

/** Must stay in step with the mini-player's `h-[180px]` class. */
export const MINI_PLAYER_HEIGHT_PX = 180;
/** The gap the mini-player keeps above the viewport's bottom edge. */
export const MINI_PLAYER_GAP_PX = 16;

let state: BottomChrome = { miniPlayer: false, sheet: "none" };
const listeners = new Set<() => void>();

function publish(next: BottomChrome) {
  if (next.miniPlayer === state.miniPlayer && next.sheet === state.sheet) return;
  state = next;
  for (const listener of listeners) listener();
}

export function setMiniPlayerShown(shown: boolean) {
  publish({ ...state, miniPlayer: shown });
}

export function setInspectorSheetState(sheet: InspectorSheetState) {
  publish({ ...state, sheet });
}

export function subscribeBottomChrome(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getBottomChrome(): BottomChrome {
  return state;
}

const INITIAL_CHROME: BottomChrome = { miniPlayer: false, sheet: "none" };
const PEEK_OFFSET = `calc(${SHEET_PEEK_PX}px + env(safe-area-inset-bottom, 0px))`;

/** The drawer's bottom offset, above whichever of the two is higher. */
export function bottomChromeOffset(chrome: BottomChrome): string | undefined {
  const offsets: string[] = [];
  if (chrome.sheet === "peek") offsets.push(PEEK_OFFSET);
  if (chrome.miniPlayer) {
    offsets.push(
      `calc(env(safe-area-inset-bottom, 0px) + ${
        MINI_PLAYER_HEIGHT_PX + MINI_PLAYER_GAP_PX
      }px)`,
    );
  }
  if (offsets.length === 0) return undefined;
  return offsets.length === 1 ? offsets[0] : `max(${offsets.join(", ")})`;
}

export function useBottomChrome(): BottomChrome {
  return useSyncExternalStore(
    subscribeBottomChrome,
    getBottomChrome,
    () => INITIAL_CHROME,
  );
}
