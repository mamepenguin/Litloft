"use client";

import { PanelBottom, PanelRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { useMediaLayoutPreference } from "@/lib/mediaLayout";

/**
 * Swaps the companion region between beside the player and below it.
 *
 * Whether it is shown at all is a CSS decision — the container query in
 * `globals.css` reveals it only where the rail can actually fit, since
 * a button that does nothing when pressed is worse than no button. The
 * host still decides whether to render it: audio never gets the rail,
 * and neither does a file whose companion slot has no occupant.
 *
 * Spec: docs/superpowers/specs/2026-08-11-media-layout-toggle.md
 */
export function MediaLayoutToggle() {
  const t = useTranslations("file");
  const [layout, setLayout] = useMediaLayoutPreference();
  const beside = layout === "beside";

  // The icon shows what pressing it does, not the state it is in.
  const Icon = beside ? PanelBottom : PanelRight;
  const label = beside ? t("layoutStack") : t("layoutBeside");

  return (
    <button
      type="button"
      onClick={() => setLayout(beside ? "stacked" : "beside")}
      aria-pressed={beside}
      title={label}
      aria-label={label}
      className="media-detail-layout-toggle h-9 w-9 items-center justify-center rounded-lg border border-bg-border bg-bg-card text-text-muted shadow-sm transition-colors hover:bg-bg-elevated hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
    >
      <Icon size={16} />
    </button>
  );
}
