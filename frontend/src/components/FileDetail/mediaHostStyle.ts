import type { CSSProperties } from "react";

import { WORKBENCH_PLAYER_SHARE } from "@/lib/layoutSizes";
import type { CompanionMetrics } from "./hooks/useCompanionMetrics";

/**
 * `--rail-avail` cannot be computed in CSS: a self-scrolling pane is not the
 * viewport minus the app header.
 */
export function mediaHostStyle(
  metrics: Pick<CompanionMetrics, "railAvailable" | "playerAvailable">,
  scrollRoot: Element | null | undefined,
): CSSProperties {
  const { railAvailable, playerAvailable } = metrics;
  return {
    "--rail-top": scrollRoot ? "0px" : "var(--app-header-h, 0px)",
    ...(railAvailable != null ? { "--rail-avail": `${railAvailable}px` } : {}),
    ...(playerAvailable != null
      ? { "--player-avail": `${playerAvailable}px` }
      : {}),
    "--workbench-player-share": String(WORKBENCH_PLAYER_SHARE),
  } as CSSProperties;
}
