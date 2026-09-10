/**
 * The real components, in the arrangements this unit has been bitten by.
 *
 * Not a copy of them: `DismissScrim`, `ContextMenu` and `useContextMenu`
 * are imported from `src/` and bundled by the repo's own vite, so a change
 * to the primitive changes what the browser measures. That is the whole
 * difference between this file and `e2e-layout/fixtures/popup-dismiss.html`,
 * which hand-writes a copy of the mechanism and therefore stays green when
 * the component stops doing it.
 *
 * What is hand-written here is the *page* — a bar, a strip, a transformed
 * box, a card — because the components that draw those in the app
 * (`SelectionBar`, `InspectorShell`, `FileCard`)
 * need Next.js, `next-intl` and a backend. The classes come from the same
 * compiled stylesheet the app ships.
 *
 * **That page is pinned in two directions**, because a fixture that draws
 * its own markup drifts away from what it claims to reproduce and keeps
 * every case title. `componentFixtureParity.test.tsx` compares these class
 * lists against `SelectionBar` and `InspectorShell`, so the app moving a
 * tier fails; the spec measures the same facts from computed styles before
 * each tap, so this file dropping one fails. Measured with neither: the
 * bar at `z-10`, the strip unstuck and the `translate3d` deleted all left
 * the eight cases green.
 *
 * `ShortcutsProvider` is deliberately absent: its default context is a
 * no-op, so `ContextMenu` renders without it and Escape does nothing here.
 * Escape is `escape-listeners.test.ts`'s and `useShortcuts`'s subject, not
 * this file's.
 */

import { useState, type ReactElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Trash2 } from "lucide-react";

import { NextIntlClientProvider } from "next-intl";

import { ContextMenu } from "@/components/ContextMenu";
import { MobileInspectorSheet } from "@/components/MobileInspectorSheet";
import { DismissScrim } from "@/components/DismissScrim";
import { useContextMenu } from "@/hooks/useContextMenu";

import "../../e2e-layout/fixtures/globals.built.css";

/**
 * A control on the page that must not be activated by the gesture under
 * test, counting its own activations where the spec can read them.
 *
 * `onClick` is React's, delegated at the root container — which is the
 * point. The swallow stops the click at `document` in the capture phase,
 * above the root, so this is a test of the real dispatch path rather than
 * of a listener placed to be convenient.
 */
function PageControl({
  id,
  className,
  children,
}: {
  id: string;
  className: string;
  children?: ReactNode;
}): ReactElement {
  return (
    <button
      type="button"
      id={id}
      data-clicks="0"
      className={className}
      onClick={(e) => {
        const el = e.currentTarget;
        el.dataset.clicks = String(Number(el.dataset.clicks) + 1);
      }}
    >
      {children}
    </button>
  );
}

const MENU_ROWS = ["Rename", "Move", "Delete"];

function Menu({ onPick }: { onPick: () => void }): ReactElement {
  return (
    <div
      id="menu"
      role="menu"
      className="absolute left-2 top-2 z-30 w-40 rounded-2xl border border-bg-border bg-bg-card py-1 shadow-lg"
    >
      {MENU_ROWS.map((row) => (
        <button
          key={row}
          type="button"
          role="menuitem"
          id={`row-${row}`}
          data-clicks="0"
          className="block w-full px-3 py-2 text-left text-sm text-text-primary"
          onClick={(e) => {
            const el = e.currentTarget;
            el.dataset.clicks = String(Number(el.dataset.clicks) + 1);
            onPick();
          }}
        >
          {row}
        </button>
      ))}
    </div>
  );
}

/** A scrim over a page with nothing else on it — the easy case. */
function Plain(): ReactElement {
  const [open, setOpen] = useState(true);
  return (
    <>
      <PageControl id="underneath" className="fixed inset-0 z-0 bg-bg-elevated">
        underneath
      </PageControl>
      {open && (
        <DismissScrim onDismiss={() => setOpen(false)}>
          <Menu onPick={() => setOpen(false)} />
        </DismissScrim>
      )}
    </>
  );
}

