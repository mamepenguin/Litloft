"use client";

import { useEffect } from "react";

import type { MediaController } from "@/lib/mediaController";
import { useCaptionsPreference } from "../MediaControls/hooks/useCaptionsPreference";

/**
 * A `<track default>` added to an element that already has tracks is set
 * to showing by the browser, whatever mode the viewer left the old ones
 * in. The element's track set changes under a file whose subtitles arrive
 * with its metadata, so the choice has to be asserted again there or
 * captions come back on by themselves.
 *
 * Subscribed only while Litloft draws the controls. Under the browser's
 * own controls the captions choice is made there, and asserting a stored
 * preference over it would undo it.
 */
export function useReassertCaptions(
  video: HTMLVideoElement | null,
  mc: MediaController | null,
): void {
  const [captionsPreferred] = useCaptionsPreference();

  useEffect(() => {
    if (!video || !mc || captionsPreferred === null) return;
    const tracks = video.textTracks;
    if (typeof tracks.addEventListener !== "function") return;

    let scheduled: ReturnType<typeof setTimeout> | null = null;
    const reassert = () => {
      if (scheduled !== null) return;
      // Measured in Chromium: at `addtrack`, and through the microtask
      // behind it, the new track is still `disabled`. The browser applies
      // `default` in a task of its own, so anything sooner reads the mode
      // the track is about to leave.
      scheduled = setTimeout(() => {
        scheduled = null;
        const state = mc.getCaptions?.();
        if (state !== "on" && state !== "off") return;
        if ((state === "on") === captionsPreferred) return;
        try {
          mc.setCaptions?.(captionsPreferred);
        } catch {
          // Backend gone; the next one gets the preference on mount.
        }
      }, 0);
    };

    tracks.addEventListener("addtrack", reassert);
    return () => {
      if (scheduled !== null) clearTimeout(scheduled);
      tracks.removeEventListener("addtrack", reassert);
    };
  }, [video, mc, captionsPreferred]);
}
