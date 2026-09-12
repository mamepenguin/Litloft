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

import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import { Trash2 } from "lucide-react";

import { NextIntlClientProvider } from "next-intl";

import { ContextMenu } from "@/components/ContextMenu";
import {
  MobileInspectorSheet,
  SHEET_STATE_HALF,
  type SheetState,
} from "@/components/MobileInspectorSheet";
import { DismissScrim } from "@/components/DismissScrim";
import { useContextMenu } from "@/hooks/useContextMenu";
import { useAnchoredDirection } from "@/hooks/useAnchoredDirection";

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

/**
 * A menu whose corner is picked by the real hook, not by a prop.
 *
 * The arrangements above hand `up` and `alignLeft` in, so what they
 * measure is where a stated class list lands — necessary, and silent about
 * whether anything would ever choose it. This one imports
 * `useAnchoredDirection` from `src/` and lets it read the boxes the
 * browser actually produced, so the spec can ask the question the jsdom
 * cases cannot: **is the box the decision picked inside the frame?**
 *
 * Deleting the measurement from the hook turns these cases red; deleting
 * it from a component does not, which is why the component's own class
 * list is pinned separately by `componentFixtureParity.test.tsx`.
 */
function MeasuredMenu({
  rows,
  preferSide,
}: {
  rows: number;
  preferSide?: "left" | "right";
}): ReactElement {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Opened by a press, not from mount, because the *order* is part of what
  // is being measured. vaul animates the drawer into place, so a menu that
  // measures on mount reads a frame that is still travelling — and nothing
  // re-derives afterwards, since neither the panel's box nor the viewport
  // changes when the drawer stops. In the app the sheet has settled long
  // before anyone taps the trigger. (Measured with it open from mount: the
  // `half` state chose upward against 148px of room below it.)
  const [open, setOpen] = useState(false);
  const { openUp, side } = useAnchoredDirection({
    triggerRef: wrapperRef,
    panelRef,
    open,
    gapPx: 4,
    preferSide,
  });
  return (
    <div ref={wrapperRef} className="relative flex items-center">
      <button
        type="button"
        id="trigger"
        className="rounded-full px-3 py-1.5"
        onClick={() => setOpen((v) => !v)}
      >
        AI
      </button>
      {open && (
      <div
        ref={panelRef}
        id="anchored"
        role="menu"
        data-open-up={String(openUp)}
        data-side={side}
        className={`absolute z-30 min-w-[240px] rounded-2xl bg-bg-card py-1 shadow-lg ${
          openUp ? "bottom-full mb-1" : "top-full mt-1"
        } ${side === "left" ? "left-0" : "right-0"}`}
      >
        {Array.from({ length: rows }, (_, i) => (
          <button
            key={i}
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm"
          >
            row {i + 1}
          </button>
        ))}
      </div>
      )}
    </div>
  );
}

/** The measured menu in the strip and in both expanded states. */
function MeasuredInSheet({
  state,
}: {
  state: "peek" | "half" | "full";
}): ReactElement {
  const row = (
    <>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
        A file name long enough to take the width the strip has
      </span>
      <div className="file-action-row-touch file-action-row-compact flex flex-shrink-0 items-center gap-0.5">
        <MeasuredMenu rows={5} />
        <button type="button" id="overflow" className="h-11 w-11 rounded-lg">
          &#8942;
        </button>
      </div>
    </>
  );
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
        peek={state === "peek" ? row : null}
      >
        {state === "peek" ? null : (
          <div className="flex items-center gap-2 px-4 pt-2">{row}</div>
        )}
      </MobileInspectorSheet>
    </NextIntlClientProvider>
  );
}

/**
 * The 384px inspector column, which is the one frame in the tree with
 * side edges close enough to bind.
 *
 * Both of the walks this hook replaced recorded `left`, `top` and
 * `bottom` only, so nothing ever asked whether a panel hung from a
 * trigger's left edge crossed the frame's right one. No fixture drew a
 * frame narrow enough for the question to have an answer either, which is
 * why it went four review rounds without being noticed.
 *
 * Two arrangements, because one edge cannot stand in for the other and
 * each has to produce the answer the *other* side of the default would
 * not: a trigger at the column's left edge preferring `right` has to end
 * up on the left, and one at its right edge preferring `left` has to end
 * up on the right. Assert only the box and a panel narrower than its room
 * passes both without the question ever being put.
 *
 * `overflow-auto` and `w-96` are `InspectorPane`'s own.
 */
