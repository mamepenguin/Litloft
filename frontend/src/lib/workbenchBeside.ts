import { COMPACT_MAX_WIDTH } from "@/components/player/MediaControls/layout";

import {
  WORKBENCH_PLAYER_FOCUS_SHARE,
  WORKBENCH_PLAYER_SHARE,
  WORKBENCH_ROW_BESIDE_REM,
} from "./layoutSizes";

export function besideFrameWidth(
  canvasWidth: number,
  visibleHeight: number,
): number {
  const at = (share: number) => (visibleHeight * share * 16) / 9;
  return Math.max(
    Math.min(canvasWidth, at(WORKBENCH_PLAYER_FOCUS_SHARE)),
    Math.min(canvasWidth, COMPACT_MAX_WIDTH, at(WORKBENCH_PLAYER_SHARE)),
  );
}

/** The Show panels beside the player button at the coarse size, plus one gap. */
export const WORKBENCH_SPLIT_BUTTON_REM = 3.25;

export function isRowBeside(
  canvasWidth: number,
  visibleHeight: number | null,
  rootFontSize: number,
  splitButton = false,
): boolean {
  if (visibleHeight == null) return false;
  const sideSpace =
    canvasWidth - besideFrameWidth(canvasWidth, visibleHeight) - rootFontSize;
  const threshold =
    WORKBENCH_ROW_BESIDE_REM + (splitButton ? WORKBENCH_SPLIT_BUTTON_REM : 0);
  return sideSpace >= threshold * rootFontSize;
}
