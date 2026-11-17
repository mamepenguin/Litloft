import type { CSSProperties } from "react";

import { WORKBENCH_PLAYER_SHARE } from "@/lib/layoutSizes";
import type { CompanionMetrics } from "./hooks/useCompanionMetrics";

/**
 * `--rail-avail` cannot be computed in CSS: a self-scrolling pane is not the
 * viewport minus the app header.
 *
 * `--workbench-split-column` is the left column's width, which the row's top
 * reads: the row sits under the frame, so its offset is the frame's height,
 * and no selector can read a sibling's height.
 */
export function mediaHostStyle(
  metrics: Pick<CompanionMetrics, "railAvailable" | "playerAvailable">,
  share: number = WORKBENCH_PLAYER_SHARE,
  splitColumnWidth?: number | null,
): CSSProperties {
  const { railAvailable, playerAvailable } = metrics;
  return {
    ...(railAvailable != null ? { "--rail-avail": `${railAvailable}px` } : {}),
    ...(playerAvailable != null
      ? { "--player-avail": `${playerAvailable}px` }
      : {}),
    "--workbench-player-share": String(share),
    ...(splitColumnWidth != null
      ? { "--workbench-split-column": `${splitColumnWidth}px` }
      : {}),
  } as CSSProperties;
}
