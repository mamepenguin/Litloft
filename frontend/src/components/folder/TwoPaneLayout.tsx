"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { ScrollContainerContext } from "@/lib/scrollContainer";

import { useGuardedRouter } from "@/hooks/useGuardedRouter";
import { useSelectedFile } from "@/hooks/useSelectedFile";
import { useTreeEnabled } from "@/hooks/useTreeEnabled";

import { FolderTreePane } from "./FolderTreePane";
import { RightPaneFile } from "./RightPaneFile";

interface TwoPaneLayoutProps {
  drive: string;
  /**
   * The folder path the host page is currently rendering. Used so the
   * tree expands all ancestors of the user's location. Ignored when
   * ``leftPane`` is supplied.
   */
  folderPath: string;
  /**
   * The host page's normal content. Rendered on the right when no file
   * is selected. Replaced by `<RightPaneFile>` when `?file=` is set.
   */
  children: ReactNode;
  /**
   * Optional override for the left-pane content. When provided, the
   * default ``FolderTreePane`` is replaced with whatever the host
   * supplies — used by the collection detail page to show the
   * collection's ordered item list in the same shell (spec
   * ``2026-05-12-playlist-to-collection.md`` PR-B redo).
   *
   * Leaving this undefined preserves the existing folder behaviour
   * (selection wiring, ``selectedTreePath`` computation, etc.).
   */
  leftPane?: ReactNode;
  /**
   * aria-label for the left ``<aside>``. Defaults to "Folder tree".
   * Used by alternative left-pane hosts (e.g. collection items) to
   * surface a more accurate accessible name.
   */
  leftPaneAriaLabel?: string;
}

/**
 * Generic tree + right-pane wrapper.
 *
 * Phase 3 redesign (Topic 1 補正, hako w4zVT8-dyYwshLNiJ5REY): the tree
 * pane is now an orthogonal toggle independent of grid/list view mode.
 * This component accepts arbitrary children for the right pane so it
 * can wrap any host page (DriveHome, FolderBrowser, search results...).
 *
 * Wide (≥md): side-by-side. Narrow (<md): screen-swap — tree fills the
 * viewport when no file is selected, the file preview fills it once a
 * file is selected (Topic 11).
 */
export function TwoPaneLayout({
  drive,
  folderPath,
  children,
  leftPane,
  leftPaneAriaLabel,
}: TwoPaneLayoutProps) {
  const t = useTranslations("rightPane");
  const tView = useTranslations("view");
  // PR-5: useGuardedRouter wraps router.push/replace through
  // navigationGuard so a dirty editor can interrupt folder
  // navigation. selectFile / clearFile go through the same guard
  // via useSelectedFile.
  const router = useGuardedRouter();
  const pathname = usePathname();
  const { fileId, selectFile, clearFile } = useSelectedFile();
  const { enabled: treeEnabled, setEnabled: setTreeEnabled } = useTreeEnabled(drive);

  const hasFile = fileId !== null && fileId.length > 0;
  const driveBase = `/drive/${encodeURIComponent(drive)}`;

  const handleSelectFolder = useCallback(
    (path: string) => {
      const segments = path.split("/").filter(Boolean).map(encodeURIComponent);
      const target = segments.length === 0 ? driveBase : `${driveBase}/${segments.join("/")}`;
      // Tree navigation preserves the window scroll: the user is focused
      // on the tree (typically deep into the list), the right pane is
      // about to swap to a new page, but jumping the viewport back to
      // the top would feel like the tree itself collapsed.
      if (target !== pathname) {
        router.push(target, { scroll: false });
      } else if (hasFile) {
        // Same folder, but a file is open — clear ?file so the click
        // "returns" the user to the folder view.
        clearFile();
      }
    },
    [driveBase, pathname, router, hasFile, clearFile],
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
  // `children` (FolderBrowser / DriveHome) on the right. Outer `<aside>`
  // animates its width; the inner wrapper keeps an intrinsic width so
  // content doesn't reflow during the transition, it just gets clipped
  // by `overflow-hidden`.
  //
  // `FolderTreePane` itself is lazy-mounted — we don't want to run its
  // folder-tree fetch and WebSocket subscription for users who never
  // open the tree. Once they enable it for the first time we keep it
  // mounted, so the close→reopen animation has content to slide and
  // the tree's expansion / scroll state survives toggles.
  const sectionRef = useRef<HTMLElement | null>(null);

  const [hasEverEnabled, setHasEverEnabled] = useState(treeEnabled);
  useEffect(() => {
    if (treeEnabled && !hasEverEnabled) setHasEverEnabled(true);
  }, [treeEnabled, hasEverEnabled]);
  const treeAsideWidth = treeEnabled
    ? hasFile
      ? "w-0 md:w-[280px]"
      : "w-[100vw] md:w-[280px]"
    : "w-0";
  const showSectionOnMobile = !treeEnabled || hasFile;

  return (
    <ScrollContainerContext.Provider value={sectionRef}>
      <div className="flex h-[calc(100dvh-3.5rem)] w-full overflow-hidden">
        <aside
          className={`h-full flex-shrink-0 overflow-hidden transition-[width] duration-150 ease-out ${treeAsideWidth}`}
          aria-label={leftPaneAriaLabel ?? "Folder tree"}
          aria-hidden={!treeEnabled}
          // `inert` removes the subtree from tab order and pointer events
          // while the tree is closed. aria-hidden alone hides it from
          // screen readers but lets keyboard focus still land on the
          // (visually clipped) tree rows underneath.
          inert={!treeEnabled}
        >
          <div className="flex h-full w-[100vw] flex-col md:w-[280px]">
            <div className="flex items-center justify-end border-b border-bg-border p-1 md:hidden">
              <button
                type="button"
                onClick={() => setTreeEnabled(false)}
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
                  />
                )
              : null}
          </div>
        </aside>
        <section
          ref={sectionRef}
          className={`${showSectionOnMobile ? "flex" : "hidden md:flex"} scrollbar-hover h-full min-w-0 flex-1 flex-col overflow-y-auto`}
        >
          {hasFile && fileId ? <RightPaneFile fileId={fileId} drive={drive} /> : children}
          {!hasFile && <span className="sr-only">{t("noSelection")}</span>}
        </section>
      </div>
    </ScrollContainerContext.Provider>
  );
}
