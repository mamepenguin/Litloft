"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";

/**
 * Where a dialog should portal to.
 *
 * `document.body` is right almost everywhere, and is what you get when
 * nothing provides a target. The exception is the mobile Bottom Sheet:
 * it runs vaul in `modal` mode, which puts `pointer-events: none` on
 * `<body>` and `aria-hidden="true"` on every other body child. A dialog
 * opened from inside the sheet — Rename, Move, Trash, an addon's own —
 * would be rendered, stacked correctly, and completely inert.
 *
 * So the sheet provides a host node inside its own subtree, and dialogs
 * launched from within it land there instead. Everywhere else the
 * context is absent and the fallback applies, so no caller has to know
 * which surface it is on.
 *
 * See `DESIGN.md` §Layering.
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
 * The node to pass as `createPortal`'s second argument.
 *
 * Returns `null` during SSR and on the very first client render inside a
 * provider whose host has not attached yet; callers should skip
 * portalling until it is non-null. In practice a dialog only opens on a
 * user action, long after that.
 */
export function useDialogPortalTarget(): HTMLElement | null {
  const provided = useContext(DialogPortalContext);
  if (provided) return provided;
  return typeof document === "undefined" ? null : document.body;
}
