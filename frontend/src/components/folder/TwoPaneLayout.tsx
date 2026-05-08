"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";
import type { ReactNode } from "react";

import { useSelectedFile } from "@/hooks/useSelectedFile";
import { useTreeEnabled } from "@/hooks/useTreeEnabled";

import { FolderTreePane } from "./FolderTreePane";
import { RightPaneFile } from "./RightPaneFile";

interface TwoPaneLayoutProps {
  drive: string;
  /**
   * The folder path the host page is currently rendering. Used so the
   * tree expands all ancestors of the user's location.
   */
  folderPath: string;
  /**
   * The host page's normal content. Rendered on the right when no file
   * is selected. Replaced by `<RightPaneFile>` when `?file=` is set.
   */
  children: ReactNode;
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
export function TwoPaneLayout({ drive, folderPath, children }: TwoPaneLayoutProps) {
  const t = useTranslations("rightPane");
  const tView = useTranslations("view");
  const router = useRouter();
  const pathname = usePathname();
  const { fileId, selectFile } = useSelectedFile();
  const { setEnabled: setTreeEnabled } = useTreeEnabled(drive);

  const driveBase = `/drive/${encodeURIComponent(drive)}`;

  const handleSelectFolder = useCallback(
    (path: string) => {
      const segments = path.split("/").filter(Boolean).map(encodeURIComponent);
      const target = segments.length === 0 ? driveBase : `${driveBase}/${segments.join("/")}`;
      // Tree navigation preserves the window scroll: the user is focused
      // on the tree (typically deep into the list), the right pane is
      // about to swap to a new page, but jumping the viewport back to
      // the top would feel like the tree itself collapsed.
      if (target !== pathname) router.push(target, { scroll: false });
    },
    [driveBase, pathname, router],
  );

  const handleSelectFile = useCallback(
    (id: string) => {
      selectFile(id);
    },
    [selectFile],
  );

  const hasFile = fileId !== null && fileId.length > 0;
  const selectedTreePath = hasFile ? null : folderPath || null;

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] w-full">
      <aside
        className={`${
          hasFile ? "hidden md:flex" : "flex"
        } w-full flex-col md:w-[280px] md:flex-shrink-0`}
        aria-label="Folder tree"
      >
        <div className="flex items-center justify-end border-b border-bg-border p-1 md:hidden">
          <button
            type="button"
            onClick={() => setTreeEnabled(false)}
            aria-label={tView("treeOff")}
            className="rounded-md p-2 text-text-muted hover:text-text-primary"
          >
            <X size={18} />
          </button>
        </div>
        <FolderTreePane
          drive={drive}
          selectedPath={selectedTreePath}
          currentFolderPath={folderPath}
          onSelectFolder={handleSelectFolder}
          onSelectFile={handleSelectFile}
        />
      </aside>
      <section className={`${hasFile ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
        {hasFile && fileId ? <RightPaneFile fileId={fileId} /> : children}
        {!hasFile && <span className="sr-only">{t("noSelection")}</span>}
      </section>
    </div>
  );
}
