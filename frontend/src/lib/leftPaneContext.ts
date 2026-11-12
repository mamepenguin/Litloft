"use client";

import { createContext, useContext } from "react";

export interface LeftPaneState {
  /** The pane, read for the width it gives back when it yields. */
  element: HTMLElement | null;
  /** The stored tree setting shows the pane at this width. */
  shownBySetting: boolean;
}

export const LeftPaneContext = createContext<LeftPaneState | null>(null);

export function useLeftPane(): LeftPaneState | null {
  return useContext(LeftPaneContext);
}