/**
 * `SelectionBar`'s shape: the scrim and the menu live inside a
 * `fixed bottom-0 … z-50` bar, and the bulk actions are in the same bar.
 *
 * Round 5's worst case. No scrim tier could clear the bar, so the tap that
 * dismissed the overflow menu ran a bulk action on every selected file.
 */
function BottomBar(): ReactElement {
  const [open, setOpen] = useState(true);
  return (
    <>
      <PageControl id="underneath" className="fixed inset-0 z-0 bg-bg-elevated">
        underneath
      </PageControl>
      <div id="bar" className="fixed bottom-0 left-0 right-0 z-50 bg-bg-card">
        <PageControl id="bulk" className="block w-full p-2.5 text-text-primary">
          Delete selected
        </PageControl>
        {open && (
          <DismissScrim
            onDismiss={() => setOpen(false)}
            className="fixed inset-0 z-20 sm:hidden"
          >
            <Menu onPick={() => setOpen(false)} />
          </DismissScrim>
        )}
      </div>
    </>
  );
}

/**
 * The mobile sheet's shape: a transformed ancestor, and a sticky strip
 * written after the scrim inside it.
 *
 * `fixed` resolves against the transform, so the scrim covers the drawer
 * rather than the window — the arrangement in which "the scrim is above
 * the chrome" was hardest to state and easiest to get wrong.
 */
function Transformed(): ReactElement {
  const [open, setOpen] = useState(true);
  return (
    <>
      <PageControl id="underneath" className="fixed inset-0 z-0 bg-bg-elevated">
        underneath
      </PageControl>
      <div
        id="drawer"
        className="fixed inset-x-0 bottom-0 top-20 z-40 overflow-auto bg-bg-primary"
        style={{ transform: "translate3d(0, 0, 0)" }}
      >
        {open && (
          <DismissScrim onDismiss={() => setOpen(false)}>
            <Menu onPick={() => setOpen(false)} />
          </DismissScrim>
        )}
        <PageControl
          id="tabstrip"
          className="sticky top-0 z-10 block w-full bg-bg-card p-2.5 text-text-primary"
        >
          Tabs
        </PageControl>
      </div>
    </>
  );
}

/**
 * A card wired with the real `useContextMenu`, which opens the menu from a
 * **500 ms timer on `touchstart`**.
 *
 * The popup is raised by a press the primitive never answered, so nothing
 * arms for the click the lift produces — and the scrim is appearance now,
 * so it cannot stand in. Measured before the fix: the long-press opened the
 * menu *and* activated the card, which on a phone is "long-press a file
 * card and land on the file".
 */
function LongPress(): ReactElement {
  const { menuState, close, handlers } = useContextMenu();
  return (
    <>
      <button
        type="button"
        id="card"
        data-clicks="0"
        className="fixed inset-0 z-0 bg-bg-elevated"
        {...handlers}
        onClick={(e) => {
          // What `FileCard`'s wrapper does: it is a link to the file page.
          const el = e.currentTarget;
          el.dataset.clicks = String(Number(el.dataset.clicks) + 1);
        }}
      >
        card
      </button>
      <ContextMenu
        open={menuState.open}
        position={menuState.position}
        items={[{ icon: Trash2, label: "Delete", onClick: () => {} }]}
        onClose={close}
      />
    </>
  );
}


