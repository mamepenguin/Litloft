/**
 * The real VideoCard, twice: once with a byline long enough to overflow its
 * line, once without. Both cards hold the same title, so their heights differ
 * only by the byline.
 */

import type { ReactElement } from "react";

import { VideoCard } from "@/components/videoapp/VideoCard";
import type { ShelfItem } from "@/lib/api";
import { BYLINE, TITLE } from "../videoCardByline.data";

const DRIVE = "fixture";

function video(id: string): ShelfItem {
  return {
    id,
    filename: `${id}.mp4`,
    title: TITLE,
    description: "",
    drive: DRIVE,
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 1024,
    duration: 60,
    image_width: null,
    image_height: null,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier: "verified",
    trust_reviewed_at: null,
    created_at: "2026-01-01T00:00:00",
    updated_at: "2026-01-01T00:00:00",
  };
}

export function VideoCardBylineArrangement(): ReactElement {
  return (
    <div id="video-card-byline-host" className="bg-bg-primary p-4">
      <ul className="grid grid-cols-2 gap-3">
        <li data-case="with" className="min-w-0">
          <VideoCard item={video("with-byline")} byline={BYLINE} />
        </li>
        <li data-case="without" className="min-w-0">
          <VideoCard item={video("without-byline")} />
        </li>
      </ul>
    </div>
  );
}
