"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getStreamUrl } from "@/lib/api";
import type { MediaController } from "@/lib/mediaController";
import type { MediaSessionMetadataInput } from "@/lib/mediaSession";
import { FindOutlineLayer } from "../player/FindOutlineLayer";
import GenericLinkCard from "./GenericLinkCard";
import { getLoftPlayer } from "./playerRegistry";

interface LoftContent {
  provider: string;
  url: string;
}

type LoftState =
  | { status: "loading" }
  | { status: "content"; content: LoftContent }
  | { status: "failed" };

export interface LoftPlayerProps {
  fileId: string;
  onMediaController?: (mc: MediaController | null) => void;
  initialTime?: number;
  durationHint?: number | null;
  onEnded?: () => void;
  mediaSessionMetadata?: MediaSessionMetadataInput;
  posterUrl?: string;
}

function isLoftContent(value: unknown): value is LoftContent {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.provider === "string" &&
    candidate.provider !== "" &&
    typeof candidate.url === "string" &&
    candidate.url !== ""
  );
}

export default function LoftPlayer({
  fileId,
  onMediaController,
  initialTime,
  durationHint,
  onEnded,
  mediaSessionMetadata,
  posterUrl,
}: LoftPlayerProps) {
  const t = useTranslations("player");
  const [state, setState] = useState<LoftState>({ status: "loading" });
  const [controller, setController] = useState<MediaController | null>(null);

  const handleMediaController = useCallback(
    (mc: MediaController | null) => {
      setController(mc);
      onMediaController?.(mc);
    },
    [onMediaController],
  );

  useEffect(() => {
    let current = true;
    fetch(getStreamUrl(fileId), { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<unknown>;
      })
      .then((body) => {
        if (!current) return;
        setState(isLoftContent(body) ? { status: "content", content: body } : { status: "failed" });
      })
      .catch(() => {
        if (current) setState({ status: "failed" });
      });
    return () => {
      current = false;
    };
  }, [fileId]);

  if (state.status === "failed") {
    return (
      <div className="flex w-full flex-col items-center justify-center rounded-xl bg-bg-card py-16">
        <p className="text-sm text-danger">{t("loftReadFailed")}</p>
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div
        data-testid="loft-loading"
        className="aspect-video w-full rounded-xl bg-bg-card bg-cover bg-center"
        style={posterUrl ? { backgroundImage: `url("${posterUrl}")` } : undefined}
      />
    );
  }

  const { content } = state;
  const Player = getLoftPlayer(content.provider);
  if (!Player) {
    return <GenericLinkCard fileId={fileId} url={content.url} />;
  }

  return (
    <Player
      fileId={fileId}
      url={content.url}
      onMediaController={handleMediaController}
      initialTime={initialTime}
      durationHint={durationHint}
      onEnded={onEnded}
      mediaSessionMetadata={mediaSessionMetadata}
      posterUrl={posterUrl}
      pictureOverlay={<FindOutlineLayer controller={controller} />}
    />
  );
}
