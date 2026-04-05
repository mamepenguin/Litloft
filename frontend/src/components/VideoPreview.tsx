"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { getPreviewUrl } from "@/lib/api";

const FRAME_COUNT = 8;
const FRAME_INTERVAL_MS = 400;
const HOVER_DELAY_MS = 200;
const LONG_PRESS_MS = 500;
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

interface VideoPreviewProps {
  fileId: string;
}

export function VideoPreview({ fileId }: VideoPreviewProps) {
  if (!SAFE_ID.test(fileId)) return null;
  const [isHovering, setIsHovering] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [spriteLoaded, setSpriteLoaded] = useState(false);

  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const longPressActiveRef = useRef(false);
  const hoverStartRef = useRef(0);
  const activeRef = useRef(false);

  const spriteUrl = getPreviewUrl(fileId);

  const clearAllTimers = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (frameTimerRef.current) {
      clearInterval(frameTimerRef.current);
      frameTimerRef.current = null;
    }
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const stopAnimation = useCallback(() => {
    activeRef.current = false;
    clearAllTimers();
    setIsHovering(false);
    setIsAnimating(false);
    setCurrentFrame(0);
    longPressActiveRef.current = false;
  }, [clearAllTimers]);

  const startFrameAnimation = useCallback(() => {
    setIsAnimating(true);
    setCurrentFrame(0);
    frameTimerRef.current = setInterval(() => {
      setCurrentFrame((prev) => (prev + 1) % FRAME_COUNT);
    }, FRAME_INTERVAL_MS);
  }, []);

  const startPreload = useCallback(() => {
    activeRef.current = true;
    hoverStartRef.current = Date.now();
    setIsHovering(true);

    if (spriteLoaded) {
      hoverTimerRef.current = setTimeout(() => {
        if (activeRef.current) startFrameAnimation();
      }, HOVER_DELAY_MS);
      return;
    }

    const img = new Image();
    imageRef.current = img;
    img.onload = () => {
      setSpriteLoaded(true);
      if (!activeRef.current) return;
      const elapsed = Date.now() - hoverStartRef.current;
      const remaining = Math.max(0, HOVER_DELAY_MS - elapsed);
      hoverTimerRef.current = setTimeout(() => {
        if (activeRef.current) startFrameAnimation();
      }, remaining);
    };
    img.onerror = () => {
      // Sprite sheet not available; silently do nothing
    };
    img.src = spriteUrl;
  }, [spriteLoaded, spriteUrl, startFrameAnimation]);

  const handleMouseEnter = useCallback(() => {
    startPreload();
  }, [startPreload]);

  const handleMouseLeave = useCallback(() => {
    stopAnimation();
  }, [stopAnimation]);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      longPressActiveRef.current = false;
      longPressTimerRef.current = setTimeout(() => {
        longPressActiveRef.current = true;
        e.preventDefault();
        startPreload();
      }, LONG_PRESS_MS);
    },
    [startPreload]
  );

  const handleTouchMove = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (longPressActiveRef.current) {
      stopAnimation();
    }
  }, [stopAnimation]);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (longPressActiveRef.current) {
        e.preventDefault();
      }
      stopAnimation();
    },
    [stopAnimation]
  );

  useEffect(() => {
    return () => {
      clearAllTimers();
    };
  }, [clearAllTimers]);

  const backgroundPositionX =
    FRAME_COUNT > 1
      ? `${(currentFrame / (FRAME_COUNT - 1)) * 100}%`
      : "0%";

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
      {isAnimating && spriteLoaded && (
        <div
          className="absolute inset-0 z-[1]"
          data-testid="video-preview-overlay"
          style={{
            backgroundImage: `url(${spriteUrl})`,
            backgroundSize: "800% 100%",
            backgroundPosition: `${backgroundPositionX} 0%`,
            backgroundRepeat: "no-repeat",
          }}
        />
      )}
    </div>
  );
}
