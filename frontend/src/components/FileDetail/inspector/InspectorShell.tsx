"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { showsTabStrip, type InspectorTab } from "./tabs";

interface InspectorShellProps {
  /**
   * The part that does not move: title, length and size, state chip,
   * the action row, tags. Identical for every file kind — that is the
   * point of it, and why it is passed in rather than built here.
   */
  header: ReactNode;
  tabs: InspectorTab[];
  /** Resets the selected tab when the file changes under a reused mount. */
  resetKey?: string;
}

/**
 * The inspector, in two tiers.
 *
 * The header stays put and only the tab region scrolls. That is the
 * whole reason for the split: the per-file actions — like, favourite,
 * the AI menu, the overflow — were previously somewhere in a long
 * column, so reaching them meant finding them first. Anchored, they are
 * in the same place for every file, whatever is below them.
 *
 * With a single tab there is no strip: see `tabs.ts` for why, and for
 * why nothing in this file knows what an addon is called.
 */
export function InspectorShell({
  header,
  tabs,
  resetKey,
}: InspectorShellProps) {
  const [activeId, setActiveId] = useState<string>(tabs[0]?.id ?? "info");
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    setActiveId("info");
  }, [resetKey]);

  // A tab can vanish under the selection — an addon's panel moves to the
  // canvas when the reader switches the transcript below the player, and
  // chapters go when a file turns out to have none. Falling back to the
  // one tab that is always there beats rendering an empty region.
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];
  const strip = showsTabStrip(tabs);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const delta =
        event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (delta === 0) return;
      // A tablist owns its arrow keys; without this they scroll the page
      // behind it while the focus ring sits on a tab.
      event.preventDefault();
      const index = tabs.findIndex((tab) => tab.id === active?.id);
      const next = tabs[(index + delta + tabs.length) % tabs.length];
      if (!next) return;
      setActiveId(next.id);
      tabRefs.current.get(next.id)?.focus();
    },
    [tabs, active?.id],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-4 pb-3">{header}</div>

      {strip && (
        <div
          role="tablist"
          aria-label="Inspector"
          data-testid="inspector-tabs"
          onKeyDown={onKeyDown}
          // Scrolls rather than wraps: the sizing rules forbid a control
          // row wrapping, and a strip that wraps to two lines takes the
          // height back off the region it is labelling.
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-bg-border px-2"
        >
          {tabs.map((tab) => {
            const selected = tab.id === active?.id;
            return (
              <button
                key={tab.id}
                ref={(node) => {
                  if (node) tabRefs.current.set(tab.id, node);
                  else tabRefs.current.delete(tab.id);
                }}
                type="button"
                role="tab"
                id={`inspector-tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`inspector-panel-${tab.id}`}
                // Roving tabindex: one stop for the whole strip, and the
                // arrows move within it. Every tab being a tab stop is
                // the thing that makes a long strip tedious to get past.
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveId(tab.id)}
                className={`whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                  selected
                    ? "border-accent text-text-primary"
                    : "border-transparent text-text-muted hover:text-text-primary"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      )}

      {active && (
        <div
          id={`inspector-panel-${active.id}`}
          role={strip ? "tabpanel" : undefined}
          aria-labelledby={strip ? `inspector-tab-${active.id}` : undefined}
          // The only thing that scrolls. The header above keeps its
          // place while this moves.
          className="min-h-0 flex-1 space-y-4 overflow-auto p-4"
        >
          {active.content}
        </div>
      )}
    </div>
  );
}
