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
 */
export function InspectorPane({ children }: InspectorPaneProps): ReactElement {
  return (
    <aside
      data-testid="inspector-pane"
      className="flex h-full w-[300px] flex-col overflow-auto border-l border-bg-border bg-bg-card"
    >
      <div className="flex-1 overflow-auto">{children}</div>
    </aside>
  );
}
