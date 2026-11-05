"use client";

import { useCallback, useRef, useState } from "react";

import { prepareImage, storeImage } from "@/lib/imageQuery";

export type ImageInputError = "too_large" | "unreadable" | "one_image";

/** Prepares one image at a time; a later image or a cancel wins. */
export function useImageInput(onReady: (id: string) => void) {
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<ImageInputError | null>(null);
  const token = useRef(0);

  const cancel = useCallback(() => {
    token.current += 1;
    setPreparing(false);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const give = useCallback(
    async (file: File) => {
      const mine = ++token.current;
      setError(null);
      setPreparing(true);
      const prepared = await prepareImage(file);
      if (mine !== token.current) return;
      setPreparing(false);
      if (prepared === null) return;
      if ("error" in prepared) {
        setError(prepared.error);
        return;
      }
      onReady(storeImage(prepared.blob, prepared.type));
    },
    [onReady],
  );

  return { preparing, error, setError, clearError, give, cancel };
}