function InspectorColumn({
  at,
  preferSide,
}: {
  at: "left" | "right";
  preferSide: "left" | "right";
}): ReactElement {
  return (
    <>
      <PageControl id="underneath" className="fixed inset-0 z-0 bg-bg-elevated">
        page
      </PageControl>
      <aside
        id="pane"
        className="fixed right-0 top-0 flex h-full w-96 flex-col overflow-auto border-l border-bg-border bg-bg-card"
      >
        <div
          className={`flex items-center px-3 py-4 ${
            at === "right" ? "justify-end" : "justify-start"
          }`}
        >
          <MeasuredMenu rows={5} preferSide={preferSide} />
        </div>
      </aside>
    </>
  );
}

/**
 * A column whose **right edge is inside the viewport**, which the inspector
 * pane's is not.
 *
 * `InspectorColumn` above is flush against the window (`fixed right-0 w-96`,
 * and `InspectorPane` is at the end of a full-width row in the app), so
 * `pane.right === viewport.width` and the frame's right edge and the visible
 * band's are the same number. A walk that collected no `right` at all is
 * rescued there by the intersection, and unit J's first half reported that
 * as a survivor it could not kill.
 *
 * The tree pane is the arrangement where they separate. `TwoPaneLayout`'s
 * `<aside>` is `overflow-hidden` at `md:w-[280px]` with the content column
 * beside it, so the frame ends 280px in and a menu preferring the left edge
 * of a trigger near that end has room the *window* would say it has and the
 * *column* would not. Below `md` the same aside is `w-[100vw]`, which is why
 * this arrangement runs in the desktop project.
 *
 * The trigger is at the column's right end, preferring `left`: the menu is
 * 240px, the room leftward from the trigger inside the column is under 60,
 * and the room rightward from its left edge is the rest of the column. So
 * the answer has to be `right`, and it is `right` only if the frame is the
 * column.
 */
function TreePaneColumn(): ReactElement {
  return (
    <>
      <PageControl id="underneath" className="fixed inset-0 z-0 bg-bg-elevated">
        page
      </PageControl>
      <aside
        id="tree-pane"
        className="fixed left-0 top-0 h-full w-[280px] overflow-hidden border-r border-bg-border bg-bg-card"
      >
        <div className="flex items-center justify-end px-3 py-4">
          <MeasuredMenu rows={5} preferSide="left" />
        </div>
      </aside>
    </>
  );
}

/**
 * The picker inside a modal dialog, near the foot of it.
 *
 * `FolderPicker`'s four dialog callers put it in the one arrangement whose
 * panel height **does not follow the viewport**. It is capped — its folder
 * list scrolls at `max-h-48` — but capped at a fixed 192px rather than at a
 * fraction of the screen the way `AddButton` and the toolbar surface are, so
 * a short viewport does not shrink it. The dialog root is `fixed inset-0`, so
 * the walk stops there and the frame is the visible band; nothing scrolls the
 * page behind a centred dialog, so a panel past the fold is simply gone.
 *
 * The markup is `FileSaveDialog`'s shape — a `fixed inset-0` centring row, an
 * absolute overlay, and a `relative` dialog box — with the picker at the
 * bottom of the box rather than the top, which is where a dialog with two
 * fields above it puts one.
 */
function PickerInDialog(): ReactElement {
  return (
    <>
      <PageControl id="underneath" className="fixed inset-0 z-0 bg-bg-elevated">
        page
      </PageControl>
      <div className="fixed inset-0 z-[100] flex items-center justify-center">
        <div className="absolute inset-0 bg-black/60" />
        <div className="relative mx-4 w-full max-w-md">
          <div
            id="dialog-box"
            className="space-y-4 rounded-xl border border-bg-border bg-bg-card p-5"
          >
            <div className="h-[420px]" />
            <MeasuredMenu rows={8} preferSide="right" />
          </div>
        </div>
      </div>
    </>
  );
}

/** A trigger at the column's left edge: the default side runs off it. */
function InspectorColumnLeftEdge(): ReactElement {
  return <InspectorColumn at="left" preferSide="right" />;
}

/** A trigger at its right edge, preferring the side that runs off it. */
function InspectorColumnRightEdge(): ReactElement {
  return <InspectorColumn at="right" preferSide="left" />;
}

