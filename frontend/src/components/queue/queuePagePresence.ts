"use client";

/**
 * Whether the page the viewer is on shows a queue as its left pane. The pane
 * button lives in the app header, outside the page that owns the queue, so it
 * reads this instead of the route: a collection's queue is the open file's
 * item list, which no URL parameter names.
 */
type Listener = () => void;

const listeners = new Set<Listener>();
const drives = new Set<string>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function setQueuePage(drive: string, active: boolean): void {
  const shown = drives.has(drive);
  if (shown === active) return;
  if (active) drives.add(drive);
  else drives.delete(drive);
  notify();
}

export function queuePagePresent(drive: string | null): boolean {
  return drive === null ? drives.size > 0 : drives.has(drive);
}

export function subscribeQueuePage(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
