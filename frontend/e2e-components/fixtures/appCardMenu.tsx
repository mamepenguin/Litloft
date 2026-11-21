/**
 * The real `VideoCard` and `ReadingCard` with the page's file menu attached,
 * so the touch behaviour and the card's computed selection styles can be
 * measured in a browser.
 */

import type { ReactElement, ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";

import { ClipboardProvider } from "@/components/ClipboardProvider";
import { ShortcutsProvider } from "@/components/ShortcutsProvider";
import { ToastProvider } from "@/components/ToastProvider";
import {
  CardFileMenuProvider,
  useCardFileMenu,
} from "@/components/appshell/CardFileMenu";
import { ReadingCard } from "@/components/readingapp/ReadingCard";
import { VideoCard } from "@/components/videoapp/VideoCard";
import enMessages from "@/messages-core/en.json";
import type { ShelfItem } from "@/lib/api";

function item(id: string, title: string, fileType: "video" | "document"): ShelfItem {
  return {
    id,
    filename: fileType === "video" ? `${id}.mp4` : `${id}.pdf`,
    title,
    description: "",
    drive: "fixture",
    folder_path: "Shelf",
    file_type: fileType,
    mime_type: fileType === "video" ? "video/mp4" : "application/pdf",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 1,
    duration: fileType === "video" ? 120 : null,
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
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    modified_at: null,
  };
}

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

function Cards(): ReactElement {
  const cards = useCardFileMenu({ scope: "fixture", hasProfile: true, continueListKeys: [] });
  return (
    <CardFileMenuProvider value={cards.context}>
      <div className="flex flex-col gap-8 p-6">
        <VideoCard
          item={item("vid001", "A video card", "video")}
          fileMenu={{ listKey: "grid" }}
        />
        <ReadingCard
          item={item("book001", "A reading card", "document")}
          drive="fixture"
          fileMenu={{ listKey: "grid" }}
        />
      </div>
      {cards.menu}
    </CardFileMenuProvider>
  );
}

export function AppCardMenuArrangement(): ReactElement {
  return (
    <Shell>
      <Cards />
    </Shell>
  );
}

export const APP_CARD_MENU_ARRANGEMENTS = {
  "app-card-menu": AppCardMenuArrangement,
};
