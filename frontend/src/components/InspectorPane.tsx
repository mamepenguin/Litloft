"use client";

import type { ReactElement, ReactNode } from "react";

interface InspectorPaneProps {
  children: ReactNode;
}

/**
 * Open/expanded Inspector column for the Markdown DocumentLayout.
 *
 * The internal "INSPECTOR" header + close button were removed in the
 * 2026-05-11 chrome consolidation: the layout's unified top chrome
 * already exposes the inspector toggle, so a duplicate label inside
 * the pane only ate vertical space.
 *
 * Beside the canvas or over it — `globals.css` decides from the row's
 * measured width, and the pane keeps its 384px either way. It is not
 * told which form it is in, and must not be: this element is what holds
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
