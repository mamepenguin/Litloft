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

export function isRowBeside(
  canvasWidth: number,
  visibleHeight: number | null,
  rootFontSize: number,
): boolean {
  if (visibleHeight == null) return false;
  const sideSpace =
    canvasWidth - besideFrameWidth(canvasWidth, visibleHeight) - rootFontSize;
  return sideSpace >= WORKBENCH_ROW_BESIDE_REM * rootFontSize;
}