/**
 * The real Bottom Sheet, with a menu drawn inside it both ways.
 *
 * `Drawer.Content` carries a transform while it is snapped, which makes
 * it the containing block for `position: fixed` descendants — so a menu
 * pinned to "the bottom of the screen" is pinned to the bottom of the
 * *drawer*, and the drawer hangs below the fold by however far vaul has
 * translated it. That is a real defect that shipped: the intelligence
 * addon's AI menu was `fixed inset-x-2 bottom-4` below `sm` and opened
 * off the bottom of the screen.
 *
 * Both forms are drawn together so the difference is a measurement
 * rather than an argument. The sheet is the real component — vaul, the
 * real snap arithmetic, the real transform — because the transform is
 * the whole mechanism and a hand-written box would only reproduce
 * whatever the fixture author already believed.
 *
 * The two menus are not: the popup this was written for lives in
 * `addons/intelligence`, which is a separate repository behind a pinned
 * submodule, and a fixture that imported it would be asserting about
 * whatever commit core happens to point at. So what is measured here is
 * the *pattern* — anchored against pinned-to-the-screen — and the addon
 * pins its own class list in its own suite.
 */
/**
 * The row the AI button sits in, in the place the file detail puts it.
 *
 * **The title's `min-w-0 flex-1` is load-bearing here**, not decoration:
 * `FileDetailContainer` builds the resting strip as that span followed by
 * a `flex-shrink-0` action row, so the row is pushed hard against the
 * strip's right edge and the AI button is second-to-last in it. A fixture
 * that put the trigger at the left of the row would measure a menu that
 * always fits, and the horizontal axis would have no question in it — the
 * axis that shipped 99px off the right edge of every phone.
 *
 * The strip's own `px-4` and `gap-2` come from `MobileInspectorSheet`,
 * which draws this as its children, so nothing here adds padding of its
 * own.
 */
function ActionRow({ up, alignLeft }: { up: boolean; alignLeft: boolean }): ReactElement {
  return (
    <>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
        A file name long enough to take the width the strip has
      </span>
      <div className="file-action-row-touch file-action-row-compact flex flex-shrink-0 items-center gap-0.5">
        <div className="relative flex items-center">
          <button type="button" id="trigger" className="rounded-full px-3 py-1.5">
            AI
          </button>
          {/* What the menu is now: anchored to the wrapper above, on both
              axes, in the direction the box says there is room for. The
              class list is pinned against the real component by
              `componentFixtureParity.test.tsx`. */}
          <div
            id="anchored"
            role="menu"
            className={`absolute z-30 min-w-[240px] rounded-2xl bg-bg-card py-1 shadow-lg ${
              up ? "bottom-full mb-1" : "top-full mt-1"
            } ${alignLeft ? "left-0" : "right-0"}`}
          >
            {/* One row per `FileAiActionKind`, which is what the menu
                offers when every section has something to give — the
                height the vertical decision is made on, at its largest.
                Written out rather than counted, and named after the
                kinds, so a kind added to the addon and not to this list
                is a row missing from the box this measures. */}
            {[
              "tags",
              "summary",
              "detailedSummary",
              "chapters",
              "visualDescription",
            ].map((row) => (
              <button key={row} type="button" role="menuitem" className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm">
                {row}
              </button>
            ))}
          </div>
        </div>
        <button type="button" id="overflow" className="h-11 w-11 rounded-lg">
          &#8942;
        </button>
      </div>
      {/* What it was: the bottom-sheet form. Kept in both states so the
          contrast is a measurement rather than an argument — it is whole
          in one of them and off the screen in the other, which is the
          whole reason the direction is measured instead of declared. */}
      <div
        id="pinned-to-the-screen"
        className="fixed inset-x-2 bottom-4 z-40 rounded-2xl bg-bg-card py-1"
      >
        fixed
      </div>
    </>
  );
}

