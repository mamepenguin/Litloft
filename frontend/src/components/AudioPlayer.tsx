"use client";

import type { FileItem } from "@/types";
import { FileTypeIcon } from "./FileTypeIcon";
import { getStreamUrl } from "@/lib/api";
import { formatFileSize } from "@/lib/format";

export function AudioPlayer({ file, onEnded }: { file: FileItem; onEnded?: () => void }) {
  return (
    <div className="flex w-full flex-col items-center justify-center rounded-xl bg-bg-card py-12">
      <FileTypeIcon fileType="audio" size={64} className="mb-4 text-text-muted" />
      <p className="mb-1 text-sm text-text-primary">{file.filename}</p>
      <p className="mb-6 text-xs text-text-muted">{formatFileSize(file.file_size)}</p>
      <audio
        src={getStreamUrl(file.id)}
        controls
        preload="metadata"
        className="w-full max-w-md"
        onEnded={onEnded}
      >
        お使いのブラウザは音声再生に対応していません。
      </audio>
    </div>
  );
}
