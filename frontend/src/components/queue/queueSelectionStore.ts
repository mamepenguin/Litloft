"use client";

/**
 * What the page's queue holds, for `useSelectedFile`: a file the ready queue
 * holds keeps `queue=` in the URL, and while the queue cannot answer yet it
 * keeps it too. No queue mounted means a `queue=` in the URL is ignored, so a
 * selection drops it.
 */
export interface QueueSelectionState {
  loading: boolean;
  ids: ReadonlySet<string>;
}

let state: QueueSelectionState | null = null;

export function setQueueSelection(next: QueueSelectionState | null): void {
  state = next;
}

export function queueKeepsFile(id: string): boolean {
  if (!state) return false;
  return state.loading || state.ids.has(id);
}
