"use client";

import { useState } from "react";
import { Move, Tag, Trash2, X } from "lucide-react";

import { batchDelete, batchMove, batchTag } from "@/lib/api";
import { ConfirmDialog } from "./ConfirmDialog";
import { MoveDialog } from "./MoveDialog";

interface SelectionBarProps {
  count: number;
  selectedIds: Set<string>;
  totalCount: number;
  drive: string;
  currentPath?: string;
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
  onSelectAll,
  onClear,
  onComplete,
}: SelectionBarProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tagging, setTagging] = useState(false);

  if (count === 0) return null;

  const ids = Array.from(selectedIds);

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

  return (
    <>
      <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-bg-elevated px-4 py-3 shadow-2xl ring-1 ring-bg-border">
        <span className="text-sm font-medium text-text-primary">
          {count} 件選択
        </span>

        {count < totalCount && (
          <button
            onClick={onSelectAll}
            className="text-xs text-accent hover:underline"
          >
            すべて選択
          </button>
        )}

        <div className="h-5 w-px bg-bg-border" />

        {tagging ? (
          <div className="flex items-center gap-2">
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
              className="w-40 rounded-lg bg-bg-card px-2 py-1 text-sm text-text-primary placeholder:text-text-muted outline-none focus:ring-2 focus:ring-accent"
            />
            <button
              onClick={handleBatchTag}
              className="rounded-lg bg-accent px-2 py-1 text-xs text-white hover:bg-accent/80"
            >
              適用
            </button>
          </div>
        ) : (
          <button
            onClick={() => setTagging(true)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-text-muted transition-colors hover:bg-bg-card hover:text-text-primary"
            aria-label="タグ付け"
          >
            <Tag size={16} />
            タグ
          </button>
        )}

        <button
          onClick={() => setMoveOpen(true)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-text-muted transition-colors hover:bg-bg-card hover:text-text-primary"
          aria-label="移動"
        >
          <Move size={16} />
          移動
        </button>

        <button
          onClick={() => setDeleteOpen(true)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-red-400 transition-colors hover:bg-red-400/10"
          aria-label="削除"
        >
          <Trash2 size={16} />
          削除
        </button>

        <div className="h-5 w-px bg-bg-border" />

        <button
          onClick={onClear}
          className="rounded-lg p-1.5 text-text-muted transition-colors hover:text-text-primary"
          aria-label="選択解除"
        >
          <X size={16} />
        </button>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="ファイルを一括削除"
        message={`${count} 件のファイルを削除しますか？この操作は取り消せません。`}
        confirmLabel="削除"
        onConfirm={handleBatchDelete}
        onCancel={() => setDeleteOpen(false)}
      />

      <MoveDialog
        open={moveOpen}
        drive={drive}
        currentPath={currentPath ?? ""}
        onMove={handleBatchMove}
        onCancel={() => setMoveOpen(false)}
      />
    </>
  );
}
