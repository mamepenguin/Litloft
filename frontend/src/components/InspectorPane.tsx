"use client";

import type { CSSProperties, ReactElement, ReactNode } from "react";

import {
  INSPECTOR_WIDE_MIN_REM,
  INSPECTOR_WIDE_SHARE,
} from "@/lib/layoutSizes";

interface InspectorPaneProps {
  children: ReactNode;
  /**
   * A `document-side` tab that declares `wide` is selected beside the
   * canvas. The width itself is the stylesheet's; these are its terms.
   */
  wide?: boolean;
}

/**
 * It is not told which form it is in, and must not be: this element is what holds
 * the tab panels, so re-rendering it on a resize would put a
 * transcript's scroll position and its clock subscription at the mercy
 * of a window drag.
 */
export function InspectorPane({
  children,
  wide = false,
}: InspectorPaneProps): ReactElement {
  return (
    <aside
      data-testid="inspector-pane"
      data-inspector-wide={wide ? "true" : undefined}
      style={
        {
          "--inspector-wide-share": `${INSPECTOR_WIDE_SHARE * 100}%`,
          "--inspector-wide-min": `${INSPECTOR_WIDE_MIN_REM}rem`,
        } as CSSProperties
      }
      className="inspector-pane flex h-full w-96 flex-col overflow-auto border-l border-bg-border bg-bg-card"
    >
      <div className="flex-1 overflow-auto">{children}</div>
    </aside>
  );
}
