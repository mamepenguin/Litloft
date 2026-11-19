import { useEffect, useState, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { PassageList } from "@/components/search/PassageList";
import type { PassageGroup } from "@/lib/searchPassages";
import type { FileItem } from "@/types";
import enMessages from "@/messages-core/en.json";

import { FRAME, FRAME_CROP_CASES } from "../frame-crop.data";

/** A lossless frame whose red channel follows x and whose green follows y. */
function gradientFrame(): string {
  const canvas = document.createElement("canvas");
  canvas.width = FRAME.width;
  canvas.height = FRAME.height;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(FRAME.width, FRAME.height);
  for (let y = 0; y < FRAME.height; y += 1) {
    for (let x = 0; x < FRAME.width; x += 1) {
      const i = (y * FRAME.width + x) * 4;
      image.data[i] = Math.round((255 * x) / (FRAME.width - 1));
      image.data[i + 1] = Math.round((255 * y) / (FRAME.height - 1));
      image.data[i + 2] = 128;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

/** The whole small frame: one flat colour, so a crop cannot be mistaken for it. */
function flatFrame(): string {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 180;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgb(0, 0, 255)";
  ctx.fillRect(0, 0, 320, 180);
  return canvas.toDataURL("image/png");
}

function file(id: string): FileItem {
  return {
    id,
    filename: `${id}.mp4`,
    title: id,
    description: "",
    drive: "fixture",
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: null,
    has_thumbnail: false,
    file_size: 0,
    duration: 600,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    created_at: "",
    updated_at: "",
  } as unknown as FileItem;
}

function FrameCropArrangement(): ReactElement {
  const [urls, setUrls] = useState<{ small: string; large: string } | null>(null);
  useEffect(() => {
    const next = { small: flatFrame(), large: gradientFrame() };
    (window as unknown as { __frameCropSmall?: string }).__frameCropSmall = next.small;
    setUrls(next);
  }, []);
  if (!urls) return <div />;

  const groups = FRAME_CROP_CASES.map((c) => ({
    fileId: c.id,
    filename: `${c.id}.mp4`,
    fileType: "video",
    file: file(c.id),
    bestScore: 0.8,
    passages: [
      {
        kind: "screen_text",
        start: 12.48,
        end: 20,
        page: null,
        section: null,
        section_title: null,
        chunk_index: 0,
        text: "warehouse moved to Osaka",
        score: 0.8,
        keyword: true,
        highlight_terms: ["moved"],
        frame_url: urls.small,
        line_box: c.quad,
        line_match: c.match,
        line_frame_url: urls.large,
      },
    ],
  })) as unknown as PassageGroup[];

  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <main className="p-4">
        <PassageList state="listed" groups={groups} filesCount={groups.length} />
      </main>
    </NextIntlClientProvider>
  );
}

export const FRAME_CROP_ARRANGEMENTS: Record<string, () => ReactElement> = {
  "frame-crop": FrameCropArrangement,
};
