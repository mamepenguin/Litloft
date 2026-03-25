"use client";

import type { FileItem } from "@/types";
import { VideoPlayer } from "./VideoPlayer";
import { AudioPlayer } from "./AudioPlayer";
import { FileTypeIcon } from "./FileTypeIcon";
import { formatFileSize } from "@/lib/format";
import { getStreamUrl } from "@/lib/api";

export function FilePreview({ file, onEnded, autoPlay }: { file: FileItem; onEnded?: () => void; autoPlay?: boolean }) {
  if (file.file_type === "video") {
    return <VideoPlayer videoId={file.id} onEnded={onEnded} autoPlay={autoPlay} />;
  }

  if (file.file_type === "image") {
    return (
      <div className="flex w-full items-center justify-center overflow-hidden rounded-xl bg-bg-card">
        <img
          src={getStreamUrl(file.id)}
          alt={file.title}
          className="max-h-[70vh] w-auto object-contain"
        />
      </div>
    );
  }

  if (file.file_type === "audio") {
    return <AudioPlayer file={file} onEnded={onEnded} autoPlay={autoPlay} />;
  }

  if (file.mime_type === "application/pdf") {
    return (
      <div className="w-full overflow-hidden rounded-xl bg-bg-card">
        <iframe
          src={getStreamUrl(file.id)}
          title={file.title}
          className="h-[80vh] w-full border-0"
        />
      </div>
    );
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
