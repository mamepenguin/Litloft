"use client";

import { useCallback, useState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import type { FileItem, FileType, SortField, SortOrder, ViewMode } from "@/types";
import { emptyTrash, getTrash, purgeFile, restoreFile } from "@/lib/api";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { useSelection } from "@/hooks/useSelection";
import { Breadcrumb } from "@/components/Breadcrumb";
import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { SelectionBar } from "@/components/SelectionBar";
import { TrashToolbar } from "@/components/trash/TrashToolbar";
import { TrashFileGrid } from "@/components/trash/TrashFileGrid";
import { TrashFileList } from "@/components/trash/TrashFileList";

interface TrashViewProps {
  driveName: string;
}

export function TrashView({ driveName }: TrashViewProps) {
  const tt = useTranslations("trash");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sort, setSort] = useState<SortField>("created_at");
  const [order, setOrder] = useState<SortOrder>("desc");
  const [typeFilter, setTypeFilter] = useState<FileType | null>(null);
  const [selectable, setSelectable] = useState(false);
  const [emptyConfirmOpen, setEmptyConfirmOpen] = useState(false);
  const [purgeConfirmOpen, setPurgeConfirmOpen] = useState(false);
  const [purgeTarget, setPurgeTarget] = useState<string | null>(null);

  const selection = useSelection();

  const fetchPage = useCallback(
    async (page: number, limit: number) => {
      const res = await getTrash(driveName, { sort, order, page, limit });
      const filtered = typeFilter
        ? res.data.filter((f) => f.file_type === typeFilter)
        : res.data;
      return { data: filtered, total: res.meta.total };
    },
    [driveName, sort, order, typeFilter],
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

  const refresh = useCallback(() => {
    reset();
  }, [reset]);

  const handleRestore = useCallback(async (fileId: string) => {
    try {
      await restoreFile(fileId);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch {
      // ignore
    }
  }, [setFiles]);

  const handlePurge = useCallback(async () => {
    if (!purgeTarget) return;
    try {
      await purgeFile(purgeTarget);
      setFiles((prev) => prev.filter((f) => f.id !== purgeTarget));
      setPurgeConfirmOpen(false);
      setPurgeTarget(null);
    } catch {
      // keep dialog open
    }
  }, [purgeTarget, setFiles]);

  const handleEmptyTrash = useCallback(async () => {
    try {
      await emptyTrash(driveName);
      setEmptyConfirmOpen(false);
      setFiles([]);
    } catch {
      // keep dialog open
    }
  }, [driveName, setFiles]);

  const handleMetaSelect = useCallback((id: string) => {
    setSelectable(true);
    selection.toggle(id);
  }, [selection]);

  const handleShiftSelect = useCallback((id: string) => {
    selection.selectRange(files.map((f) => f.id), id);
  }, [selection, files]);

  const openPurgeConfirm = useCallback((fileId: string) => {
    setPurgeTarget(fileId);
    setPurgeConfirmOpen(true);
  }, []);

  return (
    <div className="min-w-0 w-full flex-1 py-4 sm:py-6">
      {/* This page names itself in its heading, so the trail carries only the
          drive — "name the subject once". `driveIsAncestor` is also what
          gives the view a way back to the drive; it had none. */}
      <PageHeader
        breadcrumb={<Breadcrumb driveName={driveName} driveIsAncestor />}
        titleIcon={Trash2}
        title={tt("title")}
        actions={
          files.length > 0 ? (
            <Button variant="danger" onClick={() => setEmptyConfirmOpen(true)}>
              <Trash2 size={16} />
              {tt("emptyTrash")}
            </Button>
          ) : undefined
        }
      />

      {/* `px-4`, matching PageHeader's own padding. The page used to be
          `px-2 sm:px-4` throughout; keeping that here would leave the header
          at 16px and the file list at 8px below `sm`. */}
      <div className="px-4">
      <TrashToolbar
        sort={sort}
        order={order}
        typeFilter={typeFilter}
        total={total}
        selectable={selectable}
        onSortChange={(s, o) => { setSort(s); setOrder(o); }}
        onTypeFilterChange={setTypeFilter}
        onViewChange={setViewMode}
        onToggleSelectable={() => {
          setSelectable((s) => {
            if (s) selection.clear();
            return !s;
          });
        }}
      />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : files.length === 0 ? (
        <EmptyState variant="no-trash" />
      ) : viewMode === "grid" ? (
        <TrashFileGrid
          files={files}
          selectable={selectable}
          isSelected={selection.isSelected}
          onSelect={selection.toggle}
          onMetaSelect={handleMetaSelect}
          onShiftSelect={handleShiftSelect}
          onRestore={handleRestore}
          onPurge={openPurgeConfirm}
        />
      ) : (
        <TrashFileList
          files={files}
          selectable={selectable}
          isSelected={selection.isSelected}
          onSelect={selection.toggle}
          onMetaSelect={handleMetaSelect}
          onShiftSelect={handleShiftSelect}
          onRestore={handleRestore}
          onPurge={openPurgeConfirm}
        />
      )}

      <div ref={sentinelRef} className="flex items-center justify-center py-4">
        {loadingMore && (
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        )}
      </div>
      </div>

      {selectable && (
        <SelectionBar
          count={selection.count}
          selectedIds={selection.selectedIds}
          totalCount={files.length}
          drive={driveName}
          isTrashView
          onSelectAll={() => selection.selectAll(files.map((f) => f.id))}
          onClear={() => {
            selection.clear();
            setSelectable(false);
          }}
          onComplete={refresh}
        />
      )}

      <ConfirmDialog
        open={emptyConfirmOpen}
        title={tt("emptyTrash")}
        message={tt("confirmEmpty")}
        confirmLabel={tt("emptyTrash")}
        onConfirm={handleEmptyTrash}
        onCancel={() => setEmptyConfirmOpen(false)}
      />

      <ConfirmDialog
        open={purgeConfirmOpen}
        title={tt("purge")}
        message={tt("confirmPurge")}
        confirmLabel={tt("purge")}
        onConfirm={handlePurge}
        onCancel={() => {
          setPurgeConfirmOpen(false);
          setPurgeTarget(null);
        }}
      />
    </div>
  );
}
