"use client";

import { useMemo } from "react";
import {
  ClipboardCopy,
  Download,
  ExternalLink,
  ListMusic,
  Move,
  Pencil,
  Scissors,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { getDownloadUrl } from "@/lib/api";
import type { MenuItem } from "@/components/ContextMenu";
import type { FileItem } from "@/types";
import { useClipboard } from "@/components/ClipboardProvider";

/**
 * The order is fixed here so the same action is in the same place
 * wherever the menu is opened — muscle memory is the whole value of a
 * context menu.
 */
export interface FileMenuContext {
  onOpenInNewTab?: () => void;
  onEdit?: () => void;
  onAddToCollection: () => void;
  onStartInlineRename?: () => void;
  onRename: () => void;
  onMove: () => void;
  onRemoveFromHistory?: () => void;
  onTrash: () => void;
}

export function useFileMenuItems(
  file: FileItem | null,
  ctx: FileMenuContext,
): MenuItem[] {
  const tc = useTranslations("common");
  const tf = useTranslations("file");
  const tcb = useTranslations("clipboard");
  const tt = useTranslations("trash");
  const clipboard = useClipboard();

  return useMemo(() => {
    if (!file) return [];

    // A file the scanner can no longer find still has a row, tags and
    // history, but its bytes are gone: the stream answers 410 and a
    // copy would paste a path to nothing. Those entries stay in place
    // and go grey rather than vanishing, so the menu keeps its shape.
    const gone = file.missing_since !== null;

    const items: MenuItem[] = [];

    if (ctx.onOpenInNewTab) {
      items.push({
        icon: ExternalLink,
        label: tf("openInNewTab"),
        onClick: ctx.onOpenInNewTab,
      });
    }
    if (ctx.onEdit) {
      items.push({ icon: SquarePen, label: tf("edit"), onClick: ctx.onEdit });
    }

    items.push(
      {
        icon: Download,
        label: tc("download"),
        onClick: () => window.open(getDownloadUrl(file.id), "_blank"),
        disabled: gone,
      },
      {
        icon: ListMusic,
        label: tf("addToCollection"),
        onClick: ctx.onAddToCollection,
      },
      {
        icon: ClipboardCopy,
        label: tcb("copy"),
        onClick: () => clipboard.copy([file.id], file.drive, file.folder_path),
        disabled: gone,
      },
      {
        icon: Scissors,
        label: tcb("cut"),
        onClick: () => clipboard.cut([file.id], file.drive, file.folder_path),
        disabled: gone,
      },
      {
        icon: Pencil,
        label: tc("rename"),
        // Branch on the prop's presence: `onStartInlineRename?.() ?? …`
        // would open the dialog as well, since a void handler returns
        // undefined.
        onClick: () =>
          ctx.onStartInlineRename ? ctx.onStartInlineRename() : ctx.onRename(),
      },
      { icon: Move, label: tc("move"), onClick: ctx.onMove },
    );

    if (ctx.onRemoveFromHistory) {
      items.push({
        icon: X,
        label: tf("removeFromHistory"),
        onClick: ctx.onRemoveFromHistory,
      });
    }

    items.push({
      icon: Trash2,
      label: tt("moveToTrash"),
      onClick: ctx.onTrash,
      danger: true,
    });

    return items;
  }, [file, ctx, clipboard, tc, tf, tcb, tt]);
}
