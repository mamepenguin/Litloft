"use client";

import { useEffect, useRef, useState } from "react";

import { getStreamUrl, getThumbnailUrl } from "@/lib/api";
import type { MediaController } from "@/lib/mediaController";
import { createMediaChannel } from "@/lib/nativeMedia";
import { createNativeShellController } from "@/lib/nativeMediaController";
import type { FileItem } from "@/types";

export interface ShellAudio {
  /** Null in a browser, where the caller keeps its element. */
  mc: MediaController | null;
  failed: boolean;
}

/**
 * Plays a file through the iOS shell rather than a media element, so it keeps
 * going when the app is off screen.
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
): ShellAudio {
  // Keyed by file: after the file changes, the previous controller is still in
  // state for one render, and handing it out would let the new file's
  // progress read the old file's position.
  const [owned, setOwned] = useState<{ fileId: string; mc: MediaController } | null>(null);
  const [failedFileId, setFailedFileId] = useState<string | null>(null);

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

    channel.onEnded = () => endedRef.current?.();
    // Autoplay waits for the resume decision, or playback starts at zero and
    // the restored position lands a moment later.
    // A play that lands after the file changed is dropped: the channel sends
    // nothing once unloaded.
    channel.onReady = () => {
      void Promise.resolve(readyRef.current?.()).then(() => {
        if (autoPlayRef.current) channel.play();
      });
    };
    channel.onFailed = () => setFailedFileId(file.id);
    channel.load({
      // The shell hands this to AVPlayer, which has no page to resolve it
      // against.
      url: new URL(getStreamUrl(file.id), window.location.origin).toString(),
      ...labelRef.current,
      artworkUrl: new URL(getThumbnailUrl(file.id), window.location.origin).toString(),
    });
    setOwned({ fileId: file.id, mc: createNativeShellController(channel) });

    return () => {
      channel.onEnded = null;
      channel.onReady = null;
      channel.onFailed = null;
      channel.unload();
      channel.dispose();
      setOwned(null);
    };
  }, [file.id]);

  return {
    mc: owned?.fileId === file.id ? owned.mc : null,
    failed: failedFileId === file.id,
  };
}
