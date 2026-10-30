"use client";

import {
  useEffect,
  useCallback,
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
  folderPath?: string;
  title: string;
  onRename?: (newFilename: string) => Promise<void>;
  onBack?: () => void;
  inspector: ReactNode;
  mobileSheet?: ReactNode;
  sheetPeek?: ReactNode;
  children: ReactNode;
  onScrollRootChange?: (node: HTMLElement | null) => void;
  resetKey?: string;
  previewOnly?: boolean;
  /** Read and Edit only: there is no rendering that differs from the source. */
  plainText?: boolean;
}

export function MarkdownDocumentLayout({
  drive,
  folderPath,
  title,
  onRename,
  onBack,
  inspector,
  mobileSheet,
  sheetPeek,
  children,
  onScrollRootChange,
  resetKey,
  previewOnly = false,
  plainText = false,
}: MarkdownDocumentLayoutProps): ReactElement {
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  // Default to "preview" so a user navigating to an existing note sees
  // the rendered output first. `useCreateFile` carries `?edit=1` through
  // the canonical-URL redirect for freshly created notes; that's the one
  // case where landing in "edit" is the desired UX.
  const [viewMode, setViewModeState] = useState<MarkdownViewMode>(() =>
    searchParams?.get("edit") === "1" ? "edit" : "preview",
  );
  const setViewMode = useCallback(
    (next: MarkdownViewMode) =>
      setViewModeState(plainText && next === "split" ? "preview" : next),
    [plainText],
  );
  const [saveState, setSaveState] = useState<MarkdownSaveState>({
    status: "idle",
  });

  // Reset transient UI on file change so the previous note's view-mode
  // doesn't bleed into the next one when the host re-uses one mounted
  // layout.
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
  }, [isMobile, viewMode, setViewMode]);

  const chromeValue: MarkdownChromeContextValue = useMemo(
    () => ({
      viewMode,
      setViewMode,
      publishSaveState: setSaveState,
      isMobile,
    }),
    [viewMode, setViewMode, isMobile],
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
            <EditableTitle
              title={title}
              onRename={onRename}
              fixedSuffix={plainText ? title.slice(-4) : undefined}
            />
          ) : undefined
        }
        chromeControls={
          previewOnly ? undefined : (
            <>
              <SaveDot state={saveState} />
              <MarkdownViewModeToggle
                mode={viewMode}
                onChange={setViewMode}
                hideSplit={isMobile || plainText}
              />
            </>
          )
        }
        inspector={inspector}
        mobileSheet={mobileSheet}
        sheetPeek={sheetPeek}
        onScrollRootChange={onScrollRootChange}
        resetKey={resetKey}
      >
        {children}
      </FileDetailShell>
    </MarkdownChromeProvider>
  );
}
