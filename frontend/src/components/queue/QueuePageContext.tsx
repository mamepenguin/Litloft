"use client";

import { createContext, useContext } from "react";

import type { FileNavState } from "@/lib/fileNavContext";

/**
 * The page row and the right pane read a queue page's own walk instead of
 * `/neighbors`.
 */
export interface QueuePageState extends FileNavState {
  /**
   * A collection page names itself in the trail; a folder or Smart queue
   * keeps the file's own folders.
   */
  replacesTrail: boolean;
  /** The queue's name, as the pane's top block shows it. */
  name: string;
  /** Where the name goes: the collection list, or the folder's listing. */
  href: string;
  onEnded: () => void;
  /** The previous playable item, wrapping with loop on. */
  previousTrack: () => void;
}

const QueuePageContext = createContext<QueuePageState | null>(null);

export function QueuePageProvider({
  value,
  children,
}: {
  value: QueuePageState | null;
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
