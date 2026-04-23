"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

import { normalizeKey, type ShortcutContextDef } from "@/lib/shortcuts";
import { ShortcutCheatSheet } from "./ShortcutCheatSheet";

interface ShortcutsContextValue {
  push(ctx: ShortcutContextDef): void;
  pop(id: string): void;
  stack: ShortcutContextDef[];
}

export const ShortcutsContext = createContext<ShortcutsContextValue>({
  push: () => {},
  pop: () => {},
  stack: [],
});

export function useShortcutsContext(): ShortcutsContextValue {
  return useContext(ShortcutsContext);
}

export function ShortcutsProvider({ children }: { children: ReactNode }): ReactElement {
  const [stack, setStack] = useState<ShortcutContextDef[]>([]);
  const [cheatSheetOpen, setCheatSheetOpen] = useState(false);

  // Keep a ref to the latest stack so the keydown handler always sees it
  // without needing to be re-registered on every stack change.
  const stackRef = useRef<ShortcutContextDef[]>(stack);
  useEffect(() => {
    stackRef.current = stack;
  }, [stack]);

  const push = useCallback((ctx: ShortcutContextDef) => {
    setStack((prev) => {
      // Remove any existing entry with the same id before pushing so that
      // re-registrations from StrictMode double-mount don't duplicate entries.
      const filtered = prev.filter((c) => c.id !== ctx.id);
      return [...filtered, ctx];
    });
  }, []);

  const pop = useCallback((id: string) => {
    setStack((prev) => prev.filter((c) => c.id !== id));
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isEditing =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;

      const normalized = normalizeKey(e);

      // Escape always closes the cheat sheet regardless of focus
      if (normalized === "escape" && cheatSheetOpen) {
        e.preventDefault();
        setCheatSheetOpen(false);
        return;
      }

      // Skip all other shortcuts when typing in form elements
      if (isEditing) return;

      // Toggle cheat sheet with '?'
      if (normalized === "?") {
        e.preventDefault();
        setCheatSheetOpen((prev) => !prev);
        return;
      }

      // If cheat sheet is open, ignore other shortcuts
      if (cheatSheetOpen) return;

      const currentStack = stackRef.current;

      // Search from top of stack downward
      const top = currentStack[currentStack.length - 1];
      if (top) {
        const match = top.shortcuts.find((s) => s.key === normalized);
        if (match) {
          e.preventDefault();
          match.handler();
          return;
        }
      }

      // Fall back to global context
      const globalCtx = currentStack.find((c) => c.id === "global");
      if (globalCtx && globalCtx !== top) {
        const match = globalCtx.shortcuts.find((s) => s.key === normalized);
        if (match) {
          e.preventDefault();
          match.handler();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [cheatSheetOpen]);

  return (
    <ShortcutsContext.Provider value={{ push, pop, stack }}>
      {children}
      <ShortcutCheatSheet
        open={cheatSheetOpen}
        stack={stack}
        onClose={() => setCheatSheetOpen(false)}
      />
    </ShortcutsContext.Provider>
  );
}
