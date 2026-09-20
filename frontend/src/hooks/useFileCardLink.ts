"use client";

import Link from "next/link";
import { useRef, type ElementType } from "react";
import type { FileItem } from "@/types";
import { fileLinkHref } from "@/lib/canonicalFileUrl";
import { useFileNavigationOverride } from "@/lib/fileNavigationOverride";
import {
  navigateWithTransition,
  transitionAroundNavigation,
} from "@/lib/viewTransitions";

/** The picture inside the pressed card, which the open file grows out of. */
function heroOf(card: EventTarget | null): HTMLElement | null {
  if (!(card instanceof HTMLElement)) return null;
  return card.matches("[data-file-thumb]")
    ? card
    : card.querySelector("[data-file-thumb]");
}

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
  // `onNavigate` carries no event, so the element is taken on the press
  // that precedes it.
  const hero = useRef<HTMLElement | null>(null);

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
          navigateWithTransition(
            "file-open",
            () => fileNavigationOverride!(file.id),
            { hero: heroOf(e.currentTarget) },
          );
        },
        role: "button" as const,
        tabIndex: 0,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigateWithTransition(
              "file-open",
              () => fileNavigationOverride!(file.id),
              { hero: heroOf(e.currentTarget) },
            );
          }
        },
        className: "cursor-pointer",
      },
    };
  }

  return {
    Wrapper: Link,
    wrapperProps: {
      href: fileLinkHref(file, sortQuery),
      onClick: (e: React.MouseEvent) => {
        if ((e.metaKey || e.ctrlKey) && onMetaSelect) {
          e.preventDefault();
          onMetaSelect(file.id);
          return;
        }
        hero.current = heroOf(e.currentTarget);
      },
      onNavigate: () => {
        transitionAroundNavigation("file-open", { hero: hero.current });
        hero.current = null;
      },
    },
  };
}
