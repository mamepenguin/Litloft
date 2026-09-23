"use client";

import { useTranslations } from "next-intl";

import { useShortcuts } from "@/hooks/useShortcuts";
import { KEY_ZOOM_STEP } from "@/hooks/useViewerZoom";
import { OVERLAY_PRIORITY } from "@/lib/shortcuts";

export function useViewerZoomShortcuts(
  zoom: { zoomBy: (factor: number) => void; reset: () => void },
  enabled: boolean,
) {
  const t = useTranslations("shortcuts");
  useShortcuts(
    "viewer-zoom",
    t("zoom"),
    [
      { key: "=", label: t("zoomIn"), handler: () => zoom.zoomBy(KEY_ZOOM_STEP) },
      // Shift+= on a US layout. Hidden: the cheat sheet splits chords on "+".
      {
        key: "+",
        label: t("zoomIn"),
        hidden: true,
        handler: () => zoom.zoomBy(KEY_ZOOM_STEP),
      },
      { key: "-", label: t("zoomOut"), handler: () => zoom.zoomBy(1 / KEY_ZOOM_STEP) },
      { key: "0", label: t("zoomFit"), handler: zoom.reset },
    ],
    enabled,
    // The viewer's own tier, which it keeps from everything below.
    OVERLAY_PRIORITY,
  );
}
