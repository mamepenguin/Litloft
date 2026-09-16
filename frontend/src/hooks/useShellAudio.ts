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
  {
    autoPlay,
    onEnded,
    onReady,
  }: {
    autoPlay: boolean;
    onEnded?: () => void;
    /** Settles once the resume point, if any, has been applied. */
    onReady?: () => Promise<void>;
  },
): MediaController | null {
  // Keyed by file: after the file changes, the previous controller is still in
  // state for one render, and handing it out would let the new file's
  // progress read the old file's position.
  const [owned, setOwned] = useState<{ fileId: string; mc: MediaController } | null>(null);

  // Read at the moment the file runs out rather than captured at load, so a
  // changing handler does not tear the player down.
  const endedRef = useRef(onEnded);
  endedRef.current = onEnded;
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  const autoPlayRef = useRef(autoPlay);
  autoPlayRef.current = autoPlay;

  // Read when the file loads rather than listed as dependencies: renaming the
  // file being listened to must not reload it.
  const labelRef = useRef({ title: "", artist: "" });
  labelRef.current = {
    title: file.title || file.filename,
    artist: file.folder_path || file.drive,
  };

  useEffect(() => {
    const channel = createMediaChannel();
    if (!channel) return;
    // The resume read is a round trip; the file can change while it is out,
    // and the shell has one player, so a late play would start the next file.
    let current = true;

    channel.onEnded = () => endedRef.current?.();
    // Autoplay waits for the resume decision, or playback starts at zero and
    // the restored position lands a moment later.
    channel.onReady = () => {
      void Promise.resolve(readyRef.current?.()).then(() => {
        if (current && autoPlayRef.current) channel.play();
      });
    };
    channel.load({
      // The shell hands this to AVPlayer, which has no page to resolve it
      // against.
      url: new URL(getStreamUrl(file.id), window.location.origin).toString(),
      ...labelRef.current,
      artworkUrl: new URL(getThumbnailUrl(file.id), window.location.origin).toString(),
    });
    setOwned({ fileId: file.id, mc: createNativeShellController(channel) });

    return () => {
      current = false;
      channel.onEnded = null;
      channel.onReady = null;
      channel.unload();
      channel.dispose();
      setOwned(null);
    };
  }, [file.id]);

  return owned?.fileId === file.id ? owned.mc : null;
}
