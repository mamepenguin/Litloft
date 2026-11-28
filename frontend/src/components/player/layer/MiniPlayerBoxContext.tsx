"use client";

import { createContext, useContext } from "react";

/** Read by anything inside the player that must go quiet in the mini box. */
export const MiniPlayerBoxContext = createContext(false);

export function useInMiniPlayerBox(): boolean {
  return useContext(MiniPlayerBoxContext);
}
