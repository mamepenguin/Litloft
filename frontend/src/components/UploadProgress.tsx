"use client";

import { useState } from "react";
import { Check, ChevronRight, X } from "lucide-react";
import type { UploadState } from "@/hooks/useUpload";

interface UploadProgressProps {
  uploads: UploadState[];
  onCancel: (id: string) => void;
  onClearCompleted: () => void;
}

const statusLabel: Record<UploadState["status"], string> = {
  pending: "待機中",
  uploading: "アップロード中",
  processing: "処理中",
  complete: "完了",
  error: "エラー",
  cancelled: "キャンセル済み",
};

export function UploadProgress({
  uploads,
  onCancel,
  onClearCompleted,
}: UploadProgressProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (uploads.length === 0) return null;

  const activeCount = uploads.filter(
    (u) => u.status === "uploading" || u.status === "processing" || u.status === "pending"
  ).length;
  const completedCount = uploads.filter(
    (u) => u.status === "complete" || u.status === "error" || u.status === "cancelled"
  ).length;

  return (
    <div className="fixed bottom-0 right-0 z-40 w-full max-w-md">
      <div className="m-3 overflow-hidden rounded-xl border border-bg-border bg-bg-card shadow-2xl">
        {/* Header */}
        <button
          onClick={() => setCollapsed((prev) => !prev)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span className="text-sm font-medium text-text-primary">
            アップロード
            {activeCount > 0 && (
              <span className="ml-2 text-text-muted">
                {activeCount} 件処理中
              </span>
            )}
          </span>
          <div className="flex items-center gap-2">
            {completedCount > 0 && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onClearCompleted();
                }}
                className="text-xs text-text-muted hover:text-text-primary"
              >
                クリア
              </span>
            )}
            <ChevronRight
              size={16}
              className={`text-text-muted transition-transform ${
                collapsed ? "" : "rotate-90"
              }`}
            />
          </div>
        </button>

        {/* Upload list */}
        {!collapsed && (
          <div className="max-h-64 overflow-y-auto border-t border-bg-border">
            {uploads.map((upload) => (
              <div
                key={upload.id}
                className="border-b border-bg-border px-4 py-3 last:border-b-0"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="flex-1 truncate text-sm text-text-primary">
                    {upload.filename}
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`text-xs ${
                        upload.status === "error"
                          ? "text-red-400"
                          : upload.status === "complete"
                            ? "text-green-400"
                            : "text-text-muted"
                      }`}
                    >
                      {upload.status === "complete" ? (
                        <Check size={14} className="text-green-400" />
                      ) : (
                        statusLabel[upload.status]
                      )}
                    </span>
                    {(upload.status === "pending" ||
                      upload.status === "uploading") && (
                      <button
                        onClick={() => onCancel(upload.id)}
                        className="rounded p-0.5 text-text-muted hover:text-red-400"
                        aria-label="キャンセル"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                {(upload.status === "uploading" ||
                  upload.status === "processing") && (
                  <div className="h-1.5 overflow-hidden rounded-full bg-bg-elevated">
                    <div
                      className="h-full rounded-full bg-accent transition-all duration-300"
                      style={{ width: `${upload.progress}%` }}
                    />
                  </div>
                )}

                {upload.status === "error" && upload.error && (
                  <p className="mt-1 text-xs text-red-400">{upload.error}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
