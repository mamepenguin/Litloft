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
 * Returns `null` during SSR and on the very first client render inside a
 * provider whose host has not attached yet; callers should skip
 * portalling until it is non-null.
 */
export function useDialogPortalTarget(): HTMLElement | null {
  const provided = useContext(DialogPortalContext);
  if (provided) return provided;
  return typeof document === "undefined" ? null : document.body;
}
