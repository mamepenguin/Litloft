"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { getArchiveEntryUrl } from "@/lib/api";
import { useShortcuts } from "@/hooks/useShortcuts";
import type { ArchiveEntry } from "@/types";
import {
  useAutoHidingChrome,
  type AutoHidingChrome,
} from "@/hooks/useAutoHidingChrome";
import { useSpreadPaging } from "@/hooks/useSpreadPaging";
import { useSpreadFits } from "@/hooks/useSpreadFits";
import { useNeighbourOrientation } from "@/hooks/useNeighbourOrientation";
import { readSpreadMode, writeSpreadMode } from "@/lib/spreadPreference";
import type { Orientation, SpreadFace } from "@/lib/spreadPaging";
import type { ArchiveViewMode } from "./archiveUtils";

function readLocalString<T extends string>(key: string, def: T): T {
  try {
    return (localStorage.getItem(key) as T | null) ?? def;
  } catch {
    return def;
  }
}

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
  showChrome: () => void;
  setChromeHeld: React.Dispatch<React.SetStateAction<boolean>>;
  face: SpreadFace;
  faceLabel: string;
  subPageLabel: "A" | "B" | null;
  canGoPrev: boolean;
  canGoNext: boolean;
  rememberOrientation: (index: number, orientation: Orientation) => void;
  handleImageAreaClick: () => void;
  chromeProps: AutoHidingChrome["chromeProps"];
  spreadMode: boolean;
  setSpreadMode: React.Dispatch<React.SetStateAction<boolean>>;
  readingDirection: "ltr" | "rtl";
  setReadingDirection: React.Dispatch<React.SetStateAction<"ltr" | "rtl">>;
  isCurrentLandscape: boolean;
  setIsCurrentLandscape: React.Dispatch<React.SetStateAction<boolean>>;
  showRightHalf: boolean;
  navigatePrev: () => void;
  navigateNext: () => void;
}

