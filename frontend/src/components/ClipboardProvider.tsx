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
import { useTranslations } from "next-intl";

import { batchCopy, batchMove } from "@/lib/api";
import { useToast } from "@/components/ToastProvider";

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

  const toast = useToast();
  const t = useTranslations("clipboard");

  const clear = useCallback(() => {
    setClipboard(null);
    removeFromStorage();
  }, []);

  const paste = useCallback(
    async (targetDrive: string, targetPath: string) => {
      if (!clipboard) return;

      // Both endpoints answer 200 with a count and a per-file error list
      // rather than throwing, so what happened has to be read off the
      // body. A rejection here is the request itself being refused —
      // a locked target drive, a restart mid-paste — and nothing was
      // written, so the clipboard is what lets it be tried again.
      let result: { pasted: number; failed: number };
      try {
        result =
          clipboard.mode === "copy"
            ? await batchCopy(clipboard.fileIds, targetPath, targetDrive).then((r) => ({
                pasted: r.copied,
                failed: r.errors.length,
              }))
            : await batchMove(clipboard.fileIds, targetPath, targetDrive).then((r) => ({
                pasted: r.moved,
                failed: r.errors.length,
              }));
      } catch {
        // A count would be a guess here; the honest statement is that it
        // did not happen. Not rethrown: this is the only place that knows
        // what to say, and the one caller had an empty `catch` whose whole
        // job was to absorb the rejection.
        toast.error(t("pasteRefused"));
        return;
      }

      // Cleared once something landed, so a second paste cannot duplicate
      // what the first one already put there. A paste that moved nothing
      // is not a paste, and keeping the clipboard is what lets it be
      // tried again.
      if (result.pasted > 0) {
        setClipboard(null);
        removeFromStorage();
      }
      // The clipboard is cleared on partial success, so the failures must
      // be reported here.
      if (result.failed > 0) {
        toast.error(t("pasteFailed", { count: result.failed }));
      }
      router.refresh();
    },
    [clipboard, router, t, toast],
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
