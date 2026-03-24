"use client";

import type { FileItem } from "@/types";
import { VideoPlayer } from "./VideoPlayer";
import { FileTypeIcon } from "./FileTypeIcon";
import { formatFileSize } from "@/lib/format";

export function FilePreview({ file }: { file: FileItem }) {
  if (file.file_type === "video") {
    return <VideoPlayer videoId={file.id} />;
  }

  return (
    <div className="flex w-full flex-col items-center justify-center rounded-xl bg-bg-card py-16">
      <FileTypeIcon fileType={file.file_type} size={64} className="mb-4 text-text-muted" />
      <p className="text-sm text-text-muted">{file.filename}</p>
      <p className="mt-1 text-xs text-text-muted">{formatFileSize(file.file_size)}</p>
      <p className="mt-4 text-xs text-text-muted">プレビューは対応していません</p>
    </div>
  );
}
