/**
 * The real `ContextMenu` opened by the real `useContextMenu` from a trigger
 * that fills the viewport, so a right-click or a long-press can land at any
 * point, including within a few pixels of an edge.
 */

import type { ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import {
  Copy,
  Download,
  FolderInput,
  Heart,
  type LucideIcon,
  Pencil,
  Share2,
  Star,
  Tag,
  Trash2,
} from "lucide-react";

import { ContextMenu } from "@/components/ContextMenu";
import { ShortcutsProvider } from "@/components/ShortcutsProvider";
import { useContextMenu } from "@/hooks/useContextMenu";
import enMessages from "@/messages-core/en.json";

const ICONS: LucideIcon[] = [Pencil, Copy, FolderInput, Tag, Star, Heart, Share2, Download, Trash2];

function EdgeMenu({ rows }: { rows: number }): ReactElement {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ShortcutsProvider>
        <EdgeSurface rows={rows} />
      </ShortcutsProvider>
    </NextIntlClientProvider>
  );
}

function EdgeSurface({ rows }: { rows: number }): ReactElement {
  const { menuState, close, handlers } = useContextMenu();
  const items = Array.from({ length: rows }, (_, index) => ({
    icon: ICONS[index % ICONS.length],
    label: `Action ${index + 1}`,
    onClick: () => {},
  }));
  return (
    <>
      <div
        id="surface"
        className="fixed inset-0 z-0 bg-bg-elevated"
        style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}
        {...handlers}
      />
      <ContextMenu
        open={menuState.open}
        position={menuState.position}
        items={items}
        onClose={close}
      />
    </>
  );
}

export const CONTEXT_MENU_EDGE_ARRANGEMENTS: Record<string, () => ReactElement> = {
  "context-menu-edge": () => <EdgeMenu rows={6} />,
  "context-menu-edge-tall": () => <EdgeMenu rows={60} />,
};
