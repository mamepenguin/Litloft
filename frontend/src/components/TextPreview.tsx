"use client";

import { useEffect, useState } from "react";
import { getStreamUrl } from "@/lib/api";
import { formatFileSize } from "@/lib/format";

const MAX_AUTO_LOAD_SIZE = 1024 * 1024; // 1MB

const TEXT_MIME_PREFIXES = ["text/"] as const;
const TEXT_MIME_EXACT = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/x-yaml",
  "application/yaml",
  "application/x-sh",
  "application/x-python",
  "application/x-ruby",
  "application/x-perl",
  "application/sql",
  "application/toml",
]);

export function isTextPreviewable(mimeType: string): boolean {
  if (TEXT_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix))) {
    return true;
  }
  return TEXT_MIME_EXACT.has(mimeType);
}

export function TextPreview({ fileId, fileSize }: { fileId: string; fileSize: number }) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(fileSize <= MAX_AUTO_LOAD_SIZE);

  useEffect(() => {
    if (!confirmed) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(getStreamUrl(fileId), { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.text();
      })
      .then((text) => {
        if (!cancelled) setContent(text);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fileId, confirmed]);

  if (!confirmed) {
    return (
      <div className="flex w-full flex-col items-center justify-center rounded-xl bg-bg-card py-16">
        <p className="text-sm text-text-muted">
          ファイルサイズが大きいです ({formatFileSize(fileSize)})
        </p>
        <button
          type="button"
          onClick={() => setConfirmed(true)}
          className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm text-white transition-colors hover:bg-accent/80"
        >
          読み込む
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex w-full items-center justify-center rounded-xl bg-bg-card py-16">
        <p className="text-sm text-text-muted">読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex w-full items-center justify-center rounded-xl bg-bg-card py-16">
        <p className="text-sm text-red-400">読み込みに失敗しました: {error}</p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden rounded-xl bg-bg-card">
      <pre className="max-h-[80vh] overflow-auto p-4 text-sm leading-relaxed text-text-primary font-mono whitespace-pre-wrap break-words">
        {content}
      </pre>
    </div>
  );
}