function MeasuredSheetPeek(): ReactElement {
  return <MeasuredInSheet state="peek" />;
}
function MeasuredSheetHalf(): ReactElement {
  return <MeasuredInSheet state="half" />;
}
function MeasuredSheetFull(): ReactElement {
  return <MeasuredInSheet state="full" />;
}

/**
 * Record how far each of the two things moved during a gesture.
 *
 * A gesture that ends where it started leaves nothing to read
 * afterwards, and the claim under test is about the *middle* of one: that
 * while the sheet was following the finger the scroller did not move, and
 * while the scroller was moving the sheet did not. So both are watched
 * while it runs and their extremes are published — `data-max-pull` off
 * the surface's own inline transform, `data-max-scroll` off the
 * scroller's own `scrollTop`.
 *
 * Both are readings of the real component, not of a copy: the transform
 * is the one `useSheetPullToCollapse` wrote, and the scroll is the one
 * the browser performed or declined to. The counters reset when a finger
 * lands, so each gesture is measured on its own.
 */
function useGestureRecord(): void {
  useEffect(() => {
    const body = document.body;
    const reset = () => {
      body.dataset.maxPull = "0";
      body.dataset.maxScroll = "0";
    };
    reset();

    const surface = () =>
      document.querySelector<HTMLElement>(
        "[data-testid='mobile-inspector-surface']",
      );
    const scroller = () =>
      document.querySelector<HTMLElement>(
        "[data-testid='mobile-inspector-content']",
      );

    const note = (key: "maxPull" | "maxScroll", value: number) => {
      if (value > Number(body.dataset[key] ?? 0)) {
        body.dataset[key] = String(Math.round(value));
      }
    };

    const readPull = () => {
      const el = surface();
      if (!el) return;
      // The hook writes `translate3d(0, Npx, 0)`; the settle writes 0.
      const match = /translate3d\(0(?:px)?,\s*(-?[\d.]+)px/.exec(
        el.style.transform,
      );
      note("maxPull", match ? Math.abs(Number(match[1])) : 0);
    };

    const onScroll = () => note("maxScroll", scroller()?.scrollTop ?? 0);

    // `subtree`, because the surface is mounted and unmounted with the
    // sheet's state and this effect runs once.
    const observer = new MutationObserver(readPull);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["style"],
    });
    document.addEventListener("touchstart", reset, true);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("touchstart", reset, true);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, []);
}

/**
 * The sheet with something in it, and a record of what a gesture did.
 *
 * The state is the component's own here rather than a prop held still:
 * collapsing is the outcome under test, so the sheet has to be able to
 * collapse. Every state change is also written to `data-sheet-state`,
 * which is what the spec reads — one place, whether or not React has
 * committed a re-render the spec could see another way.
 *
 * `bodyPx` is the whole population of this arrangement: a body taller
 * than the sheet is a scroller with somewhere to go, and one shorter
 * than it is condition 1, where there was never a scroll to compete
 * with.
 */
function SheetGesture({ bodyPx }: { bodyPx: number }): ReactElement {
  const [state, setState] = useState<SheetState>(SHEET_STATE_HALF);
  useGestureRecord();
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
        onStateChange={(next) => {
          setState(next);
          document.body.dataset.sheetState = next;
        }}
        halfSnap={0.4}
        peek={<div id="peek-row">peek</div>}
      >
        {/* Plain boxes: what is measured is the scroller and the surface,
            and a real inspector here would need Next.js and a backend. */}
        <div id="sheet-body" style={{ height: `${bodyPx}px` }}>
          <div id="sheet-body-top">top of the sheet</div>
        </div>
      </MobileInspectorSheet>
    </NextIntlClientProvider>
  );
}

function SheetGestureScrollable(): ReactElement {
  return <SheetGesture bodyPx={2000} />;
}

function SheetGestureShort(): ReactElement {
  return <SheetGesture bodyPx={40} />;
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
  "sheet-gesture": SheetGestureScrollable,
  "sheet-gesture-short": SheetGestureShort,
  "measured-sheet-peek": MeasuredSheetPeek,
  "measured-sheet-half": MeasuredSheetHalf,
  "measured-sheet-full": MeasuredSheetFull,
  "measured-inspector-left-edge": InspectorColumnLeftEdge,
  "measured-inspector-right-edge": InspectorColumnRightEdge,
  "measured-tree-pane": TreePaneColumn,
  "measured-picker-in-dialog": PickerInDialog,
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
