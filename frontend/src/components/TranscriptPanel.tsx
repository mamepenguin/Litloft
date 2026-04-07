"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { useTranslations } from "next-intl";

import { getFileTranscript } from "@/lib/api";
import type { TranscriptChunkItem } from "@/lib/api";
import { formatDuration } from "@/lib/format";

interface TranscriptPanelProps {
  fileId: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

export function TranscriptPanel({ fileId, videoRef }: TranscriptPanelProps) {
  const t = useTranslations("searchIndex");
  const [chunks, setChunks] = useState<TranscriptChunkItem[]>([]);
  const [language, setLanguage] = useState("");
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setLoading(true);
    getFileTranscript(fileId).then((res) => {
      if (res.available && res.chunks && res.chunks.length > 0) {
        setChunks(res.chunks);
        setLanguage(res.language || "");
        setAvailable(true);
      } else {
        setAvailable(false);
      }
      setLoading(false);
    });
  }, [fileId]);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || chunks.length === 0) return;
    const currentTime = video.currentTime;
    const idx = chunks.findIndex(
      (c) => currentTime >= c.start && currentTime < c.end
    );
    setActiveIndex(idx);
  }, [chunks, videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => video.removeEventListener("timeupdate", handleTimeUpdate);
  }, [videoRef, handleTimeUpdate]);

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeIndex]);

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

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm text-text-muted">
        <FileText size={14} />
        <span>{t("transcriptTitle")}</span>
        {language && (
          <span className="rounded bg-bg-card px-1.5 py-0.5 text-xs">
            {language}
          </span>
        )}
        <span className="text-xs">({chunks.length})</span>
      </div>
      <div className="max-h-80 space-y-0.5 overflow-y-auto rounded-lg bg-bg-card p-2">
        {chunks.map((chunk) => (
          <button
            key={chunk.index}
            ref={chunk.index === activeIndex ? activeRef : undefined}
            onClick={() => seekTo(chunk.start)}
            className={`flex w-full cursor-pointer gap-3 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-bg-primary ${
              chunk.index === activeIndex
                ? "bg-accent/10 text-accent"
                : "text-text-primary"
            }`}
          >
            <span className="shrink-0 font-mono text-xs text-text-muted">
              {formatDuration(chunk.start)}
            </span>
            <span className="min-w-0 flex-1">{chunk.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
