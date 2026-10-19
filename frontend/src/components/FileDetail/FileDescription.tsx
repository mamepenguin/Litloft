"use client";

import type { FileItem } from "@/types";
import type { MediaController } from "@/lib/mediaController";
import { SeekableDescription } from "../SeekableDescription";

interface FileDescriptionProps {
  file: FileItem;
  isTimedMedia: boolean;
  mediaController: MediaController | null;
  className?: string;
}

export function FileDescription({
  file,
  isTimedMedia,
  mediaController,
  className,
}: FileDescriptionProps) {
  if (!file.description) return null;
  return (
    <p
      className={`text-sm whitespace-pre-wrap text-text-muted${className ? ` ${className}` : ""}`}
    >
      {isTimedMedia ? (
        <SeekableDescription
          text={file.description}
          durationSeconds={file.duration}
          mediaController={mediaController}
        />
      ) : (
        file.description
      )}
    </p>
  );
}
