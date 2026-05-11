"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { PanelRight, PanelRightClose } from "lucide-react";

import { useInspectorOpen } from "@/hooks/useInspectorOpen";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useShortcuts } from "@/hooks/useShortcuts";
import { inspectorOpenStore } from "@/lib/inspectorOpenStore";
import {
  MarkdownChromeProvider,
  type MarkdownChromeContextValue,
  type MarkdownSaveState,
  type MarkdownViewMode,
} from "@/lib/markdownChromeContext";
import { InspectorPane } from "./InspectorPane";
import { MarkdownViewModeToggle } from "./MarkdownViewModeToggle";
import { MobileInspectorSheet } from "./MobileInspectorSheet";
import { TreeToggle } from "./TreeToggle";

interface MarkdownDocumentLayoutProps {
  drive: string;
  /**
   * Plain-text title shown in the chrome. Rename remains accessible
   * through the folder tree / file actions; the chrome title itself
   * stays read-only to honour the "edit-mode + Inspector toggle only"
   * affordance set the design discussion landed on.
   */
  title: string;
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
   * Identifier of the file being shown. Used as the chrome / mobile
   * Sheet reset key so a host that re-uses one `<MarkdownDocumentLayout>`
   * mount across files (e.g. the 2-pane right pane) starts each file in
   * a fresh state.
   */
  resetKey?: string;
  /**
   * Hide the editor-only chrome elements (save state dot and the
   * Edit/Split/Preview view-mode toggle). HTML preview rides this
   * shell for the single-scroll inspector layout but has no editor,
   * so the toggle would be inert and the save dot meaningless. Other
   * read-only file types could reuse this flag later.
   */
  previewOnly?: boolean;
}

/**
 * Document-centric shell for Markdown file detail.
 *
 * Layout (spec `2026-05-10-markdown-document-layout.md`, with the
 * 2026-05-11 chrome-consolidation revision):
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ [▤] ● title              [ Edit Split Preview ]    [▭] │  ← h-12 chrome
 *   ├───────────────────────────────────┬──────────────────────┤
 *   │ canvas (children)                 │ inspector (300px)    │
 *   └───────────────────────────────────┴──────────────────────┘
 *
 * Chrome is a single 48px (`h-12`) row matching the non-Markdown
 * `PaneShell` header so the two surfaces look visually unified.
 * Contents:
 *   - `TreeToggle` (folder tree show/hide; hidden on mobile)
 *   - Save-state dot (8px circle reflecting the editor's save lifecycle)
 *   - Title (read-only truncating text)
 *   - View-mode segmented toggle (edit / split / preview; split hidden
 *     on mobile)
 *   - Inspector show/hide button
 *
 * View-mode state is owned here and exposed to the Knowledge Editor via
 * `MarkdownChromeContext`. The Editor pushes its save state back through
 * the same context so the chrome dot can reflect it without the layout
 * needing to know about the editor's save plumbing.
 *
 * Mobile (<768px): the Inspector toggle opens the Inspector content
 * as a single Bottom Sheet (no per-section tabs). The legacy floating
 * action bar was retired with this revision.
 *
 * The `Cmd+\` / `Ctrl+\` shortcut toggles the inspector and is bound
 * here so it survives the pane unmount when collapsed (the binding has
 * to outlive both states or the keystroke would only close the pane
 * and never reopen it — B6 fix-up, retained from Phase 1).
 */
