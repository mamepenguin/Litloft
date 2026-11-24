"use client";

import { createContext, useContext } from "react";

/**
 * The selected tab of the inspector that is currently mounted. Panels that
 * are mounted but not selected use it to answer `active` without remounting.
 */
export const InspectorActiveTabContext = createContext<string | null>(null);

export function useInspectorTabActive(tabId: string): boolean {
  return useContext(InspectorActiveTabContext) === tabId;
}
