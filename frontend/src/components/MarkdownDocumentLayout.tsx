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
import {
  MarkdownActionBar,
  type MarkdownActionTab,
} from "./MarkdownActionBar";
import {
  MobileInspectorSheet,
  type MobileInspectorSections,
} from "./MobileInspectorSheet";

interface MarkdownDocumentLayoutProps {
  drive: string;
  inspector: ReactNode;
  children: ReactNode;
  /**
   * Phase 4 (spec §D5 / hako sFXCwZDluTPZZkbYuozwJ): per-section
   * payload for the mobile Bottom Sheet. When provided, the mobile
   * branch renders a 5-tab Action Bar + vaul Drawer; the desktop
   * branch ignores it. When omitted, mobile falls back to a single
   * canvas column (graceful degrade — matches Phase 1 behaviour and
   * keeps non-Markdown hosts that don't pass sections from breaking).
   */
  sheetSections?: MobileInspectorSections;
  /**
   * Identifier of the file being shown. Used to reset the mobile
   * Action Bar / Sheet state on file change — the two-pane folder
   * host re-uses one `<FileDetailContent>` mount as the user clicks
   * through files, so without an explicit reset the previously
   * opened sheet would persist into the next file (review HIGH H1,
   * hako 5rtHKXzQd9VJY7WNU5Deg). Optional because non-Markdown
   * hosts don't need it.
   */
  resetKey?: string;
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
  sheetSections,
  resetKey,
}: MarkdownDocumentLayoutProps): ReactElement {
  const t = useTranslations("inspector");
  const { open, setOpen } = useInspectorOpen(drive);
  const [isMobile, setIsMobile] = useState<boolean>(getIsMobile);
  const [mobileTab, setMobileTab] = useState<MarkdownActionTab>("main");
  const [actionBarHidden, setActionBarHidden] = useState(false);

  // Reset Sheet state on file change so the previously-open tab
  // doesn't bleed into the next file's surface (review HIGH H1).
  // The 2-pane folder host re-uses one FileDetailContent mount as
  // the user picks files, so this layout's state outlives the file
  // it belongs to without an explicit reset.
  useEffect(() => {
    setMobileTab("main");
  }, [resetKey]);

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

  // Phase 4: track textarea focus document-wide so we can hide the
  // mobile Action Bar while the soft keyboard is up (spec §D5 / hako
  // sFXCwZDluTPZZkbYuozwJ — Visual Viewport API is fiddly per-OS, so
  // we take the simpler "hide on focus, restore on blur" path). Lives
  // at the layout level rather than inside ActionBar so the listener
  // is bound exactly once per mounted page. Reads `event.target` to
  // avoid races with `document.activeElement` (in some browsers /
  // jsdom focusout fires before the new active element is settled).
  useEffect(() => {
    if (!isMobile) return;
    function isTextarea(target: EventTarget | null): boolean {
      return target instanceof HTMLElement && target.tagName === "TEXTAREA";
    }
    function handleFocusIn(e: FocusEvent) {
      if (isTextarea(e.target)) setActionBarHidden(true);
    }
    function handleFocusOut(e: FocusEvent) {
      if (isTextarea(e.target)) setActionBarHidden(false);
    }
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);
    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
    };
  }, [isMobile]);

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
    // Phase 4: only enable the Action Bar + Sheet when the host
    // supplied sheetSections. Hosts that don't pass it (or that pass
    // a falsy value during boot) fall back to the Phase 1 single-
    // column behaviour so non-Markdown surfaces don't accidentally
    // spawn a Sheet.
    const mobileEnhanced = sheetSections !== undefined;
    return (
      <div
        data-testid="markdown-document-layout"
        className="flex h-full w-full flex-col"
      >
        <main
          className="flex flex-1 min-h-0 flex-col overflow-auto"
          // Phase 4 4th PWA pass: reserve scroll clearance for the
          // floating Action Bar so the last line of the body
          // doesn't tuck behind the pill. Pill is ~50px tall + 4px
          // gap + safe-area inset; add another 16px of breathing
          // room. Only applied when the bar is actually present.
          style={
            mobileEnhanced
              ? {
                  paddingBottom:
                    "calc(env(safe-area-inset-bottom, 0px) + 70px)",
                }
              : undefined
          }
        >
          {children}
        </main>
        {mobileEnhanced && (
          <>
            <MarkdownActionBar
              activeTab={mobileTab}
              onTabSelect={(tab) => {
                // Re-tapping the active tab closes the Sheet — the
                // body button was dropped so this is the primary
                // close affordance from the bar itself (backdrop
                // tap / drag-down still work via vaul).
                setMobileTab((prev) => (prev === tab ? "main" : tab));
              }}
              hidden={actionBarHidden}
            />
            <MobileInspectorSheet
              activeTab={mobileTab}
              onClose={() => setMobileTab("main")}
              sections={sheetSections}
            />
          </>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid="markdown-document-layout"
      className="flex h-full w-full"
    >
      <main className="flex min-w-0 min-h-0 flex-1 flex-col overflow-auto">
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
