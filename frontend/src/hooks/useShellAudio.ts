"use client";

import { useEffect, useRef, useState } from "react";

import { getStreamUrl, getThumbnailUrl } from "@/lib/api";
import type { MediaController } from "@/lib/mediaController";
import { createMediaChannel } from "@/lib/nativeMedia";
import { createNativeShellController } from "@/lib/nativeMediaController";
import type { FileItem } from "@/types";

/**
 * Plays a file through the iOS shell rather than a media element, so it keeps
 * going when the app is off screen. Returns null in a browser, where the
 * caller keeps its element.
 */
export function useShellAudio(
  file: FileItem,
  { autoPlay, onEnded }: { autoPlay: boolean; onEnded?: () => void },
): MediaController | null {
  // Keyed by file: after the file changes, the previous controller is still in
  // state for one render, and handing it out would let the new file's
  // progress read the old file's position.
  const [owned, setOwned] = useState<{ fileId: string; mc: MediaController } | null>(null);

  // Read at the moment the file runs out rather than captured at load, so a
  // changing handler does not tear the player down.
  const endedRef = useRef(onEnded);
  endedRef.current = onEnded;
  const autoPlayRef = useRef(autoPlay);
  autoPlayRef.current = autoPlay;

  const title = file.title || file.filename;
  const artist = file.folder_path || file.drive;

  useEffect(() => {
    const channel = createMediaChannel();
    if (!channel) return;

    channel.onEnded = () => endedRef.current?.();
    channel.load({
      // The shell hands this to AVPlayer, which has no page to resolve it
      // against.
      url: new URL(getStreamUrl(file.id), window.location.origin).toString(),
      title,
      artist,
      artworkUrl: new URL(getThumbnailUrl(file.id), window.location.origin).toString(),
    });
    if (autoPlayRef.current) channel.play();

    setOwned({ fileId: file.id, mc: createNativeShellController(channel) });

    return () => {
      channel.onEnded = null;
      channel.unload();
      channel.dispose();
      setOwned(null);
    };
  }, [file.id, title, artist]);

  return owned?.fileId === file.id ? owned.mc : null;
}
