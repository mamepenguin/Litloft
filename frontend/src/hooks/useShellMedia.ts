"use client";

import { useEffect, useRef, useState } from "react";

import { getStreamUrl, getThumbnailUrl } from "@/lib/api";
import type { MediaController } from "@/lib/mediaController";
import type { MediaKind } from "@/lib/nativeBridge";
import { createMediaChannel, type MediaChannel } from "@/lib/nativeMedia";
import { createNativeShellController } from "@/lib/nativeMediaController";

export interface ShellMediaFile {
  id: string;
  kind: MediaKind;
  /** What the lock screen shows. */
  title: string;
  artist: string;
}

export interface ShellMedia {
  /** Null in a browser, where the caller keeps its element. */
  mc: MediaController | null;
  /** The same file's channel, for what a controller has no words for. */
  channel: MediaChannel | null;
  failed: boolean;
  waiting: boolean;
}

/**
 * Plays a file through the iOS shell rather than a media element, so it keeps
 * going when the app is off screen.
 */
export function useShellMedia(
  file: ShellMediaFile,
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
): ShellMedia {
  // Keyed by file: after the file changes, the previous controller is still in
  // state for one render, and handing it out would let the new file's
  // progress read the old file's position.
  const [owned, setOwned] = useState<{
    fileId: string;
    mc: MediaController;
    channel: MediaChannel;
  } | null>(null);
  const [failedFileId, setFailedFileId] = useState<string | null>(null);
  const [waitingFileId, setWaitingFileId] = useState<string | null>(null);

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
  labelRef.current = { title: file.title, artist: file.artist };

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
    channel.onWaitingChange = (waiting) => setWaitingFileId(waiting ? file.id : null);
    channel.load({
      // The shell hands this to AVPlayer, which has no page to resolve it
      // against.
      url: new URL(getStreamUrl(file.id), window.location.origin).toString(),
      ...labelRef.current,
      artworkUrl: new URL(getThumbnailUrl(file.id), window.location.origin).toString(),
    }, file.kind);
    setOwned({ fileId: file.id, mc: createNativeShellController(channel), channel });

    return () => {
      channel.onEnded = null;
      channel.onReady = null;
      channel.onFailed = null;
      channel.onWaitingChange = null;
      setFailedFileId(null);
      setWaitingFileId(null);
      channel.unload();
      channel.dispose();
      setOwned(null);
    };
  }, [file.id, file.kind]);

  const current = owned?.fileId === file.id ? owned : null;
  return {
    mc: current?.mc ?? null,
    channel: current?.channel ?? null,
    failed: failedFileId === file.id,
    waiting: waitingFileId === file.id,
  };
}
