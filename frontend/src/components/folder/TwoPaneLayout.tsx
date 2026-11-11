"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

import { ScrollContainerContext } from "@/lib/scrollContainer";
import { folderTransitionKind } from "@/lib/folderTransition";
import { LeftPaneContext } from "@/lib/leftPaneContext";
import { navigateWithTransition } from "@/lib/viewTransitions";

import { useGuardedRouter } from "@/hooks/useGuardedRouter";
import { useSelectedFile } from "@/hooks/useSelectedFile";
import { useTreeBeside } from "@/hooks/useTreeBeside";
import { useTreeEnabled } from "@/hooks/useTreeEnabled";
import { useTreeVisible } from "@/hooks/useTreeVisible";
import { treeNarrowOpenStore } from "@/lib/treeNarrowOpenStore";
import { treeYieldStore } from "@/lib/treeYieldStore";
import { driveHref } from "@/lib/driveViews";
import { TreeRefreshContext } from "@/components/TreeRefreshContext";
import { useOverlaySidebarWhen } from "@/components/SidebarProvider";

import { FolderTreePane } from "./FolderTreePane";
import { RightPaneFile } from "./RightPaneFile";

interface TwoPaneLayoutProps {
  drive: string;
  folderPath: string;
  children: ReactNode;
  leftPane?: ReactNode;
  leftPaneAriaLabel?: string;
}

export function TwoPaneLayout({
  drive,
  folderPath,
  children,
  leftPane,
  leftPaneAriaLabel,
}: TwoPaneLayoutProps) {
  const t = useTranslations("rightPane");
  const tView = useTranslations("view");
  const router = useGuardedRouter();
  const pathname = usePathname();
  const { fileId, selectFile, clearFile } = useSelectedFile();


  // Lets children signal the tree to re-fetch after mutations even when a
  // WS event is delayed or missed.
  const [treeRefreshKey, setTreeRefreshKey] = useState(0);
  const refreshTree = useCallback(() => setTreeRefreshKey((k) => k + 1), []);

  const hasFile = fileId !== null && fileId.length > 0;
  const driveBase = `/drive/${encodeURIComponent(drive)}`;

  const handleSelectFolder = useCallback(
    (path: string) => {
      const segments = path.split("/").filter(Boolean).map(encodeURIComponent);
      const target =
        segments.length === 0
          ? driveHref(drive, "library")
          : `${driveBase}/${segments.join("/")}`;
      // Jumping the viewport back to the top would feel like the tree
      // itself collapsed.
      if (target !== pathname) {
        navigateWithTransition(
          folderTransitionKind(pathname, target.split("?")[0]),
          () => router.push(target, { scroll: false }),
        );
      } else if (hasFile) {
        clearFile();
      }
    },
    [drive, driveBase, pathname, router, hasFile, clearFile],
  );

  const handleSelectFile = useCallback(
    (id: string) => {
      selectFile(id);
    },
    [selectFile],
  );

  const selectedTreePath = hasFile ? null : folderPath || null;

  // Tree pane visibility is driven by CSS width transitions instead of
  // conditional mount/unmount, so toggling the pane never re-mounts
  // `children` on the right.
  //
  // `FolderTreePane` itself is lazy-mounted, and once enabled kept
  // mounted, so the tree's expansion / scroll state survives toggles.
  const sectionRef = useRef<HTMLElement | null>(null);
  const [paneElement, setPaneElement] = useState<HTMLElement | null>(null);

  const { visible: treeOpen, beside: treeBeside, yielded } = useTreeVisible(drive);
  const { enabled: treeEnabled } = useTreeEnabled(drive);
  const besideViewport = useTreeBeside();

  // The yield is a state of the file page, not of the setting: it ends with
  // the page, and a reopened pane starts from the setting on the next one.
  useLayoutEffect(() => {
    if (hasFile) treeYieldStore.setFilePage(drive, true);
    else treeYieldStore.clear(drive);
  }, [drive, hasFile]);

  useEffect(() => () => treeYieldStore.clear(drive), [drive]);

  const leftPaneState = useMemo(
    () => ({ element: paneElement, shownBySetting: treeEnabled && besideViewport }),
    [paneElement, treeEnabled, besideViewport],
  );

  // The sidebar and the tree both name where you are, and only one such
  // surface is allowed at a time. A yielded pane still owns the place it
  // gave back, so the sidebar stays in its overlay form.
  useOverlaySidebarWhen(treeBeside || yielded);

  const [hasEverEnabled, setHasEverEnabled] = useState(treeOpen);
  useEffect(() => {
    if (treeOpen && !hasEverEnabled) setHasEverEnabled(true);
  }, [treeOpen, hasEverEnabled]);
  const treeAsideWidth = treeOpen
    ? hasFile
      ? "w-0 md:w-[280px]"
      : "w-[100vw] md:w-[280px]"
    : "w-0";
  const showSectionOnMobile = !treeOpen || hasFile;

  return (
    <TreeRefreshContext.Provider value={refreshTree}>
    <ScrollContainerContext.Provider value={sectionRef}>
      <LeftPaneContext.Provider value={leftPaneState}>
      <div className="flex h-below-header w-full overflow-clip">
        <aside
          className={`h-full flex-shrink-0 overflow-hidden ${
            yielded ? "" : "transition-[width] duration-150 ease-out"
          } ${treeAsideWidth}`}
          ref={setPaneElement}
          aria-label={leftPaneAriaLabel ?? "Folder tree"}
          aria-hidden={!treeOpen}
          // aria-hidden alone lets keyboard focus still land on the
          // (visually clipped) tree rows underneath.
          inert={!treeOpen}
        >
          <div className="flex h-full w-[100vw] flex-col md:w-[280px]">
            <div className="flex items-center justify-end border-b border-bg-border p-1 md:hidden">
              <button
                type="button"
                onClick={() => treeNarrowOpenStore.set(drive, false)}
                aria-label={tView("treeOff")}
                className="rounded-lg p-2 text-text-muted hover:text-text-primary"
              >
                <X size={18} />
              </button>
            </div>
            {hasEverEnabled
              ? leftPane ?? (
                  <FolderTreePane
                    drive={drive}
                    selectedPath={selectedTreePath}
                    selectedFileId={fileId}
                    currentFolderPath={folderPath}
                    onSelectFolder={handleSelectFolder}
                    onSelectFile={handleSelectFile}
                    externalRefreshKey={treeRefreshKey}
                  />
                )
              : null}
          </div>
        </aside>
        <section
          ref={sectionRef}
          className={`${showSectionOnMobile ? "flex" : "hidden md:flex"} scrollbar-hover h-full min-w-0 flex-1 flex-col overflow-y-auto overscroll-y-contain bg-bg-primary`}
          // The transition names the scroller, not the page inside it: a
          // snapshot is positioned against the viewport and nothing clips
          // it, so naming a page several times the viewport's height paints
          // it over the app's own header. It carries the page colour rather
          // than inheriting it from `body`, because a snapshot of a
          // transparent element is transparent, and the screen behind it
          // shows through.
          data-listing-scroller=""
        >
          {hasFile && fileId ? <RightPaneFile fileId={fileId} drive={drive} /> : children}
          {!hasFile && <span className="sr-only">{t("noSelection")}</span>}
        </section>
      </div>
      </LeftPaneContext.Provider>
    </ScrollContainerContext.Provider>
    </TreeRefreshContext.Provider>
  );
}
