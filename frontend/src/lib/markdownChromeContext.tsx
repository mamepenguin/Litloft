"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Shared chrome state for the Markdown document layout.
 *
 * The `MarkdownDocumentLayout` owns the unified top chrome (TreeToggle
 * + save dot + title + view-mode toggle + Inspector toggle) but the
 * controls operate on state that lives partly inside the Knowledge
 * Editor (save state) and partly inside the layout itself (view mode,
 * Inspector visibility). This context bridges the two:
 *
 *   - `viewMode` / `setViewMode` are owned by the layout so the toggle
 *     can render without waiting for the Editor to mount. The Editor
 *     reads these values when present and falls back to local state
 *     when standalone.
 *   - `publishSaveState` flows the other direction: the Editor still
 *     owns its save lifecycle (it's the writer); it pushes status up
 *     so the chrome's save dot can reflect it.
 *   - `isMobile` is the layout's authoritative viewport snapshot so
 *     consumers don't run duplicate `matchMedia` listeners.
 *
 * Consumers should treat `useMarkdownChrome()` as best-effort: a `null`
 * return means the consumer is mounted outside a document layout (e.g.
 * the standalone `/addons/knowledge` route) and must keep its own
 * fallback behaviour. This keeps the addon decoupled from the host.
 */

export type MarkdownViewMode = "edit" | "split" | "preview";

export type MarkdownSaveStatus =
  | "idle"
  | "saving"
  | "saved"
  | "conflict"
  | "error";

export interface MarkdownSaveState {
  status: MarkdownSaveStatus;
  /** Only set when `status === "error"`. */
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

export function useMarkdownChrome(): MarkdownChromeContextValue | null {
  return useContext(Ctx);
}
