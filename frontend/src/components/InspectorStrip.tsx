"use client";

import type { ReactElement, ReactNode } from "react";
import { useTranslations } from "next-intl";

interface InspectorStripProps {
  onOpen: () => void;
}

interface StripItem {
  id: "open" | "tags" | "related" | "ai-summary" | "comments";
  labelKey: string;
  icon: ReactNode;
}

const STRIP_ITEMS: ReadonlyArray<StripItem> = [
  {
    id: "open",
    labelKey: "openShortcut",
    icon: (
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <polyline points="15 18 9 12 15 6" />
      </svg>
    ),
  },
  {
    id: "tags",
    labelKey: "sections.tags",
    icon: (
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
        <line x1="7" y1="7" x2="7.01" y2="7" />
      </svg>
    ),
  },
  {
    id: "related",
    labelKey: "sections.related",
    icon: (
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
        <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
      </svg>
    ),
  },
  {
    id: "ai-summary",
    labelKey: "sections.aiSummary",
    icon: (
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z" />
      </svg>
    ),
  },
  {
    id: "comments",
    labelKey: "sections.comments",
    icon: (
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
];

/**
 * Collapsed Inspector rail (36px column of icon buttons).
 *
 * Spec: `docs/superpowers/specs/2026-05-10-markdown-document-layout.md` §D3.
 *
 * Phase 1 contract: clicking any icon reopens the Inspector.
 * Per-section deeplinking (`onOpen(section)`) is reserved for Phase 4.
 */
export function InspectorStrip({ onOpen }: InspectorStripProps): ReactElement {
  const t = useTranslations("inspector");
  return (
    <aside
      data-testid="inspector-strip"
      className="flex h-full w-9 flex-col items-center gap-1 border-l border-bg-border bg-bg-card py-3"
    >
      {STRIP_ITEMS.map((item) => {
        const label = t(item.labelKey);
        return (
          <button
            key={item.id}
            type="button"
            onClick={onOpen}
            aria-label={label}
            title={label}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-text-muted hover:bg-bg-elevated hover:text-text-primary"
          >
            {item.icon}
          </button>
        );
      })}
    </aside>
  );
}
