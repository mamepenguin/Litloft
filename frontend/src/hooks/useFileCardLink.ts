"use client";

import Link from "next/link";
import type { ElementType } from "react";
import type { FileItem } from "@/types";
import { useFileNavigationOverride } from "@/lib/fileNavigationOverride";

interface FileCardLinkOptions {
  file: FileItem;
  selectable?: boolean;
  onSelect?: (id: string) => void;
  onMetaSelect?: (id: string) => void;
  onShiftSelect?: (id: string) => void;
  sortQuery?: string;
}

interface FileCardLink {
  Wrapper: ElementType;
  wrapperProps: Record<string, unknown>;
}

/**
 * What "click this card" means, for every shape of card in a listing.
 *
 * Three modes, in priority order:
 *
 * - **select** — multi-select is on, so the click selects rather than
 *   opens, and shift extends the range. Cmd/Ctrl still escapes to
 *   `onMetaSelect` so power users can multi-select from anywhere.
 * - **override** — a host (currently `CollectionDetail`) absorbs the
 *   click into its own `?file=` selection instead of letting the
 *   canonical `/files/{id}` redirect take over. See
 *   `lib/fileNavigationOverride.tsx`.
 * - **link** — the default `<Link>`.
 *
 * Shared rather than written per card shape: the equal card and the
 * justified cell are two drawings of one row, and a second copy of this
 * is where the selection semantics would quietly diverge between them.
 */
export function useFileCardLink({
  file,
  selectable,
  onSelect,
  onMetaSelect,
  onShiftSelect,
  sortQuery,
}: FileCardLinkOptions): FileCardLink {
  const fileNavigationOverride = useFileNavigationOverride();
  const useOverride = !selectable && fileNavigationOverride !== null;

  if (selectable) {
    return {
      Wrapper: "div",
      wrapperProps: {
        onClick: (e: React.MouseEvent) => {
          if (e.shiftKey && onShiftSelect) {
            e.preventDefault();
            onShiftSelect(file.id);
          } else {
            onSelect?.(file.id);
          }
        },
        role: "button" as const,
        tabIndex: 0,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect?.(file.id);
          }
        },
      },
    };
  }

  if (useOverride) {
    return {
      Wrapper: "div",
      wrapperProps: {
        onClick: (e: React.MouseEvent) => {
          if ((e.metaKey || e.ctrlKey) && onMetaSelect) {
            e.preventDefault();
            onMetaSelect(file.id);
            return;
          }
          e.preventDefault();
          fileNavigationOverride!(file.id);
        },
        role: "button" as const,
        tabIndex: 0,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileNavigationOverride!(file.id);
          }
        },
        // Offered so the override host can look clickable even though
        // the underlying element is a `<div>` rather than a `<Link>`. A
        // caller that sets its own `className` after spreading these
        // props takes it over.
        className: "cursor-pointer",
      },
    };
  }

  return {
    Wrapper: Link,
    wrapperProps: {
      href: `/files/${file.id}${sortQuery || ""}`,
      onClick: (e: React.MouseEvent) => {
        if ((e.metaKey || e.ctrlKey) && onMetaSelect) {
          e.preventDefault();
          onMetaSelect(file.id);
        }
      },
    },
  };
}
