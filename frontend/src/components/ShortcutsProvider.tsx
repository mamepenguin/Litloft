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

import {
  normalizeKey,
  orderContexts,
  type ShortcutContextDef,
} from "@/lib/shortcuts";
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
      const target = e.target instanceof HTMLElement ? e.target : null;
      const tag = target?.tagName;
      const isEditing =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable === true ||
        Boolean(target?.closest('[contenteditable="true"]'));

      const normalized = normalizeKey(e);

      // Escape always closes the cheat sheet regardless of focus
      if (normalized === "escape" && cheatSheetOpen) {
        e.preventDefault();
        setCheatSheetOpen(false);
        return;
      }

      // Toggle cheat sheet with '?' (suppressed while editing so users can type)
      if (normalized === "?" && !isEditing) {
        e.preventDefault();
        setCheatSheetOpen((prev) => !prev);
        return;
      }

      // If cheat sheet is open, ignore other shortcuts
      if (cheatSheetOpen) return;

      // Walk the stack in resolution order (overlay tiers first, then most
      // recently pushed) and pick the first shortcut whose editingOnly flag
      // matches the current focus state. Partitioning by focus lets the same
      // key bind to different handlers in editor vs non-editor contexts
      // without needing to toggle layers manually.
      const ordered = orderContexts(stackRef.current);
      for (let i = 0; i < ordered.length; i++) {
        const ctx = ordered[i];
        const match = ctx.shortcuts.find((s) => {
          if (s.key !== normalized) return false;
          // editingOnly === false: fires regardless of focus state.
          // editingOnly === true: only when an editing element has focus.
          // editingOnly === undefined: only when no editing element has focus.
          if (s.editingOnly === false) return true;
          return Boolean(s.editingOnly) === isEditing;
        });
        if (match) {
          e.preventDefault();
          match.handler();
          return;
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
