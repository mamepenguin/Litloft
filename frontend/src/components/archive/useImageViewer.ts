"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getArchiveEntryUrl } from "@/lib/api";
import type { ArchiveEntry } from "@/types";
import type { ArchiveViewMode } from "./archiveUtils";

interface ImageViewerResult {
  imageIndex: number;
  setImageIndex: React.Dispatch<React.SetStateAction<number>>;
  imageLoading: boolean;
  setImageLoading: React.Dispatch<React.SetStateAction<boolean>>;
  playing: boolean;
  setPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  slideshowInterval: number;
  setSlideshowInterval: React.Dispatch<React.SetStateAction<number>>;
  showControls: boolean;
  setShowControls: React.Dispatch<React.SetStateAction<boolean>>;
  handleImageAreaClick: () => void;
}

export function useImageViewer(
  viewMode: ArchiveViewMode,
  imageEntries: ArchiveEntry[],
  fileId: string,
  onClose: () => void
): ImageViewerResult {
  const [imageIndex, setImageIndex] = useState(0);
  const [imageLoading, setImageLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [slideshowInterval, setSlideshowInterval] = useState(5);
  const [showControls, setShowControls] = useState(true);
  const hideTimerRef = useRef<number | null>(null);

  // Wrap onClose to also reset image viewer state
  const closeViewer = useCallback(() => {
    setPlaying(false);
    setShowControls(true);
    onClose();
  }, [onClose]);

  // Set loading state when image changes
  useEffect(() => {
    if (viewMode === "image") {
      setImageLoading(true);
    }
  }, [viewMode, imageIndex]);

  // Image viewer: prefetch
  useEffect(() => {
    if (viewMode !== "image" || imageEntries.length === 0) return;

    const prefetchIndices = [
      imageIndex - 1,
      imageIndex + 1,
      imageIndex - 2,
      imageIndex + 2,
    ].filter((i) => i >= 0 && i < imageEntries.length && i !== imageIndex);

    prefetchIndices.forEach((i) => {
      const img = new Image();
      img.src = getArchiveEntryUrl(fileId, imageEntries[i].path);
    });
  }, [viewMode, imageIndex, imageEntries, fileId]);

  // Image viewer: slideshow timer
  useEffect(() => {
    if (!playing || viewMode !== "image" || imageEntries.length <= 1) return;

    const timer = window.setTimeout(() => {
      setImageIndex((prev) =>
        prev >= imageEntries.length - 1 ? 0 : prev + 1
      );
    }, slideshowInterval * 1000);

    return () => window.clearTimeout(timer);
  }, [playing, imageIndex, slideshowInterval, imageEntries.length, viewMode]);

  // Image viewer: keyboard
  useEffect(() => {
    if (viewMode !== "image") return;

    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          e.stopPropagation();
          setImageIndex((prev) => (prev > 0 ? prev - 1 : prev));
          break;
        case "ArrowRight":
          e.preventDefault();
          e.stopPropagation();
          setImageIndex((prev) =>
            prev < imageEntries.length - 1 ? prev + 1 : prev
          );
          break;
        case "Escape":
          e.preventDefault();
          e.stopPropagation();
          closeViewer();
          break;
        case " ":
          e.preventDefault();
          if (imageEntries.length > 1) {
            setPlaying((p) => !p);
          }
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [viewMode, imageEntries.length, closeViewer]);

  // Auto-hide controls during slideshow
  useEffect(() => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (playing && viewMode === "image") {
      hideTimerRef.current = window.setTimeout(
        () => setShowControls(false),
        3000
      );
    }
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, [playing, imageIndex, viewMode]);

  const handleImageAreaClick = useCallback(() => {
    setShowControls((prev) => !prev);
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (playing) {
      hideTimerRef.current = window.setTimeout(
        () => setShowControls(false),
        3000
      );
    }
  }, [playing]);

  return {
    imageIndex,
    setImageIndex,
    imageLoading,
    setImageLoading,
    playing,
    setPlaying,
    slideshowInterval,
    setSlideshowInterval,
    showControls,
    setShowControls,
    handleImageAreaClick,
  };
}
