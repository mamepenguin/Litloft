"use client";

import type { MutableRefObject } from "react";
import { useTranslations } from "next-intl";

import { useShortcuts } from "@/hooks/useShortcuts";
import type { MediaController } from "@/lib/mediaController";

/** `fullscreenToggle` is the frame's own toggle where it has one. */
export function useVideoShortcuts(
  mc: MediaController | null,
  fullscreenToggle: MutableRefObject<(() => void) | null>,
): void {
  const tShortcuts = useTranslations("shortcuts");

  useShortcuts("video-player", tShortcuts("videoPlayer"), [
    {
      key: "space",
      label: tShortcuts("play"),
      handler: () => mc?.togglePlay(),
    },
    {
      key: "arrowleft",
      label: tShortcuts("seekBack10"),
      handler: () => mc?.seek(mc.getCurrentTime() - 10),
    },
    {
      key: "arrowright",
      label: tShortcuts("seekForward10"),
      handler: () => mc?.seek(mc.getCurrentTime() + 10),
    },
    {
      key: "arrowup",
      label: tShortcuts("seekForward60"),
      handler: () => mc?.seek(mc.getCurrentTime() + 60),
    },
    {
      key: "arrowdown",
      label: tShortcuts("seekBack60"),
      handler: () => mc?.seek(mc.getCurrentTime() - 60),
    },
    {
      key: "m",
      label: tShortcuts("mute"),
      handler: () => mc?.toggleMute(),
    },
    {
      key: "f",
      label: tShortcuts("fullscreen"),
      handler: () => {
        const toggle = fullscreenToggle.current;
        if (toggle) toggle();
        else mc?.toggleFullscreen();
      },
    },
  ]);
}
