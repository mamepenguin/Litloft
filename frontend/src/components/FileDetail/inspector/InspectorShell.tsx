"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import { listedTabs, showsTabStrip, type InspectorTab } from "./tabs";

/**
 * Which box in the inspector scrolls.
 *
 * `panel` keeps the header and the strip still and scrolls the selected
 * panel under them. `column` makes the whole inspector one column: the
 * header scrolls away with everything else and the strip is sticky, so
 * the inspector adds no scroller of its own and whatever encloses it is
 * the only one.
 *
 * A mode rather than a viewport query, because the two surfaces already
 * know which they are and this component does not: the desktop pane is
 * a 384px column beside a tall canvas, and the sheet is a drawer whose
 * own box is the scroller.
 */
export type InspectorScroll = "panel" | "column";

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
  /** See `InspectorScroll`. Defaults to the pinned-header form. */
  scroll?: InspectorScroll;
}

/**
 * The inspector, in two tiers or in one column.
 *
 * In `panel` mode the header stays put and only the tab region scrolls.
 * The per-file actions — like, favourite, the AI menu, the overflow —
 * were previously somewhere in a long column, so reaching them meant
 * finding them first; anchored, they are in the same place for every
 * file, whatever is below them.
 *
 * In `column` mode the header scrolls away with everything else and the
 * enclosing box does all the scrolling, leaving only the tab strip
 * pinned — sticky against that box, so a tab can still be switched
 * however far the reader has scrolled.
 *
 * **The actions go with it.** While the sheet is up, the resting strip
 * is not drawn at all — the sheet renders the strip *or* the drawer,
 * never both — so the header is the only thing carrying the file's name
 * and its action row, and reaching them means scrolling back to the top
 * of the column. What the strip buys is the state the sheet spends most
 * of its time in: down, where the name and the actions are on screen
 * without opening anything. Trading the pinned header for the height it
 * takes is the user's confirmed decision (2026-09-09), not something
 * this arrangement gets for free.
 *
 * With a single tab there is no strip: see `tabs.ts` for why, and for
 * why nothing in this file knows what an addon is called.
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

  // A tab can vanish under the selection — an addon's panel moves to the
  // canvas when the reader switches the transcript below the player, and
  // chapters go when a file turns out to have none.
  const active = listed.find((tab) => tab.id === activeId) ?? listed[0];

  // ...and the selection follows it, rather than being remembered. Left
  // in state, a dead id springs back the moment its tab returns — the
  // reader flips the transcript back beside the player and the inspector
  // jumps off the tab they were reading, with nothing having been
  // pressed.
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

  return (
    <div
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
          role="tablist"
          aria-label={t("tablistLabel")}
          data-testid="inspector-tabs"
          onKeyDown={onKeyDown}
          // Scrolls rather than wraps: the sizing rules forbid a control
          // row wrapping, and a strip that wraps to two lines takes the
          // height back off the region it is labelling.
          //
          // `pointer-coarse:min-h-11` is the row half of the touch floor
          // (`DESIGN.md` §Row Actions): the strip is a row of controls,
          // and the floor is reached on the row so its members inherit
          // it rather than each growing its own box.
          // `sticky top-0` in column mode resolves against the nearest
          // scrollport, which is the enclosing box rather than anything
          // here — the strip stays reachable however far the header has
          // been scrolled past. It needs a ground of its own or the rows
          // travelling under it show through.
          className={`flex gap-1 overflow-x-auto border-b border-bg-border px-2 pointer-coarse:min-h-11 ${
            column ? "sticky top-0 z-10 bg-bg-card" : "shrink-0"
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

      {/* Every panel is mounted; only one is shown. Rendering just the
          selected one would destroy the others on each switch, and the
          companion's occupants cannot survive that — `globals.css`
          records the same invariant for the grid form: the transcript
          fetches, subscribes to the playback clock and holds a scroll
          position, so it is moved rather than remounted. A tab strip
          that unmounts would re-fetch it and lose the reader's place
          every time they looked at the file's tags.

          It also keeps every `aria-controls` above pointing at an
          element that exists. */}
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
            // scrolls and it may hold nothing focusable — a transcript, a
            // comment list. Chrome will not let a keyboard-only reader
            // scroll such a region otherwise. Kept in `column` mode too:
            // the panel is then a plain box, and taking the stop away
            // would make the reachable set differ between the two
            // surfaces for no reason a reader could name.
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