function InSheet({
  state,
  up,
  alignLeft = false,
}: {
  state: "half" | "peek" | "full";
  up: boolean;
  alignLeft?: boolean;
}): ReactElement {
  return (
    <NextIntlClientProvider
      locale="en"
      messages={{ inspector: { title: "Details", sheetDescription: "Sheet" } }}
    >
      <PageControl id="underneath" className="fixed inset-0 z-0 bg-bg-elevated">
        page
      </PageControl>
      <MobileInspectorSheet
        state={state}
        onStateChange={() => {}}
        halfSnap={0.4}
        peek={state === "peek" ? <ActionRow up={up} alignLeft={alignLeft} /> : null}
      >
        {state === "peek" ? null : (
          // Expanded, the row is drawn inside the sheet's scroller rather
          // than in the strip, and `MobileInspectorSheet` gives that
          // scroller no flex of its own — the header that holds the row
          // in the app does. Reproduced here, because the trigger's
          // distance from the right edge is the whole horizontal
          // question and a row that fell back to block layout would put
          // the trigger on the left and ask nothing.
          <div className="flex items-center gap-2 px-4 pt-2">
            <ActionRow up={up} alignLeft={alignLeft} />
          </div>
        )}
      </MobileInspectorSheet>
    </NextIntlClientProvider>
  );
}

/**
 * The expanded sheet: the row is inside `Drawer.Content`, which is
 * transformed, and the menu hangs downward because there is room.
 */
function Sheet(): ReactElement {
  return <InSheet state="half" up={false} />;
}

/**
 * The **collapsed** sheet, which is the state the file detail opens in.
 *
 * The same row is drawn a second time as the sheet's 56px resting strip —
 * `fixed bottom-0`, no transform, and the drawer is not mounted at all.
 * A menu that could only hang downward from a row whose bottom edge is
 * the bottom of the screen is off the screen, which is the defect the
 * first round of this unit created while fixing the other state.
 */
function SheetPeekDown(): ReactElement {
  return <InSheet state="peek" up={false} />;
}

/** The same strip with the direction the measurement picks there. */
function SheetPeekUp(): ReactElement {
  return <InSheet state="peek" up />;
}

/**
 * The three sheet states against the two axes, each with the direction
 * the component would pick and the one it would not.
 *
 * `peek`, `half` and `full` are three different frames — the strip is
 * `fixed bottom-0` with no drawer mounted, and the other two are inside
 * `Drawer.Content` at two different translations — so which direction
 * fits is a question each of them has to be asked separately rather than
 * inferred from its neighbour.
 */
function SheetHalfRight(): ReactElement {
  return <InSheet state="half" up={false} />;
}
function SheetHalfUp(): ReactElement {
  return <InSheet state="half" up />;
}
function SheetHalfLeft(): ReactElement {
  return <InSheet state="half" up={false} alignLeft />;
}
function SheetFullRight(): ReactElement {
  return <InSheet state="full" up={false} />;
}
function SheetFullLeft(): ReactElement {
  return <InSheet state="full" up={false} alignLeft />;
}
function SheetFullUp(): ReactElement {
  return <InSheet state="full" up />;
}
function SheetPeekLeft(): ReactElement {
  return <InSheet state="peek" up alignLeft />;
}

const ARRANGEMENTS: Record<string, () => ReactElement> = {
  plain: Plain,
  "bottom-bar": BottomBar,
  transformed: Transformed,
  "long-press": LongPress,
  sheet: Sheet,
  "sheet-peek-down": SheetPeekDown,
  "sheet-peek-up": SheetPeekUp,
  "sheet-peek-left": SheetPeekLeft,
  "sheet-half-right": SheetHalfRight,
  "sheet-half-up": SheetHalfUp,
  "sheet-half-left": SheetHalfLeft,
  "sheet-full-right": SheetFullRight,
  "sheet-full-left": SheetFullLeft,
  "sheet-full-up": SheetFullUp,
};

function App(): ReactElement {
  const id = location.hash.slice(1) || "plain";
  const Arrangement = ARRANGEMENTS[id];
  if (!Arrangement) throw new Error(`no arrangement named ${id}`);
  return <Arrangement />;
}

createRoot(document.getElementById("root")!).render(<App />);
document.body.dataset.arrangement = location.hash.slice(1) || "plain";
document.body.dataset.ready = "1";
