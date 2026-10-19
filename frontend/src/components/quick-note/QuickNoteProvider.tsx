"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

export interface QuickNoteOpenOptions {
  drive?: string;
  folder?: string;
}

type OpenHandler = (options?: QuickNoteOpenOptions) => void;

interface QuickNoteContextValue {
  open: OpenHandler;
  register: (handler: OpenHandler) => () => void;
}

const QuickNoteContext = createContext<QuickNoteContextValue | null>(null);

/**
 * The panel is mounted once, in the header; this lets code anywhere under the
 * app shell open that same panel instead of rendering a second one.
 */
export function QuickNoteProvider({ children }: { children: ReactNode }) {
  const handlerRef = useRef<OpenHandler | null>(null);

  const value = useMemo<QuickNoteContextValue>(
    () => ({
      open: (options) => handlerRef.current?.(options),
      register: (handler) => {
        handlerRef.current = handler;
        return () => {
          if (handlerRef.current === handler) handlerRef.current = null;
        };
      },
    }),
    [],
  );

  return <QuickNoteContext.Provider value={value}>{children}</QuickNoteContext.Provider>;
}

/** Outside a provider `open` does nothing, like the other shell hooks. */
export function useQuickNote(): { open: OpenHandler } {
  const ctx = useContext(QuickNoteContext);
  return useMemo(() => ({ open: ctx?.open ?? (() => {}) }), [ctx]);
}

export function useRegisterQuickNote(handler: OpenHandler): void {
  const ctx = useContext(QuickNoteContext);
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);
  useEffect(() => {
    if (!ctx) return;
    return ctx.register((options) => handlerRef.current(options));
  }, [ctx]);
}
