"use client";

import type { ReactElement, ReactNode } from "react";

interface InspectorPaneProps {
  children: ReactNode;
}

/**
 * It is not told which form it is in, and must not be: this element is what holds
 * the tab panels, so re-rendering it on a resize would put a
 * transcript's scroll position and its clock subscription at the mercy
 * of a window drag.
 */
export function InspectorPane({ children }: InspectorPaneProps): ReactElement {
  return (
    <aside
      data-testid="inspector-pane"
      className="inspector-pane flex h-full w-96 flex-col overflow-auto border-l border-bg-border bg-bg-card"
    >
      <div className="flex-1 overflow-auto">{children}</div>
    </aside>
  );
}