export function useImageViewer(
  viewMode: ArchiveViewMode,
  imageEntries: ArchiveEntry[],
  fileId: string,
  onClose: () => void,
): ImageViewerResult {
  const [imageIndex, setImageIndex] = useState(0);
  const [imageLoading, setImageLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [slideshowInterval, setSlideshowInterval] = useState(5);
  const [chromeHeld, setChromeHeld] = useState(false);
  const chrome = useAutoHidingChrome({
    enabled: viewMode === "image",
    held: chromeHeld,
  });

  const [spreadMode, setSpreadMode] = useState(() => readSpreadMode());
  const [readingDirection, setReadingDirection] = useState<"ltr" | "rtl">(() =>
    readLocalString("image-viewer:reading-direction", "ltr"),
  );
  const [isCurrentLandscape, setIsCurrentLandscape] = useState(false);
  const [showRightHalf, setShowRightHalf] = useState(false);

  const readingDirectionRef = useRef(readingDirection);

  useEffect(() => {
    try {
      writeSpreadMode(spreadMode);
    } catch {}
    setShowRightHalf(readingDirectionRef.current === "rtl");
  }, [spreadMode]);

  useEffect(() => {
    try {
      localStorage.setItem("image-viewer:reading-direction", readingDirection);
    } catch {}
    readingDirectionRef.current = readingDirection;
    setShowRightHalf(readingDirection === "rtl");
  }, [readingDirection]);

  const canPair = useSpreadFits();

  /**
   * A zip entry has no stored dimensions, so the next page's shape has to be
   * fetched. Exactly one is: a reader flipping through a long book must not
   * pull the book down behind them.
   */
  const nextEntry = imageEntries[imageIndex + 1];
  const nextOrientation = useNeighbourOrientation(
    spreadMode && canPair && nextEntry
      ? getArchiveEntryUrl(fileId, nextEntry.path)
      : null,
  );
  /**
   * A two-entry lookup — this page and the prefetched next — cannot answer
   * about a page *behind* the reader, and turning back has to: `pageBack`
   * asks whether the previous index pairs.
   */
  const [orientations, setOrientations] = useState<Record<number, Orientation>>(
    {},
  );

  useEffect(() => {
    setOrientations({});
  }, [imageEntries]);

  const rememberOrientation = useCallback((i: number, o: Orientation) => {
    setOrientations((prev) => (prev[i] === o ? prev : { ...prev, [i]: o }));
  }, []);

  useEffect(() => {
    if (nextOrientation !== "unknown") {
      rememberOrientation(imageIndex + 1, nextOrientation);
    }
  }, [imageIndex, nextOrientation, rememberOrientation]);

  const orientationAt = useCallback(
    (i: number): Orientation => {
      const measured = orientations[i];
      if (measured) return measured;
      // Not "portrait". `isCurrentLandscape` reads `false` before the page
      // has loaded, and collapsing the answer in the direction that *pairs*
      // is how a spread gets drawn and then taken away mid-load.
      if (i === imageIndex && isCurrentLandscape) return "landscape";
      if (i === imageIndex + 1) return nextOrientation;
      return "unknown";
    },
    [orientations, imageIndex, isCurrentLandscape, nextOrientation],
  );

  const paging = useSpreadPaging({
    index: imageIndex,
    setIndex: setImageIndex,
    count: imageEntries.length,
    spreadMode,
    readingDirection,
    showRightHalf,
    orientationAt,
    canPair,
    setShowRightHalf,
  });
  const { navigatePrev, navigateNext } = paging;

  const closeViewer = useCallback(() => {
    setPlaying(false);
    chrome.show();
    onClose();
  }, [chrome, onClose]);

  useEffect(() => {
    if (viewMode === "image") {
      setImageLoading(true);
    }
  }, [viewMode, imageIndex]);

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

  useEffect(() => {
    if (!playing || viewMode !== "image" || imageEntries.length <= 1) return;

    const timer = window.setTimeout(() => {
      if (paging.canGoNext) {
        paging.navigateNext();
      } else {
        setImageIndex(0);
        setShowRightHalf(readingDirection === "rtl");
      }
    }, slideshowInterval * 1000);

    return () => window.clearTimeout(timer);
  }, [
    playing,
    imageIndex,
    slideshowInterval,
    imageEntries.length,
    viewMode,
    // The two values it uses, not the object that holds them:
    // `useSpreadPaging` returns a fresh literal every render, so depending
    // on it would tear down and rearm the timer on each one.
    paging.canGoNext,
    paging.navigateNext,
    readingDirection,
  ]);

  const tsc = useTranslations("shortcuts");

  const navigatePrevRef = useRef<() => void>(() => {});
  const navigateNextRef = useRef<() => void>(() => {});
  navigatePrevRef.current = navigatePrev;
  navigateNextRef.current = navigateNext;

  useShortcuts(
    "archive-image-viewer",
    tsc("archiveViewer"),
    [
      {
        key: "arrowleft",
        label: tsc("prevImage"),
        handler: () =>
          readingDirectionRef.current === "ltr"
            ? navigatePrevRef.current()
            : navigateNextRef.current(),
      },
      {
        key: "arrowright",
        label: tsc("nextImage"),
        handler: () =>
          readingDirectionRef.current === "ltr"
            ? navigateNextRef.current()
            : navigatePrevRef.current(),
      },
      { key: "escape", label: tsc("close"), handler: closeViewer },
      {
        key: "space",
        label: tsc("slideshow"),
        handler: () => {
          if (imageEntries.length > 1) setPlaying((p) => !p);
        },
      },
    ],
    viewMode === "image",
  );

  return {
    imageIndex,
    setImageIndex,
    imageLoading,
    setImageLoading,
    playing,
    setPlaying,
    slideshowInterval,
    setSlideshowInterval,
    showControls: chrome.visible,
    showChrome: chrome.show,
    setChromeHeld,
    handleImageAreaClick: chrome.toggle,
    chromeProps: chrome.chromeProps,
    spreadMode,
    setSpreadMode,
    readingDirection,
    setReadingDirection,
    isCurrentLandscape,
    setIsCurrentLandscape,
    showRightHalf,
    navigatePrev,
    navigateNext,
    face: paging.face,
    faceLabel: paging.faceLabel,
    subPageLabel: paging.subPageLabel,
    canGoPrev: paging.canGoPrev,
    canGoNext: paging.canGoNext,
    rememberOrientation,
  };
}
