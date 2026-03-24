"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, X } from "lucide-react";

interface RenameDialogProps {
  open: boolean;
  currentName: string;
  onRename: (newName: string) => void;
  onCancel: () => void;
}

export function RenameDialog({
  open,
  currentName,
  onRename,
  onCancel,
}: RenameDialogProps) {
  const [name, setName] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(currentName);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }
  }, [open, currentName]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCancel();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed && trimmed !== currentName) {
      onRename(trimmed);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative mx-4 w-full max-w-md rounded-xl bg-bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
            <Pencil size={18} />
            名前を変更
          </h2>
          <button
            onClick={onCancel}
            className="rounded-lg p-1 text-text-muted hover:text-text-primary"
            aria-label="閉じる"
          >
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mb-6 w-full rounded-lg border border-bg-border bg-bg-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            placeholder="新しい名前"
          />
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg bg-bg-elevated px-4 py-2 text-sm text-text-muted transition-colors hover:text-text-primary"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={!name.trim() || name.trim() === currentName}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/80 disabled:opacity-40"
            >
              変更
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
