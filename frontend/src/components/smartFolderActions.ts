"use client";

import { createContext } from "react";

import type { SmartFolder } from "@/types/smartFolder";

export const SMART_COLLECTION_ACTIONS_SLOT = "smart-collection-actions";

export interface SmartFolderActions {
  current: SmartFolder | null;
  /** The URL's conditions differ from the folder's saved ones. */
  changed: boolean;
  saving: boolean;
  /** Checking the query's `in:` names before a create or overwrite. */
  checking: boolean;
  /** Play's condition holds on this search page. */
  canPlay: boolean;
  playing: boolean;
  play: () => void;
  save: () => void;
  overwrite: (options?: { moveFocus?: boolean }) => Promise<void>;
  rename: () => void;
  remove: () => void;
  toggleHome: () => void;
}

export const SmartFolderActionsContext =
  createContext<SmartFolderActions | null>(null);
