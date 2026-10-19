"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { createTextFile } from "@/lib/api";

interface UseCreateFileReturn {
  createFile: (targetPath?: string) => Promise<void>;
  isCreating: boolean;
}

/**
 * Local time matches what the user sees in the file listing; UTC would be
 * surprising for someone glancing at the timestamp.
 */
function formatTimestamp(d: Date): string {
  const pad = (n: number): string => n.toString().padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

export function useCreateFile(drive: string, currentPath: string): UseCreateFileReturn {
  const router = useRouter();
  const t = useTranslations("folder");
  const [isCreating, setIsCreating] = useState(false);
  // Mirror the state into a ref so a synchronous double-call sees the
  // latched flag without waiting for the next React render.
  const inFlightRef = useRef(false);

  const createFile = useCallback(async (targetPath?: string) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsCreating(true);
    try {
      const ts = formatTimestamp(new Date());
      const fileName = `untitled-${ts}.md`;
      const folder = targetPath ?? currentPath;
      const path = folder ? `${folder}/${fileName}` : fileName;
      const file = await createTextFile(drive, { path, content: "" });
      router.push(`/files/${file.id}?edit=1`);
    } catch (err) {
      console.error("createFile failed:", err);
      const msg = err instanceof Error ? err.message : "";
      const message = /\b403\b/.test(msg)
        ? t("createFileForbidden")
        : t("createFileFailed");
      if (typeof window !== "undefined" && typeof window.alert === "function") {
        window.alert(message);
      }
    } finally {
      inFlightRef.current = false;
      setIsCreating(false);
    }
  }, [drive, currentPath, router, t]);

  return { createFile, isCreating };
}
