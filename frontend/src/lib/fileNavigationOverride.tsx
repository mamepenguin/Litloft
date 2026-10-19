"use client";

import { createContext, useContext, type ReactNode } from "react";

const FileNavigationContext = createContext<((fileId: string) => void) | null>(
  null,
);

export function FileNavigationOverrideProvider({
  onNavigate,
  children,
}: {
  onNavigate: (fileId: string) => void;
  children: ReactNode;
}) {
  return (
    <FileNavigationContext.Provider value={onNavigate}>
      {children}
    </FileNavigationContext.Provider>
  );
}

export function useFileNavigationOverride(): ((fileId: string) => void) | null {
  return useContext(FileNavigationContext);
}
