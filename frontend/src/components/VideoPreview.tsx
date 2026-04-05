"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { getStreamUrl } from "@/lib/api";

const HOVER_DELAY_MS = 200;
const LONG_PRESS_MS = 500;

// Shared mute state across all cards (YouTube-style)
let globalMuted = true;
const muteListeners = new Set<(muted: boolean) => void>();
function setGlobalMuted(muted: boolean) {
  globalMuted = muted;
  for (const listener of muteListeners) {
    listener(muted);
  }
}

// Singleton: only one preview plays at a time
let activeStopFn: (() => void) | null = null;

interface VideoPreviewProps {
  fileId: string;
}

export function VideoPreview({ fileId }: VideoPreviewProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(globalMuted);
  const [hasError, setHasError] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);

  const activeRef = useRef(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressActiveRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Sync global mute state
  useEffect(() => {
    const listener = (m: boolean) => setMuted(m);
    muteListeners.add(listener);
    return () => { muteListeners.delete(listener); };
  }, []);

  const clearTimers = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const stopPreview = useCallback(() => {
    activeRef.current = false;
    clearTimers();
    longPressActiveRef.current = false;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute("src");
      videoRef.current.load();
    }
    setIsPlaying(false);
  }, [clearTimers]);

  const startPreview = useCallback(() => {
    // Stop any other active preview
    if (activeStopFn && activeStopFn !== stopPreview) {
      activeStopFn();
    }
    activeStopFn = stopPreview;
    activeRef.current = true;
    setHasError(false);

    hoverTimerRef.current = setTimeout(() => {
      if (!activeRef.current) return;
      setIsPlaying(true);
    }, HOVER_DELAY_MS);
  }, [stopPreview]);

  const handleMouseEnter = useCallback(() => {
    startPreview();
  }, [startPreview]);

  const handleMouseLeave = useCallback(() => {
    stopPreview();
    if (activeStopFn === stopPreview) activeStopFn = null;
  }, [stopPreview]);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      longPressActiveRef.current = false;
      longPressTimerRef.current = setTimeout(() => {
        longPressActiveRef.current = true;
        e.preventDefault();
        startPreview();
      }, LONG_PRESS_MS);
    },
    [startPreview]
  );

  const handleTouchMove = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (longPressActiveRef.current) {
      stopPreview();
      if (activeStopFn === stopPreview) activeStopFn = null;
    }
  }, [stopPreview]);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (longPressActiveRef.current) {
        e.preventDefault();
      }
      stopPreview();
      if (activeStopFn === stopPreview) activeStopFn = null;
    },
    [stopPreview]
  );

  const handleMuteToggle = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setGlobalMuted(!globalMuted);
  }, []);

  const handleVideoError = useCallback(() => {
    setHasError(true);
    setIsPlaying(false);
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (video && video.duration && !isSeeking) {
      setProgress(video.currentTime / video.duration);
    }
  }, [isSeeking]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const video = videoRef.current;
    if (!video || !video.duration) return;

    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    video.currentTime = ratio * video.duration;
    setProgress(ratio);
  }, []);

  const seekCleanupRef = useRef<(() => void) | null>(null);

  const handleSeekStart = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsSeeking(true);
    handleSeek(e);

    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const onMove = (ev: MouseEvent) => {
      const video = videoRef.current;
      if (!video || !video.duration) return;
      const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      video.currentTime = ratio * video.duration;
      setProgress(ratio);
    };
    const cleanup = () => {
      setIsSeeking(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", cleanup);
      seekCleanupRef.current = null;
    };
    seekCleanupRef.current = cleanup;
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", cleanup);
  }, [handleSeek]);

  useEffect(() => {
    return () => {
      clearTimers();
      seekCleanupRef.current?.();
      if (activeStopFn === stopPreview) activeStopFn = null;
    };
  }, [clearTimers, stopPreview]);

  if (hasError) {
    return (
      <div
        className="absolute inset-0"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      />
    );
  }

  return (
    <div
      className="absolute inset-0"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      data-testid="video-preview-container"
    >
      {isPlaying && (
        <>
          <video
            ref={videoRef}
            className="absolute inset-0 z-[1] h-full w-full object-cover"
            src={getStreamUrl(fileId)}
            muted={muted}
            autoPlay
            playsInline
            onTimeUpdate={handleTimeUpdate}
            onError={handleVideoError}
            data-testid="video-preview-player"
          />
          <button
            onClick={handleMuteToggle}
            className="absolute top-2 right-2 z-[2] rounded-full bg-black/60 p-1.5 text-white transition-opacity hover:bg-black/80"
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
          {/* Seek bar - tall hit area, bar floats above bottom */}
          <div
            className="absolute bottom-0 left-0 right-0 z-[2] h-8 cursor-pointer group/seek"
            onMouseDown={handleSeekStart}
            onTouchStart={(e) => { e.stopPropagation(); handleSeek(e); }}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            <div className="absolute bottom-1.5 left-1 right-1 h-[3px] rounded-full bg-white/30 transition-[height] group-hover/seek:h-1.5">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
