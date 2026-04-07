"use client";

import { useCallback, useEffect, useState } from "react";
import { Film } from "lucide-react";
import { useTranslations } from "next-intl";

import { getClipTimestamps, getFrameUrl } from "@/lib/api";
import type { ClipTimestampItem } from "@/lib/api";
import { formatDuration } from "@/lib/format";

interface ClipFramesPanelProps {
  fileId: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

const INITIAL_SHOW = 20;

export function ClipFramesPanel({ fileId, videoRef }: ClipFramesPanelProps) {
  const t = useTranslations("searchIndex");
  const [timestamps, setTimestamps] = useState<ClipTimestampItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(false);
  const [showCount, setShowCount] = useState(INITIAL_SHOW);

  useEffect(() => {
    setLoading(true);
    getClipTimestamps(fileId).then((res) => {
      if (res.available && res.timestamps && res.timestamps.length > 0) {
        setTimestamps(res.timestamps);
        setAvailable(true);
      } else {
        setAvailable(false);
      }
      setLoading(false);
    });
  }, [fileId]);

  const seekTo = useCallback(
    (time: number) => {
      const video = videoRef.current;
      if (video) {
        video.currentTime = time;
      }
    },
    [videoRef]
  );

  if (loading || !available) return null;

  const visible = timestamps.slice(0, showCount);
  const hasMore = timestamps.length > showCount;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm text-text-muted">
        <Film size={14} />
        <span>{t("clipTitle")}</span>
        <span className="text-xs">({timestamps.length})</span>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
        {visible.map((ts) => (
          <button
            key={ts.start}
            onClick={() => seekTo(ts.start)}
            className="group cursor-pointer overflow-hidden rounded-lg bg-bg-card transition-colors hover:ring-2 hover:ring-accent"
          >
            <img
              src={getFrameUrl(fileId, ts.start)}
              alt={ts.content_preview}
              loading="lazy"
              className="aspect-video w-full object-cover"
            />
            <div className="px-1.5 py-1 text-center text-xs text-text-muted group-hover:text-accent">
              {formatDuration(ts.start)}
            </div>
          </button>
        ))}
      </div>
      {hasMore && (
        <button
          onClick={() => setShowCount((c) => c + INITIAL_SHOW)}
          className="mt-2 w-full cursor-pointer rounded-lg bg-bg-card py-1.5 text-center text-sm text-text-muted transition-colors hover:text-text-primary"
        >
          {t("showMore")} (+{Math.min(INITIAL_SHOW, timestamps.length - showCount)})
        </button>
      )}
    </div>
  );
}
