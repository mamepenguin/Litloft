"use client";

import { useMemo, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import { useShortcuts } from "@/hooks/useShortcuts";

interface InspectorPaneProps {
  onClose: () => void;
  onToggle: () => void;
  children: ReactNode;
}

/**
 * Open/expanded Inspector column for the Markdown DocumentLayout.
 *
 * Spec: `docs/superpowers/specs/2026-05-10-markdown-document-layout.md` §D3.
 *
 * - Header bar (`inspector.title` label + close button). The close button
 *   invokes `onClose`.
 * - Registers a global `Ctrl+\` (Cmd+\ on macOS, normalized by
 *   {@link useShortcuts}) shortcut that fires `onToggle`.
 * - Children are the section stack (tags / related / AI / similar /
 *   comments). Phase 1 leaves layout of those sections to the caller.
 */
export function InspectorPane({
  onClose,
  onToggle,
  children,
}: InspectorPaneProps): ReactElement {
  const t = useTranslations("inspector");
  const shortcuts = useMemo(
    () => [
      {
        key: "ctrl+\\",
        label: t("toggleShortcut"),
        handler: onToggle,
        editingOnly: false as const,
      },
    ],
    [onToggle, t],
  );
  useShortcuts("inspector-pane", "Inspector", shortcuts);

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
