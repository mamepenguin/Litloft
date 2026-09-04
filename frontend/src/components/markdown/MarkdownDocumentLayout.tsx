"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";

import { useIsMobile } from "@/hooks/useIsMobile";
import {
  MarkdownChromeProvider,
  type MarkdownChromeContextValue,
  type MarkdownSaveState,
  type MarkdownViewMode,
} from "@/lib/markdownChromeContext";
import { FileDetailShell } from "../FileDetailShell";
import { MarkdownViewModeToggle } from "../MarkdownViewModeToggle";
import { EditableTitle } from "./EditableTitle";
import { SaveDot } from "./SaveDot";

interface MarkdownDocumentLayoutProps {
  drive: string;
  /** Drive-relative folder the note sits in, for the breadcrumb. */
  folderPath?: string;
  /**
   * Plain-text title shown in the chrome. When `onRename` is provided,
   * the title becomes click-to-edit (used for Markdown notes where the
   * filename is the user-facing identity). Without `onRename` the title
   * stays read-only — that branch carries the HTML preview and any
   * future preview-only file type that rides this shell.
   */
  title: string;
  /**
   * Optional callback to rename the underlying file. When provided, the
   * chrome title becomes inline-editable: click to enter edit mode,
   * blur or Enter to commit, Esc to cancel. The host is responsible
   * for the API call and any local-state refresh.
   */
  onRename?: (newFilename: string) => Promise<void>;
  /** Host override for the page row's back control. */
  onBack?: () => void;
  inspector: ReactNode;
  mobileSheet?: ReactNode;
  children: ReactNode;
  /** Forwarded to the shell; see `FileDetailShell`. */
  onScrollRootChange?: (node: HTMLElement | null) => void;
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
 * The Markdown note's contribution to the shared file detail shell:
 * a save-state dot, an Edit / Split / Preview toggle, a click-to-edit
 * filename, and the context that carries all three to the Knowledge
 * editor mounted in the canvas.
 *
 * View-mode state is owned here and exposed to the Knowledge Editor via
 * `MarkdownChromeContext`. The Editor pushes its save state back through
 * the same context so the chrome dot can reflect it without the layout
 * needing to know about the editor's save plumbing.
 *
 * Everything that is *not* Markdown-specific — the chrome row, the
 * inspector column, the Bottom Sheet, `Cmd+\` — is `FileDetailShell`,
 * which every other file type now wears too.
 */
export function MarkdownDocumentLayout({
  drive,
  folderPath,
  title,
  onRename,
  onBack,
  inspector,
  mobileSheet,
  children,
  onScrollRootChange,
  resetKey,
  previewOnly = false,
}: MarkdownDocumentLayoutProps): ReactElement {
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

  // Reset transient UI on file change so the previous note's view-mode
  // doesn't bleed into the next one when the host re-uses one mounted
  // layout (review HIGH H1, hako 5rtHKXzQd9VJY7WNU5Deg). viewMode is
  // re-derived from `?edit=1` so each new file starts in preview unless
  // it was opened via `useCreateFile` (which carries `?edit=1` through
  // the canonical-URL redirect).
  useEffect(() => {
    setSaveState({ status: "idle" });
    setViewMode(searchParams?.get("edit") === "1" ? "edit" : "preview");
    // Intentionally only re-runs on resetKey: search-params changes
    // unrelated to file navigation (e.g. ?sort, ?page) must not snap
    // the user back out of a manually-selected edit/split mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // Snap viewMode out of "split" whenever the viewport drops below the
  // mobile threshold (mirrors the Editor's own one-way snap; we keep
  // both because the Editor is the source of truth when mounted
  // standalone, and the chrome owns it when mounted under us).
  useEffect(() => {
    if (isMobile && viewMode === "split") setViewMode("preview");
  }, [isMobile, viewMode]);

  const chromeValue: MarkdownChromeContextValue = useMemo(
    () => ({
      viewMode,
      setViewMode,
      publishSaveState: setSaveState,
      isMobile,
    }),
    [viewMode, isMobile],
  );

  return (
    <MarkdownChromeProvider value={chromeValue}>
      <FileDetailShell
        drive={drive}
        folderPath={folderPath}
        title={title}
        onBack={onBack}
        titleNode={
          onRename && !previewOnly ? (
            <EditableTitle title={title} onRename={onRename} />
          ) : undefined
        }
        chromeControls={
          previewOnly ? undefined : (
            <>
              <SaveDot state={saveState} />
              <MarkdownViewModeToggle
                mode={viewMode}
                onChange={setViewMode}
                hideSplit={isMobile}
              />
            </>
          )
        }
        inspector={inspector}
        mobileSheet={mobileSheet}
        onScrollRootChange={onScrollRootChange}
        resetKey={resetKey}
      >
        {children}
      </FileDetailShell>
    </MarkdownChromeProvider>
  );
}