export function MarkdownDocumentLayout({
  drive,
  title,
  inspector,
  mobileSheet,
  children,
  resetKey,
  previewOnly = false,
}: MarkdownDocumentLayoutProps): ReactElement {
  const t = useTranslations("inspector");
  const { open, setOpen } = useInspectorOpen(drive);
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  // Default to "preview" so a user navigating to an existing note sees
  // the rendered output first. `useCreateFile` carries `?edit=1` through
  // the canonical-URL redirect for freshly created notes; that's the one
  // case where landing in "edit" is the desired UX.
  const [viewMode, setViewMode] = useState<MarkdownViewMode>(() =>
    searchParams?.get("edit") === "1" ? "edit" : "preview",
  );
  const [saveState, setSaveState] = useState<MarkdownSaveState>({
    status: "idle",
  });
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  // Reset transient UI on file change so the previously-open Sheet /
  // view-mode doesn't bleed into the next file when the host re-uses
  // one mounted layout (review HIGH H1, hako 5rtHKXzQd9VJY7WNU5Deg).
  // viewMode is re-derived from `?edit=1` so each new file starts in
  // preview unless it was opened via `useCreateFile` (which carries
  // `?edit=1` through the canonical-URL redirect).
  useEffect(() => {
    setMobileSheetOpen(false);
    setSaveState({ status: "idle" });
    setViewMode(searchParams?.get("edit") === "1" ? "edit" : "preview");
    // Intentionally only re-runs on resetKey: search-params changes
    // unrelated to file navigation (e.g. ?sort, ?page) must not snap
    // the user back out of a manually-selected edit/split mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // Re-evaluate the inspector default-open derivation on resize.
  // Without this, resizing across the 1280px boundary leaves
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

  // Snap viewMode out of "split" whenever the viewport drops below the
  // mobile threshold (mirrors the Editor's own one-way snap; we keep
  // both because the Editor is the source of truth when mounted
  // standalone, and the chrome owns it when mounted under us).
  useEffect(() => {
    if (isMobile && viewMode === "split") setViewMode("preview");
  }, [isMobile, viewMode]);

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
  useShortcuts("markdown-doc-layout", "Inspector", shortcuts, !isMobile);

  const chromeValue: MarkdownChromeContextValue = useMemo(
    () => ({
      viewMode,
      setViewMode,
      publishSaveState: setSaveState,
      isMobile,
    }),
    [viewMode, isMobile],
  );

  const inspectorOpenOnDesktop = !isMobile && open;
  const handleInspectorButton = () => {
    if (isMobile) setMobileSheetOpen((prev) => !prev);
    else toggle();
  };

  const chrome = (
    <div
      data-testid="markdown-document-chrome"
      className="flex h-12 shrink-0 items-center gap-2 border-b border-bg-border bg-bg-card px-3"
    >
      {/* TreeToggle is desktop-only — on mobile the layout uses a tree
          ⇄ file-detail screen swap, so the toggle has no visible effect
          here. Mobile users navigate back via the browser / OS back
          gesture. The folder view's TreeToggle still handles enabling
          the tree when it's been switched off. */}
      <div className="hidden md:flex">
        <TreeToggle drive={drive} />
      </div>
      {!previewOnly && <SaveDot state={saveState} />}
      <h2
        className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary"
        title={title}
      >
        {title}
      </h2>
      {!previewOnly && (
        <MarkdownViewModeToggle
          mode={viewMode}
          onChange={setViewMode}
          hideSplit={isMobile}
        />
      )}
      <button
        type="button"
        onClick={handleInspectorButton}
        aria-pressed={isMobile ? mobileSheetOpen : open}
        aria-label={
          (isMobile ? mobileSheetOpen : open) ? t("close") : t("openShortcut")
        }
        title={
          (isMobile ? mobileSheetOpen : open) ? t("close") : t("openShortcut")
        }
        data-testid="inspector-toggle"
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
      >
        {(isMobile ? mobileSheetOpen : open) ? (
          <PanelRightClose size={16} />
        ) : (
          <PanelRight size={16} />
        )}
      </button>
    </div>
  );

  return (
    <MarkdownChromeProvider value={chromeValue}>
      <div
        data-testid="markdown-document-layout"
        className="flex h-full w-full flex-col"
      >
        {chrome}
        <div className="flex min-h-0 flex-1">
          <main className="flex min-w-0 min-h-0 flex-1 flex-col overflow-auto">
            {children}
          </main>
          {inspectorOpenOnDesktop && (
            <InspectorPane>{inspector}</InspectorPane>
          )}
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
    </MarkdownChromeProvider>
  );
}

/**
 * Tiny status dot. Replaces the previous "Saving... / Saved" label
 * with an 8px (`h-2 w-2`) circle so the chrome stays at 48px without
 * the busy text reflow on every keystroke.
 *
 *   idle    → transparent (aria-hidden so screen readers skip the dead pixel)
 *   saving  → accent, pulsing
 *   saved   → teal accent
 *   conflict → red
 *   error    → red (title carries the underlying error message)
 */
function SaveDot({ state }: { state: MarkdownSaveState }) {
  const t = useTranslations("inspector.saveDot");
  const isIdle = state.status === "idle";
  let toneClass = "bg-transparent";
  let labelKey = "idle";
  if (state.status === "saving") {
    toneClass = "bg-accent animate-pulse";
    labelKey = "saving";
  } else if (state.status === "saved") {
    toneClass = "bg-accent-teal";
    labelKey = "saved";
  } else if (state.status === "conflict") {
    toneClass = "bg-danger";
    labelKey = "conflict";
  } else if (state.status === "error") {
    toneClass = "bg-danger";
    labelKey = "error";
  }
  // Idle: the dot is visually invisible and carries no useful info,
  // so we drop it from the accessibility tree entirely. Non-idle: we
  // expose it as a polite live region so AT users hear the state
  // transition without us having to manage focus.
  const a11yProps = isIdle
    ? ({ "aria-hidden": true } as const)
    : ({ role: "status" as const, "aria-live": "polite" as const, "aria-label": t(labelKey) });
  return (
    <span
      {...a11yProps}
      title={state.status === "error" && state.message ? state.message : t(labelKey)}
      data-testid="save-dot"
      data-state={state.status}
      className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${toneClass}`}
    />
  );
}
