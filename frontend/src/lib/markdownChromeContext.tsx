"use client";

import { createContext, useContext, type ReactNode } from "react";

export type MarkdownViewMode = "edit" | "split" | "preview";

export type MarkdownSaveStatus =
  | "idle"
  | "saving"
  | "saved"
  | "conflict"
  | "error";

export interface MarkdownSaveState {
  status: MarkdownSaveStatus;
  message?: string;
}

export interface MarkdownChromeContextValue {
  viewMode: MarkdownViewMode;
  setViewMode: (m: MarkdownViewMode) => void;
  publishSaveState: (s: MarkdownSaveState) => void;
  isMobile: boolean;
}

const Ctx = createContext<MarkdownChromeContextValue | null>(null);

export function MarkdownChromeProvider({
  value,
  children,
}: {
  value: MarkdownChromeContextValue;
  children: ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * A `null` return means the consumer is mounted outside a document layout
 * (e.g. the standalone `/addons/knowledge` route) and must keep its own
 * fallback behaviour.
 */
export function useMarkdownChrome(): MarkdownChromeContextValue | null {
  return useContext(Ctx);
}
