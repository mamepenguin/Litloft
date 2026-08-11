"use client";

import { useEffect, useState } from "react";
import { getStreamUrl } from "@/lib/api";
import type { MediaController } from "@/lib/mediaController";
import type { MediaSessionMetadataInput } from "@/lib/mediaSession";
import GenericLinkCard from "./GenericLinkCard";
import { getLoftPlayer } from "./playerRegistry";

interface LoftContent {
  provider: string;
  url: string;
}

export interface LoftPlayerProps {
  fileId: string;
  onMediaController?: (mc: MediaController | null) => void;
  /** Forwarded to the resolved embed component (citation jump). */
  initialTime?: number;
  /** Forwarded to the resolved embed component (see LoftEmbedProps). */
  durationHint?: number | null;
  /**
   * Forwarded to the resolved embed component. Providers that cannot
   * observe completion never call it (see LoftEmbedProps.onEnded).
   */
  onEnded?: () => void;
  /** Forwarded to the resolved embed component (see LoftEmbedProps). */
  mediaSessionMetadata?: MediaSessionMetadataInput;
}

export default function LoftPlayer({
  fileId,
  onMediaController,
  initialTime,
  durationHint,
  onEnded,
  mediaSessionMetadata,
}: LoftPlayerProps) {
  const [content, setContent] = useState<LoftContent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(getStreamUrl(fileId), { credentials: "include" })
      .then((res) => res.json())
      .then(setContent)
      .catch(() => setError("Failed to read .loft file"));
  }, [fileId]);

  if (error) {
    return (
      <div className="flex w-full flex-col items-center justify-center rounded-xl bg-bg-card py-16">
        <p className="text-sm text-danger">{error}</p>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="flex w-full items-center justify-center rounded-xl bg-bg-card py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  const Player = getLoftPlayer(content.provider);
  if (!Player) {
    return <GenericLinkCard fileId={fileId} url={content.url} />;
  }

  return (
    <Player
      fileId={fileId}
      url={content.url}
      onMediaController={onMediaController}
      initialTime={initialTime}
      durationHint={durationHint}
      onEnded={onEnded}
      mediaSessionMetadata={mediaSessionMetadata}
    />
  );
}
