"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";

/**
 * The mobile Bottom Sheet runs vaul in `modal` mode, which puts
 * `pointer-events: none` on `<body>` and `aria-hidden="true"` on every other
 * body child, so a dialog opened from inside the sheet and portalled to
 * `document.body` would be rendered, stacked correctly, and completely inert.
 */
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
