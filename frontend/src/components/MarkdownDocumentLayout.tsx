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
import { useShortcuts } from "@/hooks/useShortcuts";
import { inspectorOpenStore } from "@/lib/inspectorOpenStore";
import { InspectorPane } from "./InspectorPane";
import { InspectorStrip } from "./InspectorStrip";

interface MarkdownDocumentLayoutProps {
  drive: string;
  inspector: ReactNode;
  children: ReactNode;
}

const MOBILE_BREAKPOINT = 768;

function getIsMobile(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < MOBILE_BREAKPOINT;
}

/**
 * 3-column document-centric shell for Markdown file detail.
 *
 * Spec: `docs/superpowers/specs/2026-05-10-markdown-document-layout.md`
 * §3 / §D3 / §6 Phase 1.
 *
 * Layout (>= 768px):
 *   canvas (flex-1, flex-col, min-h-0) | inspector (300px open / 36px collapsed)
 *
 * Mobile (< 768px) Phase 1: graceful degradation — single column, the
 * inspector slot is not rendered. Phase 4 lifts it into a Bottom Sheet.
 *
 * Sidebar / tree columns are owned by the page shell; this component
 * only renders the canvas + inspector portion.
 *
 * The `Cmd+\` / `Ctrl+\` toggle shortcut is registered here (not inside
 * `InspectorPane`) so the binding survives the pane unmount when the
 * user collapses the inspector — otherwise the keystroke would only
 * close the pane and never reopen it (B6 fix-up).
 */
export function MarkdownDocumentLayout({
  drive,
  inspector,
  children,
}: MarkdownDocumentLayoutProps): ReactElement {
  const t = useTranslations("inspector");
  const { open, setOpen } = useInspectorOpen(drive);
  const [isMobile, setIsMobile] = useState<boolean>(getIsMobile);

  useEffect(() => {
    // Sync `isMobile` immediately on mount: the initial render uses
    // `getIsMobile()` which is `false` during SSR. On a mobile device
    // this would briefly flash the desktop layout before the first
    // resize event fires. Calling `setIsMobile(getIsMobile())` here
    // resolves the correct value as soon as the client mounts.
    setIsMobile(getIsMobile());
    function handleResize() {
      setIsMobile(getIsMobile());
      // Re-evaluate the inspector default-open derivation. Without
      // this, resizing across the 1280px boundary leaves
      // `useInspectorOpen` reading a stale viewport-derived snapshot
      // when the user has no persisted localStorage value.
      inspectorOpenStore.notifyViewportChange();
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const close = useCallback(() => setOpen(false), [setOpen]);
  const reopen = useCallback(() => setOpen(true), [setOpen]);
  const toggle = useCallback(() => setOpen(!open), [open, setOpen]);

  // Always-on shortcut binding. Lives at the layout root (which never
  // unmounts while the user stays on the document) so collapsing the
  // pane does not strip the binding.
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
  useShortcuts("markdown-doc-layout", "Inspector", shortcuts, !isMobile);

  if (isMobile) {
    return (
      <div
        data-testid="markdown-document-layout"
        className="flex h-full w-full flex-col"
      >
        <main className="flex flex-1 min-h-0 flex-col">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div
      data-testid="markdown-document-layout"
      className="flex h-full w-full"
    >
      <main className="flex min-w-0 min-h-0 flex-1 flex-col">
        {children}
      </main>
      {open ? (
        <InspectorPane onClose={close}>{inspector}</InspectorPane>
      ) : (
        <InspectorStrip onOpen={reopen} />
      )}
    </div>
  );
}
