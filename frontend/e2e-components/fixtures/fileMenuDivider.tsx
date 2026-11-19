/**
 * The real `FileContextMenu`, open, once as today's callers draw it and once with a
 * leading group of two rows (`#file-menu-extra`), so a case can measure the divider
 * between the group and today's rows.
 */

import type { ReactElement, ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { Ban, Star } from "lucide-react";

import { ClipboardProvider } from "@/components/ClipboardProvider";
import { FileContextMenu } from "@/components/FileContextMenu";
import { ShortcutsProvider } from "@/components/ShortcutsProvider";
import { ToastProvider } from "@/components/ToastProvider";
import enMessages from "@/messages-core/en.json";
import type { FileItem } from "@/types";

const FILE = {
  id: "fmdivider001",
  filename: "clip.mp4",
  title: "Clip",
  description: "",
  drive: "fixture",
  folder_path: "",
  file_type: "video",
  mime_type: "video/mp4",
  thumbnail_url: "",
  has_thumbnail: false,
  file_size: 10,
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
  modified_at: null,
} as unknown as FileItem;

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

function Menu({ extra }: { extra: boolean }): ReactElement {
  const props = {
    open: true,
    position: { x: 16, y: 16 },
    target: FILE,
    onClose: () => {},
    onUpdate: () => {},
    ...(extra
      ? {
          extraMenuItems: () => [
            { id: "not-interested", label: "Not interested", icon: Ban, onSelect: () => {} },
            { id: "second", label: "Second extra", icon: Star, onSelect: () => {}, disabled: true },
          ],
        }
      : {}),
  } as unknown as Parameters<typeof FileContextMenu>[0];
  return (
    <Shell>
      <FileContextMenu {...props} />
    </Shell>
  );
}

export const FILE_MENU_DIVIDER_ARRANGEMENTS: Record<string, () => ReactElement> = {
  "file-menu-today": () => <Menu extra={false} />,
  "file-menu-extra": () => <Menu extra />,
};
