"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import { batchCopy, batchMove } from "@/lib/api";

const STORAGE_KEY = "hv_clipboard";

interface ClipboardState {
  fileIds: string[];
  mode: "copy" | "cut";
  sourceDrive: string;
  sourcePath: string;
}

interface ClipboardContextValue {
  clipboard: ClipboardState | null;
  copy: (fileIds: string[], drive: string, path: string) => void;
  cut: (fileIds: string[], drive: string, path: string) => void;
  paste: (targetDrive: string, targetPath: string) => Promise<void>;
  clear: () => void;
  isCut: (fileId: string) => boolean;
}

const ClipboardContext = createContext<ClipboardContextValue | null>(null);

function loadFromStorage(): ClipboardState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      Array.isArray(parsed.fileIds) &&
      (parsed.mode === "copy" || parsed.mode === "cut") &&
      typeof parsed.sourceDrive === "string" &&
      typeof parsed.sourcePath === "string"
    ) {
      return parsed as ClipboardState;
    }
    return null;
  } catch {
    return null;
  }
}

function saveToStorage(state: ClipboardState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // sessionStorage may be unavailable
  }
}

function removeFromStorage(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // sessionStorage may be unavailable
  }
}

export function ClipboardProvider({ children }: { children: ReactNode }) {
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);
  const router = useRouter();

  useEffect(() => {
    setClipboard(loadFromStorage());
  }, []);

  const copy = useCallback(
    (fileIds: string[], drive: string, path: string) => {
      const state: ClipboardState = {
        fileIds,
        mode: "copy",
        sourceDrive: drive,
        sourcePath: path,
      };
      setClipboard(state);
      saveToStorage(state);
    },
    [],
  );

  const cut = useCallback(
    (fileIds: string[], drive: string, path: string) => {
      const state: ClipboardState = {
        fileIds,
        mode: "cut",
        sourceDrive: drive,
        sourcePath: path,
      };
      setClipboard(state);
      saveToStorage(state);
    },
    [],
  );

  const clear = useCallback(() => {
    setClipboard(null);
    removeFromStorage();
  }, []);

  const paste = useCallback(
    async (targetDrive: string, targetPath: string) => {
      if (!clipboard) return;

      try {
        if (clipboard.mode === "copy") {
          await batchCopy(clipboard.fileIds, targetPath, targetDrive);
        } else {
          await batchMove(clipboard.fileIds, targetPath, targetDrive);
          setClipboard(null);
          removeFromStorage();
        }
        router.refresh();
      } catch (error) {
        throw error;
      }
    },
    [clipboard, router],
  );

  const isCut = useCallback(
    (fileId: string) => {
      if (!clipboard || clipboard.mode !== "cut") return false;
      return clipboard.fileIds.includes(fileId);
    },
    [clipboard],
  );

  const value = useMemo(
    () => ({ clipboard, copy, cut, paste, clear, isCut }),
    [clipboard, copy, cut, paste, clear, isCut],
  );

  return (
    <ClipboardContext value={value}>
      {children}
    </ClipboardContext>
  );
}

export function useClipboard(): ClipboardContextValue {
  const ctx = useContext(ClipboardContext);
  if (!ctx) {
    throw new Error("useClipboard must be used within a ClipboardProvider");
  }
  return ctx;
}
