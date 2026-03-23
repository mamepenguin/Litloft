"use client";

import { getStreamUrl } from "@/lib/api";

export function VideoPlayer({ videoId }: { videoId: number }) {
  return (
    <div className="w-full overflow-hidden rounded-xl bg-black">
      <video
        src={getStreamUrl(videoId)}
        controls
        playsInline
        preload="metadata"
        className="w-full"
      >
        お使いのブラウザは動画再生に対応していません。
      </video>
    </div>
  );
}
