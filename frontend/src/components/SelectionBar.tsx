"use client";

import { useState } from "react";
import {
  Check,
  ClipboardCopy,
  ListMusic,
  Move,
  Pencil,
  RotateCcw,
  Scissors,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { batchDelete, batchGetFiles, batchMove, batchPurge, batchRestore, batchTag } from "@/lib/api";
import { BatchRenameDialog } from "./BatchRenameDialog";
import { useClipboard } from "./ClipboardProvider";
import { ConfirmDialog } from "./ConfirmDialog";
import { MoveDialog } from "./MoveDialog";
import { PlaylistPicker } from "./PlaylistPicker";

interface SelectionBarProps {
  count: number;
  selectedIds: Set<string>;
  totalCount: number;
  drive: string;
  currentPath?: string;
  isTrashView?: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onComplete: () => void;
}

export function SelectionBar({
  count,
  selectedIds,
  totalCount,
  drive,
  currentPath,
  isTrashView,
  onSelectAll,
  onClear,
  onComplete,
}: SelectionBarProps) {
  const t = useTranslations("selection");
  const tf = useTranslations("file");
  const tc = useTranslations("common");
  const tcb = useTranslations("clipboard");
  const tt = useTranslations("trash");
  const clipboard = useClipboard();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameFiles, setRenameFiles] = useState<{ id: string; filename: string }[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tagging, setTagging] = useState(false);
  const [playlistPickerOpen, setPlaylistPickerOpen] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);

  if (count === 0) return null;

  const ids = Array.from(selectedIds);
  const allSelected = count >= totalCount;

  async function handleBatchRestore() {
    try {
      await batchRestore(ids);
      onClear();
      onComplete();
    } catch {
      // ignore
    }
  }

  async function handleBatchPurge() {
    try {
      await batchPurge(ids);
      setPurgeOpen(false);
      onClear();
      onComplete();
    } catch {
      // keep dialog open
    }
  }

  async function handleBatchDelete() {
    try {
      await batchDelete(ids);
      setDeleteOpen(false);
      onClear();
      onComplete();
    } catch {
      // keep dialog open
    }
  }

  async function handleBatchMove(path: string) {
    try {
      await batchMove(ids, path);
      setMoveOpen(false);
      onClear();
      onComplete();
    } catch {
      // keep dialog open
    }
  }

  async function handleBatchTag() {
    const tags = tagInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (tags.length === 0) return;
    try {
      await batchTag(ids, tags);
      setTagInput("");
      setTagging(false);
      onClear();
      onComplete();
    } catch {
      // keep input open
    }
  }

  async function handleOpenRename() {
    try {
      const files = await batchGetFiles(ids);
      setRenameFiles(files.map((f) => ({ id: f.id, filename: f.filename })));
      setRenameOpen(true);
    } catch {
      // ignore
    }
  }

  function handleRenameComplete() {
    setRenameOpen(false);
    setRenameFiles([]);
    onClear();
    onComplete();
  }

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up-bar">
        <div className="mx-auto max-w-3xl px-3 pb-3 sm:pb-4">
          <div className="overflow-hidden rounded-2xl bg-bg-card shadow-[0_8px_40px_rgba(0,0,0,0.5)] ring-1 ring-white/[0.06]">
            {/* Header row: count + select all + close */}
            <div className="flex items-center gap-3 border-b border-white/[0.04] px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-accent/15 px-2 text-xs font-semibold tabular-nums text-accent">
                  {count}
                </span>
                <span className="text-sm font-medium text-text-primary">
                  {t("selected", { count })}
                </span>
              </div>

              {!allSelected && (
                <button
                  onClick={onSelectAll}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/10"
                >
                  <Check size={12} />
                  {t("selectAll")}
                </button>
              )}

              <button
                onClick={onClear}
                className="ml-auto rounded-lg p-1.5 text-text-muted transition-colors hover:bg-white/[0.06] hover:text-text-primary"
                aria-label={t("deselect")}
              >
                <X size={16} />
              </button>
            </div>

            {/* Actions row */}
            <div className="scrollbar-hide flex items-center gap-1 overflow-x-auto px-2 py-2">
              {isTrashView ? (
                <>
                  <ActionButton
                    icon={<RotateCcw size={15} />}
                    label={tt("restore")}
                    onClick={handleBatchRestore}
                  />
                  <ActionDivider />
                  <ActionButton
                    icon={<Trash2 size={15} />}
                    label={tt("purge")}
                    onClick={() => setPurgeOpen(true)}
                    variant="danger"
                  />
                </>
              ) : (
                <>
                  {/* Edit group */}
                  {tagging ? (
                    <div className="flex items-center gap-1.5 rounded-xl bg-white/[0.04] px-2 py-1">
                      <Tag size={14} className="shrink-0 text-accent" />
                      <input
                        type="text"
                        autoFocus
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleBatchTag();
                          if (e.key === "Escape") setTagging(false);
                        }}
                        placeholder="tag1, tag2..."
                        className="w-24 bg-transparent text-sm text-text-primary placeholder:text-text-muted/60 outline-none sm:w-36"
                      />
                      <button
                        onClick={handleBatchTag}
                        className="shrink-0 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-accent/80"
                      >
                        {tc("apply")}
                      </button>
                      <button
                        onClick={() => setTagging(false)}
                        className="shrink-0 rounded-md p-0.5 text-text-muted hover:text-text-primary"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <ActionButton
                      icon={<Tag size={15} />}
                      label={t("tagging")}
                      displayLabel={t("tag")}
                      onClick={() => setTagging(true)}
                    />
                  )}

                  <ActionButton
                    icon={<Pencil size={15} />}
                    label={t("rename")}
                    onClick={handleOpenRename}
                  />

                  <ActionDivider />

                  {/* Organize group */}
                  <ActionButton
                    icon={<ListMusic size={15} />}
                    label={tf("addToPlaylist")}
                    displayLabel={t("playlist")}
                    onClick={() => setPlaylistPickerOpen(true)}
                  />
                  <ActionButton
                    icon={<ClipboardCopy size={15} />}
                    label={tcb("copy")}
                    onClick={() => {
                      clipboard.copy(ids, drive, currentPath ?? "");
                      onClear();
                    }}
                  />
                  <ActionButton
                    icon={<Scissors size={15} />}
                    label={tcb("cut")}
                    onClick={() => {
                      clipboard.cut(ids, drive, currentPath ?? "");
                      onClear();
                    }}
                  />
                  <ActionButton
                    icon={<Move size={15} />}
                    label={tc("move")}
                    onClick={() => setMoveOpen(true)}
                  />

                  <ActionDivider />

                  {/* Destructive */}
                  <ActionButton
                    icon={<Trash2 size={15} />}
                    label={tt("moveToTrash")}
                    onClick={() => setDeleteOpen(true)}
                    variant="danger"
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title={tt("moveToTrash")}
        message={tt("batchConfirmMoveToTrash", { count })}
        confirmLabel={tt("moveToTrash")}
        note={tt("autoDelete")}
        onConfirm={handleBatchDelete}
        onCancel={() => setDeleteOpen(false)}
      />

      <ConfirmDialog
        open={purgeOpen}
        title={tt("batchPurgeTitle")}
        message={tt("batchPurgeMessage", { count })}
        confirmLabel={tt("purge")}
        onConfirm={handleBatchPurge}
        onCancel={() => setPurgeOpen(false)}
      />

      <MoveDialog
        open={moveOpen}
        drive={drive}
        currentPath={currentPath ?? ""}
        onMove={handleBatchMove}
        onCancel={() => setMoveOpen(false)}
      />

      <PlaylistPicker
        open={playlistPickerOpen}
        drive={drive}
        fileIds={ids}
        onClose={() => setPlaylistPickerOpen(false)}
      />

      <BatchRenameDialog
        open={renameOpen}
        files={renameFiles}
        onComplete={handleRenameComplete}
        onCancel={() => setRenameOpen(false)}
      />
    </>
  );
}

function ActionButton({
  icon,
  label,
  displayLabel,
  onClick,
  variant = "default",
}: {
  icon: React.ReactNode;
  label: string;
  displayLabel?: string;
  onClick: () => void;
  variant?: "default" | "danger";
}) {
  const colorClass =
    variant === "danger"
      ? "text-red-400 hover:bg-red-400/10 active:bg-red-400/15"
      : "text-text-muted hover:bg-white/[0.06] hover:text-text-primary active:bg-white/[0.08]";

  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors ${colorClass}`}
      aria-label={label}
    >
      {icon}
      <span className="hidden sm:inline">{displayLabel ?? label}</span>
    </button>
  );
}

function ActionDivider() {
  return <div className="mx-0.5 h-5 w-px shrink-0 bg-white/[0.06]" />;
}
