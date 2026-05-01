"use client";

/**
 * Phase 0 minimum: a registered second provider that exercises the
 * playerRegistry abstraction. Intentionally does NOT publish a
 * MediaController — Vimeo's postMessage protocol would need extra
 * plumbing (or @vimeo/player) to expose imperative play/pause/seek,
 * and pressuring the registry to handle a player that opts out of
 * onMediaController is the whole point of N=2.
 *
 * Phase 1+ may upgrade this to use Vimeo's Player API once an Import
 * addon owns Vimeo metadata extraction.
 */

import { useMemo } from "react";
import type { LoftEmbedProps } from "./types";

const VIMEO_HOSTS = new Set([
  "vimeo.com",
  "www.vimeo.com",
  "player.vimeo.com",
]);

export function extractVimeoId(url: string): string | null {
  // Matches the path forms:
  //   /123456789                                       (vimeo.com)
  //   /channels/staffpicks/123456789                   (vimeo.com)
  //   /groups/abc/videos/123456789                     (vimeo.com)
  //   /video/123456789                                 (player.vimeo.com)
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!VIMEO_HOSTS.has(parsed.hostname)) return null;
  const patterns = [
    /^\/video\/(\d+)/,
    /^\/(?:channels\/[\w-]+\/|groups\/[\w-]+\/videos\/)?(\d+)/,
  ];
  for (const re of patterns) {
    const m = parsed.pathname.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

export default function VimeoEmbed({ url }: LoftEmbedProps) {
  const videoId = useMemo(() => extractVimeoId(url), [url]);

  if (!videoId) return null;

  const src = `https://player.vimeo.com/video/${videoId}`;

  return (
    <div
      className="relative w-full overflow-hidden bg-black md:rounded-xl"
      style={{ paddingTop: "56.25%" }}
    >
      <iframe
        src={src}
        title="Vimeo player"
        className="absolute inset-0 h-full w-full border-0"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}
