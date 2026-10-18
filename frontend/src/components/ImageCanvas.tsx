"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getStreamUrl, getThumbnailUrl } from "@/lib/api";
import type { FileItem } from "@/types";

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
      </span>
    </div>
  );
}
