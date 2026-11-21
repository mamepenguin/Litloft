/**
 * The real `FileGrid` in both layouts with `appCardMenu`, so each card's
 * computed selection style can be measured in a browser.
 */

import type { ComponentProps, ReactElement, ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";

import { ClipboardProvider } from "@/components/ClipboardProvider";
import { FileGrid } from "@/components/FileGrid";
import { ShortcutsProvider } from "@/components/ShortcutsProvider";
import { ToastProvider } from "@/components/ToastProvider";
import enMessages from "@/messages-core/en.json";
import type { FileItem } from "@/types";

function file(i: number, photo: boolean): FileItem {
  return {
    id: photo ? `photo${String(i).padStart(7, "0")}` : `video${String(i).padStart(7, "0")}`,
    filename: photo ? `shot-${i}.jpg` : `clip-${i}.mp4`,
    title: photo ? `Photo ${i}` : `Video ${i}`,
    description: "",
    drive: "fixture",
    folder_path: "Trips",
    file_type: photo ? "image" : "video",
    mime_type: photo ? "image/jpeg" : "video/mp4",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 1024,
    duration: photo ? null : 60,
    image_width: photo ? (i % 2 === 0 ? 4000 : 3000) : null,
    image_height: photo ? (i % 2 === 0 ? 3000 : 4000) : null,
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
    modified_at: null,
  } as FileItem;
}

const VIDEOS = Array.from({ length: 4 }, (_, i) => file(i, false));
const PHOTOS = Array.from({ length: 20 }, (_, i) => file(i, true));

function Shell({ children }: { children: ReactNode }): ReactElement {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ToastProvider>
        <ClipboardProvider>
          <ShortcutsProvider>{children}</ShortcutsProvider>
        </ClipboardProvider>
      </ToastProvider>
    </NextIntlClientProvider>
  );
}

function OptedGrid({ files }: { files: FileItem[] }): ReactElement {
  const props = { files, appCardMenu: true } as unknown as ComponentProps<typeof FileGrid>;
  return <FileGrid {...props} />;
}

export function FileGridAppCardMenuArrangement(): ReactElement {
  return (
    <Shell>
      <div className="flex flex-col gap-8 p-6">
        <section data-layout="cards">
          <OptedGrid files={VIDEOS} />
        </section>
        <section data-layout="justified">
          <OptedGrid files={PHOTOS} />
        </section>
      </div>
    </Shell>
  );
}

export const FILE_GRID_APP_CARD_MENU_ARRANGEMENTS = {
  "file-grid-app-card-menu": FileGridAppCardMenuArrangement,
};
