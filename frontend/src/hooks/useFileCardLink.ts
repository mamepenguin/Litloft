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
