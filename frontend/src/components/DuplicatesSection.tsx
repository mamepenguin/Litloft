"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  FolderOpen,
  Loader2,
  Shield,
  Trash2,
} from "lucide-react";

import { batchDelete, getDrives, getDuplicates, getThumbnailUrl } from "@/lib/api";
import { formatFileSize } from "@/lib/format";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { Drive, DuplicateGroup, DuplicatesResponse, FileItem } from "@/types";

function DuplicatesSkeleton() {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-5 animate-pulse">
      <div className="mb-4 h-5 w-48 rounded bg-bg-elevated" />
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 w-full rounded-lg bg-bg-elevated" />
        ))}
      </div>
    </div>
  );
}

function DriveSelector({
  drives,
  selectedDrive,
  onSelect,
}: {
  drives: Drive[];
  selectedDrive: string;
  onSelect: (drive: string) => void;
}) {
  const t = useTranslations("admin");

  return (
    <select
      value={selectedDrive}
      onChange={(e) => onSelect(e.target.value)}
      className="rounded-lg border border-bg-border bg-bg-elevated px-3 py-1.5 text-sm text-text-primary"
      aria-label={t("selectDrive")}
    >
      <option value="">{t("selectDrive")}</option>
      {drives.map((drive) => (
        <option key={drive.name} value={drive.name}>
          {drive.name}
        </option>
      ))}
    </select>
  );
}

function DuplicateStats({ data }: { data: DuplicatesResponse }) {
  const t = useTranslations("admin");

  return (
    <div className="mb-4 flex flex-wrap gap-3">
      <span className="inline-flex items-center gap-1.5 rounded-md bg-bg-elevated px-2.5 py-1 text-xs text-text-muted">
        <Copy size={12} />
        {t("duplicateGroups", { count: data.total_groups })}
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-md bg-danger/10 px-2.5 py-1 text-xs text-danger">
        <Trash2 size={12} />
        {t("wastedSpace", { size: formatFileSize(data.total_wasted_bytes) })}
      </span>
    </div>
  );
}

function FileRow({
  file,
  isKept,
  isSelected,
  onToggle,
}: {
  file: FileItem;
  isKept: boolean;
  isSelected: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("admin");

  return (
    <label
      className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
        isKept
          ? "bg-emerald-500/10 border border-emerald-500/30"
          : "hover:bg-bg-elevated"
      }`}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggle}
        className="h-4 w-4 shrink-0 rounded border-bg-border accent-accent"
      />
      <img
        src={getThumbnailUrl(file.id)}
        alt=""
        className="h-10 w-10 shrink-0 rounded object-cover bg-bg-elevated"
        loading="lazy"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-text-primary">
          {file.filename}
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span className="inline-flex items-center gap-1">
            <FolderOpen size={10} />
            <span className="truncate max-w-[200px]">
              {file.folder_path || "/"}
            </span>
          </span>
          <span>{formatFileSize(file.file_size)}</span>
        </div>
      </div>
      {isKept && (
        <span className="shrink-0 rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
          <Shield size={10} className="mr-0.5 inline" />
          {t("keepFile")}
        </span>
      )}
    </label>
  );
}

function DuplicateGroupCard({
  group,
  onDeleteComplete,
}: {
  group: DuplicateGroup;
  onDeleteComplete: () => void;
}) {
  const t = useTranslations("admin");
  const [isExpanded, setIsExpanded] = useState(false);
  const [keptFileId, setKeptFileId] = useState(group.files[0]?.id ?? "");
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const filesToDelete = group.files.filter((f) => f.id !== keptFileId);
  const wastedSize = filesToDelete.reduce((sum, f) => sum + f.file_size, 0);

  const handleDelete = useCallback(async () => {
    if (filesToDelete.length === 0) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await batchDelete(filesToDelete.map((f) => f.id));
      onDeleteComplete();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
    }
  }, [filesToDelete, onDeleteComplete]);

  return (
    <div className="rounded-lg border border-bg-border bg-bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-bg-elevated transition-colors"
      >
        {isExpanded ? (
          <ChevronDown size={16} className="shrink-0 text-text-muted" />
        ) : (
          <ChevronRight size={16} className="shrink-0 text-text-muted" />
        )}
        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium text-text-primary truncate block">
            {group.files[0]?.filename ?? group.hash}
          </span>
          <span className="text-xs text-text-muted">
            {t("filesInGroup", { count: group.files.length })}
            {" \u00B7 "}
            {formatFileSize(wastedSize)}
          </span>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-bg-border px-4 py-3">
          <div className="space-y-2">
            {group.files.map((file) => (
              <FileRow
                key={file.id}
                file={file}
                isKept={file.id === keptFileId}
                isSelected={file.id === keptFileId}
                onToggle={() => setKeptFileId(file.id)}
              />
            ))}
          </div>

          {deleteError && (
            <div className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {deleteError}
            </div>
          )}

          {filesToDelete.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={deleting}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              {deleting ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Trash2 size={12} />
              )}
              {t("deleteSelected")} ({filesToDelete.length})
            </button>
          )}

          <ConfirmDialog
            open={confirmOpen}
            title={t("deleteSelected")}
            message={t("confirmDelete", { count: filesToDelete.length })}
            confirmLabel={t("deleteSelected")}
            onConfirm={handleDelete}
            onCancel={() => setConfirmOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

function EmptyDuplicates() {
  const t = useTranslations("admin");

  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-8 text-center">
      <Copy size={32} className="mx-auto mb-3 text-text-muted opacity-50" />
      <p className="text-sm font-medium text-text-primary">{t("noDuplicates")}</p>
      <p className="mt-1 text-xs text-text-muted">{t("noDuplicatesDescription")}</p>
    </div>
  );
}

export function DuplicatesSection() {
  const t = useTranslations("admin");
  const [drives, setDrives] = useState<Drive[]>([]);
  const [selectedDrive, setSelectedDrive] = useState("");
  const [data, setData] = useState<DuplicatesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDrives()
      .then(setDrives)
      .catch(() => {
        // Drives are already loaded in the parent dashboard
      });
  }, []);

  const fetchDuplicates = useCallback(async (drive: string) => {
    if (!drive) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await getDuplicates(drive);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const handleDriveSelect = useCallback(
    (drive: string) => {
      setSelectedDrive(drive);
      fetchDuplicates(drive);
    },
    [fetchDuplicates],
  );

  const handleDeleteComplete = useCallback(() => {
    fetchDuplicates(selectedDrive);
  }, [fetchDuplicates, selectedDrive]);

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase text-text-muted">
          {t("duplicates")}
        </h2>
        <DriveSelector
          drives={drives}
          selectedDrive={selectedDrive}
          onSelect={handleDriveSelect}
        />
      </div>

      {!selectedDrive && (
        <div className="rounded-xl border border-bg-border bg-bg-card p-8 text-center">
          <Copy size={32} className="mx-auto mb-3 text-text-muted opacity-50" />
          <p className="text-sm text-text-muted">{t("duplicatesDescription")}</p>
        </div>
      )}

      {selectedDrive && loading && <DuplicatesSkeleton />}

      {selectedDrive && error && (
        <div className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {selectedDrive && !loading && !error && data && (
        <>
          {data.total_groups === 0 ? (
            <EmptyDuplicates />
          ) : (
            <div>
              <DuplicateStats data={data} />
              <div className="space-y-3">
                {data.groups.map((group) => (
                  <DuplicateGroupCard
                    key={group.hash}
                    group={group}
                    onDeleteComplete={handleDeleteComplete}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
