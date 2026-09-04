"use client";

import type { FileItem } from "@/types";
import type { MediaController } from "@/lib/mediaController";
import { SeekableDescription } from "../SeekableDescription";

interface FileDescriptionProps {
  file: FileItem;
  /** Media with a timeline, so the description's timestamps can seek. */
  isTimedMedia: boolean;
  mediaController: MediaController | null;
  className?: string;
}

/**
 * A file's description, wherever it is being shown.
 *
 * One component with two homes rather than two renderings: it sits with
 * the rest of the meta in the inspector for most kinds, and in the
 * canvas under the player for media, where the confirmed layout puts it
 * (`00-basis.md`: the canvas holds the viewer and the long things that
 * belong to it — description, detailed summary, derived views).
 *
 * Renders nothing when there is no description, so a caller can place
 * it unconditionally.
 */
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
