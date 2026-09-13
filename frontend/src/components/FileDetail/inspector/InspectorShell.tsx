"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";

import { listedTabs, showsTabStrip, type InspectorTab } from "./tabs";

/**
 * `column` makes the whole inspector one column: the inspector adds no
 * scroller of its own and whatever encloses it is the only one.
 */
export type InspectorScroll = "panel" | "column";

interface InspectorShellProps {
  header: ReactNode;
  tabs: InspectorTab[];
  resetKey?: string;
  scroll?: InspectorScroll;
}

/**
 * In `column` mode the header and its action row scroll away. Trading the
 * pinned header for the height it takes is the user's confirmed decision.
 */
export function InspectorShell({
  header,
  tabs,
  resetKey,
  scroll = "panel",
}: InspectorShellProps) {
  const t = useTranslations("inspector");
  // Only a listed tab can be selected. An unlisted one is mounted so it
  // can keep reporting; giving it the selection would show a panel its
  // own entry has just said is empty.
  const listed = listedTabs(tabs);
  const firstId = listed[0]?.id ?? "info";
  const [activeId, setActiveId] = useState<string>(firstId);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    setActiveId(firstId);
    // Only on a file change. Naming `firstId` here would also fire when
    // the strip's composition shifts, which is the selection-preserving
    // behaviour just below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const active = listed.find((tab) => tab.id === activeId) ?? listed[0];

  // The selection follows a vanished tab rather than being remembered. Left
  // in state, a dead id springs back the moment its tab returns.
  useEffect(() => {
    if (active && active.id !== activeId) setActiveId(active.id);
  }, [active, activeId]);
  const strip = showsTabStrip(tabs);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const delta =
        event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (delta === 0) return;
      // A tablist owns its arrow keys; without this they scroll the page
      // behind it while the focus ring sits on a tab.
      event.preventDefault();
      const index = listed.findIndex((tab) => tab.id === active?.id);
      const next = listed[(index + delta + listed.length) % listed.length];
      if (!next) return;
      setActiveId(next.id);
      tabRefs.current.get(next.id)?.focus();
    },
    [listed, active?.id],
  );

  const column = scroll === "column";
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);

  /**
   * In the column form the panels scroll under the strip, so a panel that
   * pins something of its own has to pin it below the strip. The strip's
   * height depends on the pointer and on the font, so it is measured rather
   * than written down.
   */
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!column || !root) return;
    const publish = () => {
      root.style.setProperty(
        "--inspector-sticky-top",
        `${stripRef.current?.offsetHeight ?? 0}px`,
      );
    };
    publish();
    const node = stripRef.current;
    const observer =
      node && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(publish)
        : null;
    if (node) observer?.observe(node);
    return () => {
      observer?.disconnect();
      root.style.removeProperty("--inspector-sticky-top");
    };
  }, [column, strip]);

  return (
    <div
      ref={rootRef}
      data-testid="inspector-shell"
      data-scroll={scroll}
      // `h-full min-h-0` is what makes the panel below a bounded box, so
      // it is exactly what a one-column inspector must not have: with a
      // height to fill, the panel scrolls inside the enclosing scroller
      // instead of extending it.
      className={column ? "flex flex-col" : "flex h-full min-h-0 flex-col"}
    >
      <div className={column ? "px-4 pt-4 pb-3" : "shrink-0 px-4 pt-4 pb-3"}>
        {header}
      </div>

      {strip && (
        <div
          ref={stripRef}
          role="tablist"
          aria-label={t("tablistLabel")}
          data-testid="inspector-tabs"
          onKeyDown={onKeyDown}
          // Scrolls rather than wraps: a strip that wraps to two lines takes
          // the height back off the region it is labelling. In column mode it
          // needs a ground of its own or the rows travelling under it show
          // through. The shadow is that ground one pixel higher: an engine
          // that rounds a stuck strip down from a fractional scroller top
          // leaves a row of content visible above it.
          className={`flex gap-1 overflow-x-auto border-b border-bg-border px-2 pointer-coarse:min-h-11 ${
            column
              ? "sticky top-0 z-10 bg-bg-card shadow-[0_-1px_0_var(--color-bg-card)]"
              : "shrink-0"
          }`}
        >
          {listed.map((tab) => {
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
                className={`whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition-colors pointer-coarse:min-h-11 ${
                  selected
                    ? "border-accent font-semibold text-text-primary"
                    : "border-transparent text-text-muted hover:text-text-primary"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Every panel is mounted; only one is shown. The transcript
          fetches, subscribes to the playback clock and holds a scroll
          position, so a strip that unmounts would re-fetch it and lose the
          reader's place. */}
      {tabs.map((tab) => {
        const selected = tab.id === active?.id;
        return (
          <div
            key={tab.id}
            id={`inspector-panel-${tab.id}`}
            // An unlisted panel has no button pointing at it, so it is
            // not a tabpanel — it is a mounted reporter that happens to
            // live here.
            role={strip && tab.listed ? "tabpanel" : undefined}
            aria-labelledby={
              strip && tab.listed ? `inspector-tab-${tab.id}` : undefined
            }
            hidden={!selected}
            // Focusable because in `panel` mode it is the box that
            // scrolls and it may hold nothing focusable. Chrome will not let
            // a keyboard-only reader scroll such a region otherwise.
            tabIndex={selected ? 0 : -1}
            className={
              column
                ? "space-y-4 p-4"
                : "min-h-0 flex-1 space-y-4 overflow-auto p-4"
            }
          >
            {tab.content}
          </div>
        );
      })}
    </div>
  );
}
