"use client";

import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";

import { useSelectedFile } from "@/hooks/useSelectedFile";

import { FolderTreePane } from "./FolderTreePane";
import { RightPaneFile } from "./RightPaneFile";
import { RightPaneFolder } from "./RightPaneFolder";

interface TwoPaneLayoutProps {
  drive: string;
  folderPath: string;
}

const TREE_WIDTH = 280;

/**
 * 2-pane folder view: left tree + right preview/folder.
 *
 * Wide (≥md): side-by-side. Narrow (<md): screen-swap — tree fills the
 * viewport when no file is selected, preview fills it once a file is
 * selected (Topic 11, hako dI84vvqdYv4-t5SipKVd9).
 *
 * Selection model (Topic 3, hako tP8wYvAB9qEDQmrjsdtGQ):
 *   - Folder click in tree → router.push to that folder URL
 *   - File click in tree   → ?file=id via router.replace
 */
export function TwoPaneLayout({ drive, folderPath }: TwoPaneLayoutProps) {
  const t = useTranslations("rightPane");
  const router = useRouter();
  const pathname = usePathname();
  const { fileId, selectFile } = useSelectedFile();

  const driveBase = `/drive/${encodeURIComponent(drive)}`;

  const handleSelectFolder = useCallback(
    (path: string) => {
      const segments = path.split("/").filter(Boolean).map(encodeURIComponent);
      const target = segments.length === 0 ? driveBase : `${driveBase}/${segments.join("/")}`;
      // ?file param is intentionally dropped — folder navigation is push state.
      if (target !== pathname) router.push(target);
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
        className={`${hasFile ? "hidden md:flex" : "flex"} flex-shrink-0 flex-col`}
        style={{ width: TREE_WIDTH }}
        aria-label="Folder tree"
      >
        <FolderTreePane
          drive={drive}
          selectedPath={selectedTreePath}
          currentFolderPath={folderPath}
          onSelectFolder={handleSelectFolder}
          onSelectFile={handleSelectFile}
        />
      </aside>
      <section className={`${hasFile ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
        {hasFile && fileId ? (
          <RightPaneFile fileId={fileId} />
        ) : (
          <RightPaneFolder drive={drive} folderPath={folderPath} />
        )}
        {!hasFile && (
          <span className="sr-only">{t("noSelection")}</span>
        )}
      </section>
    </div>
  );
}
