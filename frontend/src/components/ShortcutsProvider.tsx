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

import { COMPOSITION_GRACE_MS, IME_KEY_CODE } from "@/lib/ime";
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
  openCheatSheet(): void;
}

export const ShortcutsContext = createContext<ShortcutsContextValue>({
  push: () => {},
  pop: () => {},
  stack: [],
  openCheatSheet: () => {},
});

export function useShortcutsContext(): ShortcutsContextValue {
  return useContext(ShortcutsContext);
}

export function ShortcutsProvider({ children }: { children: ReactNode }): ReactElement {
  const [stack, setStack] = useState<ShortcutContextDef[]>([]);
  const [cheatSheetOpen, setCheatSheetOpen] = useState(false);
  const openCheatSheet = useCallback(() => setCheatSheetOpen(true), []);

  const stackRef = useRef<ShortcutContextDef[]>(stack);
  useEffect(() => {
    stackRef.current = stack;
  }, [stack]);

  const push = useCallback((ctx: ShortcutContextDef) => {
    setStack((prev) => {
      // Re-registrations from StrictMode double-mount must not duplicate entries.
      const filtered = prev.filter((c) => c.id !== ctx.id);
      return [...filtered, ctx];
    });
  }, []);

  const pop = useCallback((id: string) => {
    setStack((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // An IME's confirming keystroke reaches the page looking exactly like a
  // bare press — see `@/lib/ime`.
  const compositionEndedAtRef = useRef(0);
  useEffect(() => {
    const onCompositionEnd = () => {
      compositionEndedAtRef.current = Date.now();
    };
    document.addEventListener("compositionend", onCompositionEnd, true);
    return () =>
      document.removeEventListener("compositionend", onCompositionEnd, true);
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.isComposing || e.keyCode === IME_KEY_CODE) return;
      // And so does the one that just ended it. Escape cancels a
      // candidate list; without this it would also close the dialog the
      // user was typing into.
      if (
        (e.key === "Escape" || e.key === "Enter") &&
        Date.now() - compositionEndedAtRef.current < COMPOSITION_GRACE_MS
      ) {
        compositionEndedAtRef.current = 0;
        return;
      }
      const target = e.target instanceof HTMLElement ? e.target : null;
      const tag = target?.tagName;
      const isEditing =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable === true ||
        Boolean(target?.closest('[contenteditable="true"]'));

      const normalized = normalizeKey(e);

      if (normalized === "escape" && cheatSheetOpen) {
        e.preventDefault();
        setCheatSheetOpen(false);
        return;
      }

      if (normalized === "?" && !isEditing) {
        e.preventDefault();
        setCheatSheetOpen((prev) => !prev);
        return;
      }

      if (cheatSheetOpen) return;

      // Partitioning by focus lets the same key bind to different handlers
      // in editor vs non-editor contexts.
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
    <ShortcutsContext.Provider value={{ push, pop, stack, openCheatSheet }}>
      {children}
      <ShortcutCheatSheet
        open={cheatSheetOpen}
        stack={stack}
        onClose={() => setCheatSheetOpen(false)}
      />
    </ShortcutsContext.Provider>
  );
}
