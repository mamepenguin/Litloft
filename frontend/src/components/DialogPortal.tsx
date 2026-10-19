"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";

const DialogPortalContext = createContext<HTMLElement | null>(null);

export function DialogPortalProvider({
  target,
  children,
}: {
  target: HTMLElement | null;
  children: ReactNode;
}) {
  return (
    <DialogPortalContext.Provider value={target}>
      {children}
    </DialogPortalContext.Provider>
  );
}

/**
 * Returns `null` during SSR, so callers skip portalling until it is
 * non-null. On the client it falls back to `document.body` when no
 * provider has attached a host of its own.
 */
export function useDialogPortalTarget(): HTMLElement | null {
  const provided = useContext(DialogPortalContext);
  if (provided) return provided;
  return typeof document === "undefined" ? null : document.body;
}
