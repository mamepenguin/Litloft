"use client";

import { Grid3X3, List } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { FileGrid } from "@/components/FileGrid";
import { FileList } from "@/components/FileList";
import { FolderCard } from "@/components/FolderCard";
import { EmptyState } from "@/components/EmptyState";
import { cardGridTemplate, useCardColumns } from "@/lib/cardGrid";
import { getDriveFiles, getFolders } from "@/lib/api";
import type { FileItem, Folder } from "@/types";

const STORAGE_KEY = "rightPaneFolder:viewMode";
type InnerViewMode = "grid" | "list";

interface RightPaneFolderProps {
  drive: string;
  folderPath: string;
}

/**
 * 2-pane right column when a folder is selected.
 *
 * v1 keeps this minimal: it lists immediate children with a small
 * grid/list toggle (separate from the outer 2-pane viewMode).
 * Selection, drag/drop and pin operations are not provided here — for
 * those, the user switches the outer viewMode to grid or list.
 */
export function RightPaneFolder({ drive, folderPath }: RightPaneFolderProps) {
  const t = useTranslations("view");
  const [innerMode, setInnerMode] = useState<InnerViewMode>("grid");
  const { ref: folderGridRef, columns } = useCardColumns();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "grid" || saved === "list") setInnerMode(saved);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getFolders(drive, folderPath || undefined),
      getDriveFiles(drive, { path: folderPath, sort: "created_at", order: "desc", limit: 100 }),
    ])
      .then(([folderList, fileResp]) => {
        if (cancelled) return;
        setFolders(folderList);
        setFiles(fileResp.data);
      })
      .catch(() => {
        if (cancelled) return;
        setFolders([]);
        setFiles([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [drive, folderPath]);

  const switchMode = (mode: InnerViewMode) => {
    setInnerMode(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // ignore quota
    }
  };

  const isEmpty = !loading && folders.length === 0 && files.length === 0;
  const buttonClass = (active: boolean) =>
    `rounded-lg p-1.5 transition-colors ${
      active ? "bg-accent text-white" : "text-text-muted hover:text-text-primary"
    }`;

  return (
    <div className="flex h-full flex-col bg-bg-primary">
      <div className="flex items-center justify-between gap-2 border-b border-bg-border px-4 py-3">
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
          {folderPath || drive}
        </h2>
        <div className="flex flex-shrink-0 gap-1">
          <button
            type="button"
            onClick={() => switchMode("grid")}
            className={buttonClass(innerMode === "grid")}
            aria-label={t("grid")}
          >
            <Grid3X3 size={16} />
          </button>
          <button
            type="button"
            onClick={() => switchMode("list")}
            className={buttonClass(innerMode === "list")}
            aria-label={t("list")}
          >
            <List size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        ) : isEmpty ? (
          <EmptyState variant="no-files" />
        ) : (
          <>
            {folders.length > 0 && (
              <div
                ref={folderGridRef}
                className="mb-4 grid gap-2"
                style={{ gridTemplateColumns: cardGridTemplate(columns) }}
              >
                {folders.map((folder) => (
                  <FolderCard key={folder.path} folder={folder} driveName={drive} />
                ))}
              </div>
            )}
            {files.length > 0 && (innerMode === "grid" ? (
              <FileGrid files={files} />
            ) : (
              <FileList files={files} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
