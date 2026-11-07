"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

import { useFindMarks } from "./FileDetail/find/FindContext";
import { getStreamUrl, getThumbnailUrl } from "@/lib/api";
import type { FindRow } from "@/lib/fileFind";
import type { FileItem } from "@/types";

interface PaintedRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function isQuad(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === 8 &&
    value.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

function rowQuads(row: FindRow): number[][] {
  const boxes = (row as FindRow & { boxes?: unknown }).boxes;
  return Array.isArray(boxes) ? boxes.filter(isQuad) : [];
}

function quadKey(quad: number[]): string {
  return quad.join(",");
}

function paintedRect(image: HTMLImageElement): PaintedRect | null {
  const box = image.getBoundingClientRect();
  const naturalWidth = image.naturalWidth;
  const naturalHeight = image.naturalHeight;
  if (!(naturalWidth > 0 && naturalHeight > 0)) return null;
  if (!(box.width > 0 && box.height > 0)) return null;
  const scale = Math.min(box.width / naturalWidth, box.height / naturalHeight);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  return {
    left: (box.width - width) / 2,
    top: (box.height - height) / 2,
    width,
    height,
  };
}

function FindBoxPolygon({ quad, current }: { quad: number[]; current: boolean }) {
  const points: string[] = [];
  for (let i = 0; i < quad.length; i += 2) {
    points.push(`${quad[i]},${quad[i + 1]}`);
  }
  return (
    <polygon
      data-find-box={current ? "current" : "mark"}
      className={current ? "find-box find-box-current" : "find-box"}
      points={points.join(" ")}
    />
  );
}

function FindBoxLayer({
  imageRef,
  painted,
}: {
  imageRef: RefObject<HTMLImageElement | null>;
  painted: boolean;
}) {
  const { term, currentRow, rows } = useFindMarks();
  const [rect, setRect] = useState<PaintedRect | null>(null);

  const outlines = useMemo(() => {
    if (term === null) return null;
    const seen = new Map<string, number[]>();
    for (const row of rows) {
      for (const quad of rowQuads(row)) {
        const key = quadKey(quad);
        if (!seen.has(key)) seen.set(key, quad);
      }
    }
    if (seen.size === 0) return null;
    const currentKeys = new Set(
      currentRow ? rowQuads(currentRow).map(quadKey) : [],
    );
    const marks: number[][] = [];
    const currents: number[][] = [];
    for (const [key, quad] of seen) {
      if (currentKeys.has(key)) currents.push(quad);
      else marks.push(quad);
    }
    return { marks, currents };
  }, [term, rows, currentRow]);

  useEffect(() => {
    if (!painted || !outlines) {
      setRect(null);
      return;
    }
    const image = imageRef.current;
    if (!image) {
      setRect(null);
      return;
    }
    const update = () => setRect(paintedRect(image));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(image);
    return () => observer.disconnect();
  }, [painted, outlines, imageRef]);

  if (!painted || !outlines || !rect) return null;

  return (
    <svg
      data-find-boxes=""
      aria-hidden="true"
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      style={{
        position: "absolute",
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        pointerEvents: "none",
      }}
    >
      {outlines.marks.map((quad, index) => (
        <FindBoxPolygon key={`mark-${index}`} quad={quad} current={false} />
      ))}
      {outlines.currents.map((quad, index) => (
        <FindBoxPolygon key={`current-${index}`} quad={quad} current />
      ))}
    </svg>
  );
}

/**
 * The picture at its own size, with the thumbnail held under it until the
 * full one has decoded.
 *
 * Two layers rather than one background on the picture itself: a format the
 * browser decodes slowly paints inside its own box before it has anything
 * to show, and a background on that box is behind whatever it paints.
 */
export function ImageCanvas({ file }: { file: FileItem }) {
  const [decoded, setDecoded] = useState(false);
  const [paintedId, setPaintedId] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const currentId = useRef(file.id);
  const poster =
    file.has_thumbnail && paintedId !== file.id ? getThumbnailUrl(file.id) : null;

  // `load` can fire before an async-decoded picture is paintable, so the
  // thumbnail under it is dropped only once `decode()` says it is. Dropped
  // at all because a transparent picture shows the thumbnail through it.
  const awaitPaint = useCallback((image: HTMLImageElement, id: string) => {
    if (typeof image.decode !== "function") return;
    image.decode().then(
      () => {
        if (currentId.current === id) setPaintedId(id);
      },
      () => {},
    );
  }, []);

  useEffect(() => {
    currentId.current = file.id;
    setDecoded(false);
    setPaintedId(null);
    // A cached picture can be complete before React attaches `onLoad`.
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0) {
      setDecoded(true);
      awaitPaint(image, file.id);
    }
  }, [file.id, awaitPaint]);

  return (
    <div
      className="flex w-full items-center justify-center overflow-hidden rounded-xl bg-bg-card"
    >
      <span
        data-image-canvas=""
        className="relative inline-flex"
        style={
          poster
            ? {
                backgroundImage: `url("${poster}")`,
                backgroundSize: "contain",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
              }
            : undefined
        }
      >
        <img
          ref={imageRef}
          src={getStreamUrl(file.id)}
          alt={file.title}
          // The box is where the picture from the listing card lands, so it
          // has to be its final size before the full one arrives.
          width={file.image_width ?? undefined}
          height={file.image_height ?? undefined}
          // Off the main thread: a 24MP photo decoded inline stalls the
          // frame the transition is animating in.
          decoding="async"
          onLoad={(event) => {
            setDecoded(true);
            awaitPaint(event.currentTarget, file.id);
          }}
          style={{ opacity: decoded ? 1 : 0 }}
          className="max-h-[70vh] w-auto object-contain"
        />
        <FindBoxLayer imageRef={imageRef} painted={paintedId === file.id} />
      </span>
    </div>
  );
}
