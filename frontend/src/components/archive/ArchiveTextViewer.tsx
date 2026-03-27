"use client";

import { ArrowLeft } from "lucide-react";

import { formatFileSize } from "@/lib/format";
import type { ArchiveEntry } from "@/types";

interface ArchiveTextViewerProps {
  viewingEntry: ArchiveEntry;
  textConfirmed: boolean;
  textLoading: boolean;
  textError: string | null;
  textContent: string | null;
  setTextConfirmed: (value: boolean) => void;
  closeViewer: () => void;
}

export function ArchiveTextViewer({
  viewingEntry,
  textConfirmed,
  textLoading,
  textError,
  textContent,
  setTextConfirmed,
  closeViewer,
}: ArchiveTextViewerProps) {
  return (
    <div className="mt-4 rounded-xl bg-bg-card" data-testid="text-viewer">
      <div className="flex items-center justify-between border-b border-bg-border px-4 py-3">
        <button
          onClick={closeViewer}
          className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text-primary"
        >
          <ArrowLeft size={16} />
          一覧に戻る
        </button>
        <span className="text-sm text-text-muted">
          {viewingEntry.filename}
        </span>
      </div>

      {!textConfirmed ? (
        <div className="flex flex-col items-center justify-center py-16">
          <p className="text-sm text-text-muted">
            ファイルサイズが大きいです (
            {formatFileSize(viewingEntry.file_size)})
          </p>
          <button
            type="button"
            onClick={() => setTextConfirmed(true)}
            className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm text-white transition-colors hover:bg-accent/80"
          >
            読み込む
          </button>
        </div>
      ) : textLoading ? (
        <div className="flex items-center justify-center py-16">
          <p className="text-sm text-text-muted">読み込み中...</p>
        </div>
      ) : textError ? (
        <div className="flex items-center justify-center py-16">
          <p className="text-sm text-red-400">
            読み込みに失敗しました: {textError}
          </p>
        </div>
      ) : (
        <pre className="max-h-[60vh] overflow-auto p-4 font-mono text-sm leading-relaxed text-text-primary whitespace-pre-wrap break-words">
          {textContent}
        </pre>
      )}
    </div>
  );
}
