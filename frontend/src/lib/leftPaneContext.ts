"use client";

import { createContext, useContext } from "react";

export interface LeftPaneState {
  /** The pane, read for the width it gives back when it yields. */
  element: HTMLElement | null;
  /** The stored tree setting shows the pane at this width. */
  shownBySetting: boolean;
  /** The pane covers the page below md, so nothing of the page may paint over it. */
  coversFilePage: boolean;
  /**
   * The sidebar has yielded its inline place to the pane, so the width it
   * still holds is on its way back to the content.
   */
  sidebarOverlay: boolean;
}

export const LeftPaneContext = createContext<LeftPaneState | null>(null);

export function useLeftPane(): LeftPaneState | null {
  return useContext(LeftPaneContext);
}
