"use client";

import { useCallback, useEffect, useRef } from "react";

import { subscribeToShell } from "./nativeBridge";

export interface EmbedVideoSize {
  width: number;
  height: number;
}

/** A message is whatever the shell sent, whatever its type says. */
function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * The picture's size in a YouTube embed, as the shell last reported it. The
 * frame is another origin, so only the shell can read it, and only once the
 * video has loaded: until then the reader answers null.
 *
 * The reader is not state, so a size that arrives changes nothing on screen;
 * it is asked at the moment something needs it.
 */
export function useEmbedVideoSize(videoId: string | null): () => EmbedVideoSize | null {
  const size = useRef<EmbedVideoSize | null>(null);

  useEffect(() => {
    size.current = null;
    if (videoId === null) return;
    return subscribeToShell((message) => {
      if (message.type !== "embed.size" || message.videoId !== videoId) return;
      if (!positive(message.width) || !positive(message.height)) return;
      size.current = { width: message.width, height: message.height };
    });
  }, [videoId]);

  return useCallback(() => size.current, []);
}
