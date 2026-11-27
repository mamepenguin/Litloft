"use client";

import { createContext, useContext } from "react";

import type { FileNavState } from "@/lib/fileNavContext";

/**
 * The page row and the right pane read a queue page's own walk instead of
 * `/neighbors`, and the collection crumb replaces the file's folder in the
 * trail.
 */
export interface QueuePageState extends FileNavState {
  /** The queue's name, as the trail and the pane's top block show it. */
  name: string;
  /** Where the name goes: the collection list, or the folder's listing. */
  href: string;
  onEnded: () => void;
}

const QueuePageContext = createContext<QueuePageState | null>(null);

export function QueuePageProvider({
  value,
  children,
}: {
  value: QueuePageState;
  children: React.ReactNode;
}) {
  return (
    <QueuePageContext.Provider value={value}>
      {children}
    </QueuePageContext.Provider>
  );
}

export function useQueuePage(): QueuePageState | null {
  return useContext(QueuePageContext);
}
