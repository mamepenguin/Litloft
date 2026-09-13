"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * A second `useFileNav` call in the row would fetch `/neighbors` twice and
 * register the arrow-key shortcuts under the same id twice.
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

export function useFileNavState(): FileNavState | null {
  return useContext(FileNavContext);
}
