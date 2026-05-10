"use client";

import type { ReactElement, ReactNode } from "react";
import { useTranslations } from "next-intl";

interface InspectorPaneProps {
  onClose: () => void;
  children: ReactNode;
}

/**
 * Open/expanded Inspector column for the Markdown DocumentLayout.
 *
 * Spec: `docs/superpowers/specs/2026-05-10-markdown-document-layout.md` §D3.
 *
 * - Header bar (`inspector.title` label + close button). The close button
 *   invokes `onClose`.
 * - Children are the section stack (tags / related / AI / similar /
 *   comments). Phase 1 leaves layout of those sections to the caller.
 *
 * The `Cmd+\` / `Ctrl+\` shortcut that toggles the inspector is registered
 * by `MarkdownDocumentLayout` (the parent that survives both states), so
 * the binding remains live while the pane is collapsed. Keeping it here
 * would tie the keystroke to mount lifetime and break the open path.
 */
export function InspectorPane({
  onClose,
  children,
}: InspectorPaneProps): ReactElement {
  const t = useTranslations("inspector");

  return (
    <aside
      data-testid="inspector-pane"
      className="flex h-full w-[300px] flex-col overflow-auto border-l border-bg-border bg-bg-card"
    >
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-bg-border px-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          {t("title")}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          title={t("close")}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-text-muted hover:bg-bg-elevated hover:text-text-primary"
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </header>
      <div className="flex-1 overflow-auto">{children}</div>
    </aside>
  );
}
