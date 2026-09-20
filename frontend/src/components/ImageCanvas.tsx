"use client";

import { useEffect, useRef, useState } from "react";

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
  const imageRef = useRef<HTMLImageElement | null>(null);
  const poster = file.has_thumbnail ? getThumbnailUrl(file.id) : null;

  useEffect(() => {
    setDecoded(false);
    // A cached picture can be complete before React attaches `onLoad`.
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0) setDecoded(true);
  }, [file.id]);

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
          onLoad={() => setDecoded(true)}
          style={{ opacity: decoded ? 1 : 0 }}
          className="max-h-[70vh] w-auto object-contain"
        />
      </span>
    </div>
  );
}
