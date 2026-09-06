"use client";

import { useCallback, useRef } from "react";

import type { UploadFileEntry } from "@/hooks/useUpload";

/**
 * Hands the browser's file chooser to whoever asks, and delivers what comes
 * back to the drop zone.
 *
 * The upload path is an event on `[data-upload-zone]` rather than a prop, so
 * anything on the page can start an upload — but the hidden `<input>`, the
 * reset of `value` that lets the same file be chosen twice running, and the
 * shape of the event are one recipe, and a second copy of it drifts. The
 * folder toolbar's add menu had the only copy until an empty folder needed
 * the same door.
 */
export function dispatchUploadEvent(detail: File[] | UploadFileEntry[]) {
  const uploadZone = document.querySelector<HTMLElement>("[data-upload-zone]");
  if (uploadZone) {
    uploadZone.dispatchEvent(new CustomEvent("upload-files", { detail }));
  }
}

export function useFilePicker() {
  const ref = useRef<HTMLInputElement>(null);

  const open = useCallback(() => ref.current?.click(), []);

  const input = (
    <input
      ref={ref}
      type="file"
      multiple
      className="hidden"
      onChange={(e) => {
        if (e.target.files) {
          dispatchUploadEvent(Array.from(e.target.files));
        }
        // Chosen, then chosen again: without this the second change event
        // never fires, and the button looks broken rather than busy.
        e.target.value = "";
      }}
    />
  );

  return { open, input };
}
