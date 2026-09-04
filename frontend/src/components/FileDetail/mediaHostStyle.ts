import type { CSSProperties } from "react";

import type { CompanionMetrics } from "./hooks/useCompanionMetrics";

/**
 * The measured budgets, as CSS custom properties on the media host.
 *
 * Both layouts publish exactly this, from one place, because both read
 * them back from `globals.css` and neither can see what the other set:
 *
 * - `--rail-avail` — the visible height of whatever scrolls. Bounds the
 *   rail beside the player *and* the box below it, so it survives the
 *   companion becoming an inspector tab. It cannot be computed in CSS:
 *   a self-scrolling pane is not the viewport minus the app header.
 * - `--player-avail` — that budget minus the player's own offset and a
 *   peek of what follows. Nothing to do with the companion; it is what
 *   stops a 16:9 frame running off the bottom of a short window.
 * - `--rail-top` — where the sticky rail may start. Zero inside a pane
 *   that scrolls itself, the header's height when the document does.
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
  } as CSSProperties;
}
