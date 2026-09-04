"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";

import { useInspectorOpen } from "@/hooks/useInspectorOpen";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useShortcuts } from "@/hooks/useShortcuts";
import { inspectorOpenStore } from "@/lib/inspectorOpenStore";
import { FileDetailChrome } from "./FileDetail/FileDetailChrome";
import { useInspectorFit } from "./FileDetail/hooks/useInspectorFit";
import { InspectorPane } from "./InspectorPane";
import { MobileInspectorSheet } from "./MobileInspectorSheet";

interface FileDetailShellProps {
  drive: string;
  /** Drive-relative folder the file sits in, for the breadcrumb. */
  folderPath?: string;
  /** Leaf label for the page row. */
  title: string;
  /** Replaces the leaf label — Markdown passes its click-to-edit title. */
  titleNode?: ReactNode;
  /** Type-specific controls in the page row, before the inspector toggle. */
  chromeControls?: ReactNode;
  /**
   * Host override for the page row's back control. Without it the row
   * links to the parent folder, which is what "back" means from a file.
   */
  onBack?: () => void;
  /**
   * Sections shown in the desktop Inspector pane. On mobile, this
   * stack is shown inside the Bottom Sheet unless `mobileSheet` is
   * provided, in which case the Sheet uses that instead.
   */
  inspector: ReactNode;
  /**
   * Optional override for the Bottom Sheet content on mobile. Lets
   * the host include items that live in the desktop canvas footer
   * (e.g. detailed-summary, ActiveSummary — sections whose tables /
   * structured content need width that the desktop Inspector cannot
   * provide). When omitted, falls back to `inspector`.
   */
  mobileSheet?: ReactNode;
  children: ReactNode;
  /**
   * Handed the element that actually scrolls the canvas.
   *
   * The shell owns it, and two things outside the shell need it: the
   * mini player's IntersectionObserver root, and the measurement that
   * publishes `--rail-avail`. Before media rode the shell, the host's
   * own wrapper was the scroller and the host passed it down; now that
   * wrapper never scrolls, so a host still passing it would be
   * measuring a box whose height is the whole page.
   */
  onScrollRootChange?: (node: HTMLElement | null) => void;
  /**
   * Identifier of the file being shown. Used as the chrome / mobile
   * Sheet reset key so a host that re-uses one `<FileDetailShell>`
   * mount across files (e.g. the 2-pane right pane) starts each file in
   * a fresh state.
   */
  resetKey?: string;
}

/**
 * Document-centric shell for file detail.
 *
 * Layout:
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ [▤] home › drive › folder › name   [ controls ]     [▭] │  ← h-12 chrome
 *   ├───────────────────────────────────┬──────────────────────┤
 *   │ canvas (children)                 │ inspector (384px)    │
 *   └───────────────────────────────────┴──────────────────────┘
 *
 * The chrome is `FileDetailChrome`, shared with the surfaces that have
 * no inspector, so every file detail page row is the same row.
 *
 * Mobile (<768px): the Inspector toggle opens the Inspector content
 * as a single Bottom Sheet.
 *
 * The `Cmd+\` / `Ctrl+\` shortcut toggles the inspector and is bound
 * here so it survives the pane unmount when collapsed (the binding has
 * to outlive both states or the keystroke would only close the pane
 * and never reopen it — B6 fix-up, retained from Phase 1).
 *
 * It was `MarkdownDocumentLayout` until 2026-09: the shell was never
 * Markdown-specific, only its chrome contents were, and those now
 * arrive as props (`titleNode` / `chromeControls`) from
 * `markdown/MarkdownDocumentLayout`.
 */
export function FileDetailShell({
  drive,
  folderPath,
  title,
  titleNode,
  chromeControls,
  onBack,
  inspector,
  mobileSheet,
  children,
  onScrollRootChange,
  resetKey,
}: FileDetailShellProps): ReactElement {
  const t = useTranslations("inspector");
  const { open, setOpen } = useInspectorOpen(drive);
  const isMobile = useIsMobile();
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const attachInspectorFitHost = useInspectorFit();

  // Reset transient UI on file change so the previously-open Sheet
  // doesn't bleed into the next file when the host re-uses one mounted
  // shell (review HIGH H1, hako 5rtHKXzQd9VJY7WNU5Deg).
  useEffect(() => {
    setMobileSheetOpen(false);
  }, [resetKey]);

  // Re-evaluate the inspector default-open derivation on resize.
  // Without this, resizing across the viewport boundary leaves
  // `useInspectorOpen` reading a stale viewport-derived snapshot when
  // the user has no persisted localStorage value. The actual mobile
  // breakpoint tracking is owned by `useIsMobile`.
  useEffect(() => {
    function handleResize() {
      inspectorOpenStore.notifyViewportChange();
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const toggle = useCallback(() => setOpen(!open), [open, setOpen]);

  const shortcuts = useMemo(
    () => [
      {
        key: "ctrl+\\",
        label: t("toggleShortcut"),
        handler: toggle,
        editingOnly: false as const,
      },
    ],
    [toggle, t],
  );
  useShortcuts("file-detail-shell", "Inspector", shortcuts, !isMobile);

  const inspectorOpenOnDesktop = !isMobile && open;
  const handleInspectorButton = useCallback(() => {
    if (isMobile) setMobileSheetOpen((prev) => !prev);
    else toggle();
  }, [isMobile, toggle]);

  return (
    <div
      data-testid="file-detail-shell"
      className="flex h-full w-full flex-col"
    >
      <FileDetailChrome
        drive={drive}
        folderPath={folderPath}
        title={title}
        titleNode={titleNode}
        onBack={onBack}
        inspector={{
          open: isMobile ? mobileSheetOpen : open,
          onToggle: handleInspectorButton,
        }}
      >
        {chromeControls}
      </FileDetailChrome>
      {/* `relative`, because the inspector is absolutely positioned
          against this row when it cannot fit beside the canvas. The row
          is also what `useInspectorFit` measures — never the canvas,
          whose width is the thing being decided. */}
      <div
        ref={attachInspectorFitHost}
        data-testid="inspector-fit-host"
        className="relative flex min-h-0 flex-1"
      >
        <main
          ref={onScrollRootChange}
          className="flex min-w-0 min-h-0 flex-1 flex-col overflow-auto"
        >
          {children}
        </main>
        {inspectorOpenOnDesktop && <InspectorPane>{inspector}</InspectorPane>}
      </div>
      {isMobile && (
        <MobileInspectorSheet
          open={mobileSheetOpen}
          onClose={() => setMobileSheetOpen(false)}
        >
          {mobileSheet ?? inspector}
        </MobileInspectorSheet>
      )}
    </div>
  );
}
