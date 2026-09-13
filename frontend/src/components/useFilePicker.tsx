"use client";

import { useCallback, useRef } from "react";

import type { UploadFileEntry } from "@/hooks/useUpload";

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
