"use client";

import { useCallback, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import type { FileItem, ViewMode } from "@/types";
import { getMissing, purgeAllMissing, purgeFile } from "@/lib/api";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ViewToggle } from "@/components/ViewToggle";
import { MissingFileGrid } from "@/components/missing/MissingFileGrid";
import { MissingFileList } from "@/components/missing/MissingFileList";

interface MissingViewProps {
  driveName: string;
}

export function MissingView({ driveName }: MissingViewProps) {
  const tm = useTranslations("missing");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [purgeAllOpen, setPurgeAllOpen] = useState(false);
  const [purgeConfirmOpen, setPurgeConfirmOpen] = useState(false);
  const [purgeTarget, setPurgeTarget] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (page: number, limit: number) => {
      const res = await getMissing(driveName, { page, limit });
      return { data: res.data, total: res.meta.total };
    },
    [driveName],
  );

  const {
    items: files,
    total,
    loading,
    loadingMore,
    sentinelRef,
    reset,
    setItems: setFiles,
  } = useInfiniteScroll<FileItem>({ fetchPage, limit: 30 });

  const handlePurge = useCallback(async () => {
    if (!purgeTarget) return;
    try {
      await purgeFile(purgeTarget);
      setFiles((prev) => prev.filter((f) => f.id !== purgeTarget));
    } finally {
      setPurgeConfirmOpen(false);
      setPurgeTarget(null);
    }
  }, [purgeTarget, setFiles]);

  const handlePurgeAll = useCallback(async () => {
    try {
      await purgeAllMissing(driveName);
      setFiles([]);
    } finally {
      setPurgeAllOpen(false);
    }
  }, [driveName, setFiles]);

  const openPurgeConfirm = useCallback((fileId: string) => {
    setPurgeTarget(fileId);
    setPurgeConfirmOpen(true);
  }, []);

  return (
    <div className="min-w-0 w-full flex-1 px-2 py-4 sm:px-4 sm:py-6">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold text-text-primary">
            <AlertTriangle size={24} className="text-warm-silver" />
            {tm("title")}
          </h1>
          <p className="mt-1 text-sm text-text-muted">{tm("description")}</p>
        </div>
        {files.length > 0 && (
          <button
            onClick={() => setPurgeAllOpen(true)}
            className="flex flex-shrink-0 items-center gap-2 rounded-2xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/20"
          >
            <Trash2 size={16} />
            {tm("purgeAll")}
          </button>
        )}
      </div>

      {files.length > 0 && (
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm text-text-muted">{total}</span>
          <ViewToggle onChange={setViewMode} />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertTriangle size={48} className="text-text-muted opacity-40" />
          <h2 className="mt-4 text-lg font-semibold text-text-primary">{tm("empty")}</h2>
          <p className="mt-2 max-w-md text-sm text-text-muted">{tm("emptyDescription")}</p>
        </div>
      ) : viewMode === "grid" ? (
        <MissingFileGrid files={files} onPurge={openPurgeConfirm} />
      ) : (
        <MissingFileList files={files} onPurge={openPurgeConfirm} />
      )}

      <div ref={sentinelRef} className="flex items-center justify-center py-4">
        {loadingMore && (
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        )}
      </div>

      <ConfirmDialog
        open={purgeAllOpen}
        title={tm("purgeAll")}
        message={tm("confirmPurgeAll", { count: total })}
        confirmLabel={tm("purgeAll")}
        onConfirm={handlePurgeAll}
        onCancel={() => setPurgeAllOpen(false)}
      />

      <ConfirmDialog
        open={purgeConfirmOpen}
        title={tm("purge")}
        message={tm("confirmPurge")}
        confirmLabel={tm("purge")}
        onConfirm={handlePurge}
        onCancel={() => {
          setPurgeConfirmOpen(false);
          setPurgeTarget(null);
        }}
      />
    </div>
  );
}
