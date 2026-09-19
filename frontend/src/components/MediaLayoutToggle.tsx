"use client";

import { PanelBottom, PanelRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { useMediaLayoutPreference } from "@/lib/mediaLayout";

/**
 * Whether it is shown at all is a CSS decision — the container query in
 * `globals.css` reveals it only where the rail can actually fit.
 */
interface MediaLayoutToggleProps {
  /**
   * False on the shell, where "beside" means an inspector tab: the inspector
   * is already there, so gating the button would only strand the reader in
   * whichever form they were last in.
   */
  railGated?: boolean;
  /**
   * On the shell, pressing beside with the inspector closed moves the panel
   * somewhere the reader cannot see. The host uses this to open the inspector.
   */
  onBeside?: () => void;
}

export function MediaLayoutToggle({
  railGated = false,
  onBeside,
}: MediaLayoutToggleProps) {
  const t = useTranslations("file");
  const [layout, setLayout] = useMediaLayoutPreference();
  const beside = layout === "beside";

  // The icon shows what pressing it does, not the state it is in.
  const Icon = beside ? PanelBottom : PanelRight;
  const label = beside ? t("layoutStack") : t("layoutBeside");

  return (
    <button
      type="button"
      onClick={() => {
        setLayout(beside ? "stacked" : "beside");
        if (!beside) onBeside?.();
      }}
      aria-pressed={beside}
      title={label}
      aria-label={label}
      className={`${railGated ? "media-detail-layout-toggle" : "inline-flex"} h-9 w-9 items-center justify-center rounded-lg border border-bg-border bg-bg-card text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring`}
    >
      <Icon size={16} />
    </button>
  );
}
