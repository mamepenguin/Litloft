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
interface MediaLayoutToggleProps {
  /**
   * Hide the button unless a rail can actually fit beside the player.
   *
   * True on the legacy stack, where "beside" means a second grid column
   * and a narrow host has nowhere to put it — a control that does
   * nothing when pressed is worse than no control. False on the shell,
   * where "beside" means an inspector tab: the inspector is a fixed
   * column that is already there, so both forms are reachable at every
   * width and gating the button would only strand the reader in
   * whichever one they were last in.
   */
  railGated?: boolean;
}

export function MediaLayoutToggle({ railGated = false }: MediaLayoutToggleProps) {
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
      className={`${railGated ? "media-detail-layout-toggle" : "inline-flex"} h-9 w-9 items-center justify-center rounded-lg border border-bg-border bg-bg-card text-text-muted shadow-sm transition-colors hover:bg-bg-elevated hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring`}
    >
      <Icon size={16} />
    </button>
  );
}
