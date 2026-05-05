"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Folder, Move, X } from "lucide-react";

import { useTranslations } from "next-intl";
import { useShortcuts } from "@/hooks/useShortcuts";
import { getFolders } from "@/lib/api";
import type { Folder as FolderType } from "@/types";

interface MoveDialogProps {
  open: boolean;
  drive: string;
  currentPath: string;
  excludePath?: string;
  onMove: (targetPath: string) => void;
  onCancel: () => void;
}

export function MoveDialog({
  open,
  drive,
  currentPath,
  excludePath,
  onMove,
  onCancel,
}: MoveDialogProps) {
  const t = useTranslations("dialog");
  const tc = useTranslations("common");
  const [selectedPath, setSelectedPath] = useState("");
  const [browsePath, setBrowsePath] = useState("");
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFolders = useCallback(
    async (path: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await getFolders(drive, path || undefined);
        setFolders(result);
      } catch (err) {
        setError(t("moveFolderLoadFailed"));
        setFolders([]);
      } finally {
        setLoading(false);
      }
    },
    [drive]
  );

  useEffect(() => {
    if (open) {
      setSelectedPath("");
      setBrowsePath("");
      loadFolders("");
    }
  }, [open, loadFolders]);

  useShortcuts(
    "move-dialog",
    "Dialog",
    [{ key: "escape", label: "Cancel", handler: onCancel, hidden: true }],
    open,
  );

  function handleNavigate(folderPath: string) {
    setBrowsePath(folderPath);
    setSelectedPath(folderPath);
    loadFolders(folderPath);
  }

  function handleSelectRoot() {
    setSelectedPath("");
  }

  function handleNavigateUp() {
    const parts = browsePath.split("/").filter(Boolean);
    const parentPath = parts.slice(0, -1).join("/");
    setBrowsePath(parentPath);
    setSelectedPath(parentPath);
    loadFolders(parentPath);
  }

  function handleConfirm() {
    if (selectedPath !== currentPath) {
      onMove(selectedPath);
    }
  }

  const breadcrumbParts = browsePath ? browsePath.split("/").filter(Boolean) : [];
  const isCurrentPath = selectedPath === currentPath;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onCancel}
      />
      <div className="relative mx-4 flex w-full max-w-lg flex-col rounded-2xl bg-bg-card p-6 shadow-2xl animate-fade-in-scale">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
            <Move size={18} />
            {t("moveTitle")}
          </h2>
          <button
            onClick={onCancel}
            className="rounded-lg p-1 text-text-muted hover:text-text-primary"
            aria-label={tc("close")}
          >
            <X size={18} />
          </button>
        </div>

        {/* Breadcrumb */}
        <div className="mb-3 flex items-center gap-1 text-xs text-text-muted">
          <button
            onClick={() => {
              setBrowsePath("");
              setSelectedPath("");
              loadFolders("");
            }}
            className="rounded px-1 py-0.5 hover:text-text-primary"
          >
            {drive}
          </button>
          {breadcrumbParts.map((part, i) => {
            const path = breadcrumbParts.slice(0, i + 1).join("/");
            return (
              <span key={path} className="flex items-center gap-1">
                <ChevronRight size={12} />
                <button
                  onClick={() => handleNavigate(path)}
                  className="rounded px-1 py-0.5 hover:text-text-primary"
                >
                  {part}
                </button>
              </span>
            );
          })}
        </div>

        {/* Folder list */}
        <div className="mb-4 max-h-64 min-h-[120px] overflow-y-auto rounded-lg border border-bg-border bg-bg-elevated">
          {/* Root / parent option */}
          {browsePath && (
            <button
              onClick={handleNavigateUp}
              className="flex w-full items-center gap-2 border-b border-bg-border px-3 py-2 text-left text-sm text-text-muted hover:bg-bg-card"
            >
              ..
            </button>
          )}

          {/* Current directory selection */}
          <button
            onClick={handleSelectRoot}
            className={`flex w-full items-center gap-2 border-b border-bg-border px-3 py-2 text-left text-sm transition-colors ${
              selectedPath === browsePath
                ? "bg-accent/20 text-accent"
                : "text-text-muted hover:bg-bg-card"
            }`}
          >
            <Folder size={16} />
            <span className="flex-1">
              {browsePath ? browsePath.split("/").pop() : t("moveRoot")}
            </span>
            {selectedPath === browsePath && (
              <span className="text-xs">{t("moveSelected")}</span>
            )}
          </button>

          {loading && (
            <div className="px-3 py-4 text-center text-sm text-text-muted">
              {tc("loading")}
            </div>
          )}

          {error && (
            <div className="px-3 py-4 text-center text-sm text-danger">
              {error}
            </div>
          )}

          {!loading &&
            !error &&
            folders
            .filter((folder) => !excludePath || (folder.path !== excludePath && !folder.path.startsWith(excludePath + "/")))
            .map((folder) => (
              <button
                key={folder.path}
                onClick={() => handleNavigate(folder.path)}
                className={`flex w-full items-center gap-2 border-b border-bg-border px-3 py-2 text-left text-sm transition-colors last:border-b-0 ${
                  selectedPath === folder.path
                    ? "bg-accent/20 text-accent"
                    : "text-text-primary hover:bg-bg-card"
                }`}
              >
                <Folder size={16} className="shrink-0 text-accent/60" />
                <span className="flex-1 truncate">{folder.name}</span>
                <ChevronRight size={14} className="shrink-0 text-text-muted" />
              </button>
            ))}

          {!loading && !error && folders.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-text-muted">
              {t("moveNoSubfolders")}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <span className="truncate text-xs text-text-muted">
            {t("moveTarget", { path: selectedPath || t("moveRoot") })}
          </span>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="rounded-2xl bg-bg-elevated px-4 py-2 text-sm text-text-muted transition-colors hover:text-text-primary"
            >
              {tc("cancel")}
            </button>
            <button
              onClick={handleConfirm}
              disabled={isCurrentPath}
              className="rounded-2xl bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
            >
              {t("moveHere")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
