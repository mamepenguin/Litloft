"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Where a file-detail surface publishes its `useFileNav` result so the
 * page row can draw visible prev / next controls.
 *
 * The hook has to stay with the host — `onNavigate` means `selectFile`
 * in the 2-pane host and `router.replace` in the fullscreen one, and
 * only the host knows which. But the row that shows the controls is
 * four components below it (`FileDetailContent` -> presenter ->
 * `ShellLayout` -> `FileDetailShell`), and every layer in between would
 * otherwise carry five props it has no use for.
 *
 * A second `useFileNav` call in the row would be the other option, and
 * it would fetch `/neighbors` twice and register the arrow-key
 * shortcuts under the same id twice. One caller, published.
 */
export interface FileNavState {
  prevId: string | null;
  nextId: string | null;
  position: number | null;
  total: number | null;
  navigatePrev: () => void;
  navigateNext: () => void;
}

const FileNavContext = createContext<FileNavState | null>(null);

export function FileNavProvider({
  value,
  children,
}: {
  value: FileNavState;
  children: ReactNode;
}) {
  return (
    <FileNavContext.Provider value={value}>{children}</FileNavContext.Provider>
  );
}

/** Null where no host published one — the controls are then not drawn. */
export function useFileNavState(): FileNavState | null {
  return useContext(FileNavContext);
}
