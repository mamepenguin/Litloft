"use client";

import { createContext, useContext } from "react";

/**
 * Allows children of `TwoPaneLayout` (primarily `FolderBrowser`) to
 * signal that the folder tree should refresh its data. The tree pane
 * subscribes via WebSocket events for normal in-band updates; this
 * context provides an explicit out-of-band fallback so that tree
 * state stays in sync even if a WS event is missed.
 */
export const TreeRefreshContext = createContext<() => void>(() => {});

export const useTreeRefresh = () => useContext(TreeRefreshContext);
