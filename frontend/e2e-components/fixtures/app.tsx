import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import { FolderTree, Trash2 } from "lucide-react";

import { NextIntlClientProvider } from "next-intl";

import { AddButton } from "@/components/AddButton";
import { Button } from "@/components/Button";
import { ChromeButtons } from "@/components/ChromeButtons";
import { PageFrame, type PageFrameWidth } from "@/components/PageFrame";
import { PageHeader } from "@/components/PageHeader";
import { Breadcrumb } from "@/components/Breadcrumb";
import { ArchiveToolbar } from "@/components/archive/ArchiveToolbar";
import { useViewerZoom } from "@/hooks/useViewerZoom";
import { ToolbarMenu } from "@/components/ToolbarMenu";
import { SortButton } from "@/components/SortButton";
import { ArchiveImageViewer } from "@/components/archive/ArchiveImageViewer";
import { FileDetailChrome } from "@/components/FileDetail/FileDetailChrome";
import { MediaLayoutToggle } from "@/components/MediaLayoutToggle";
import { MarkdownViewModeToggle } from "@/components/MarkdownViewModeToggle";
import { EditableTitle } from "@/components/markdown/EditableTitle";
import { SaveDot } from "@/components/markdown/SaveDot";
import { ContextMenu } from "@/components/ContextMenu";
import { TouchControlsPresenter } from "@/components/player/MediaControls/TouchControlsPresenter";
import { VideoPlayer } from "@/components/VideoPlayer";
import type { ArchiveEntry, SubtitleInfo } from "@/types";
import { ShortcutsProvider } from "@/components/ShortcutsProvider";
import { useHighlightPassage } from "@/hooks/useHighlightPassage";
import {
  TextPreview,
  MAX_DECORATED_LINES,
} from "@/components/TextPreview";
import enMessages from "@/messages-core/en.json";
import jaMessages from "@/messages-core/ja.json";
import { QuickNotePresenter } from "@/components/quick-note/QuickNotePresenter";
import { CurrentDriveProvider } from "@/components/CurrentDriveProvider";
import { GlobalSearch } from "@/components/GlobalSearch";
import {
  GlobalSearchProvider,
  useGlobalSearch,
  useSearchScope,
} from "@/components/search/GlobalSearchProvider";
import {
  MobileInspectorSheet,
  SHEET_PEEK_HEIGHT,
  SHEET_STATE_HALF,
  SHEET_STATE_PEEK,
  type SheetState,
} from "@/components/MobileInspectorSheet";
import { DismissScrim } from "@/components/DismissScrim";
import { useContextMenu } from "@/hooks/useContextMenu";
import { useAnchoredDirection } from "@/hooks/useAnchoredDirection";
import { folderTransitionKind } from "@/lib/folderTransition";
import { showOpenGhost } from "@/lib/openGhost";
import {
  navigateWithTransition,
  notifyNavigationCommit,
} from "@/lib/viewTransitions";

import "../../e2e-layout/fixtures/globals.built.css";

/**
 * `onClick` is React's, delegated at the root container: the swallow stops
 * the click at `document` in the capture phase, above the root, so this
 * goes through the real dispatch path.
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
 * written after the scrim inside it. `fixed` resolves against the
 * transform, so the scrim covers the drawer rather than the window.
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
 * `useContextMenu` opens the menu from a 500 ms timer on `touchstart`.
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
 * `Drawer.Content` carries a transform while it is snapped, which makes it
 * the containing block for `position: fixed` descendants — so a menu
 * pinned to "the bottom of the screen" is pinned to the bottom of the
 * drawer, which hangs below the fold.
 *
 * The menus are not imported: the popup this pattern comes from lives in an
 * addon submodule, and importing it would assert about whatever commit core
 * points at.
 */
/**
 * The title's `min-w-0 flex-1` is load-bearing: it pushes the action row
 * against the strip's right edge, as the file detail does. A trigger at the
 * left of the row would measure a menu that always fits horizontally.
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
          <div
            id="anchored"
            role="menu"
            className={`absolute z-30 min-w-[240px] rounded-2xl bg-bg-card py-1 shadow-lg ${
              up ? "bottom-full mb-1" : "top-full mt-1"
            } ${alignLeft ? "left-0" : "right-0"}`}
          >
            {/* One row per `FileAiActionKind`: the menu's height at its
                largest, which is what the vertical decision is made on. */}
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
          // `MobileInspectorSheet` gives its scroller no flex of its own;
          // in the app the header holding the row does. Without it the row
          // falls back to block layout and puts the trigger on the left.
          <div className="flex items-center gap-2 px-4 pt-2">
            <ActionRow up={up} alignLeft={alignLeft} />
          </div>
        )}
      </MobileInspectorSheet>
    </NextIntlClientProvider>
  );
}

function Sheet(): ReactElement {
  return <InSheet state="half" up={false} />;
}

function SheetPeekDown(): ReactElement {
  return <InSheet state="peek" up={false} />;
}

function SheetPeekUp(): ReactElement {
  return <InSheet state="peek" up />;
}

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

function MeasuredMenu({
  rows,
  preferSide,
}: {
  rows: number;
  preferSide?: "left" | "right";
}): ReactElement {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Opened by a press, not from mount: vaul animates the drawer into place,
  // so a menu measuring on mount reads a travelling frame, and nothing
  // re-derives when the drawer stops.
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
 * Two arrangements, because one side edge cannot stand in for the other:
 * each has to produce the answer the other side of the default would not.
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
 * A column whose right edge is inside the viewport, unlike the inspector
 * column's, so the frame's right edge and the visible band's differ. The
 * menu is wider than the room leftward from the trigger inside the column,
 * so the answer is `right` only if the frame is the column. Below `md` the
 * app's aside is full width, hence the desktop project.
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
 * `FolderPicker`'s panel height is capped at a fixed size rather than a
 * fraction of the screen, so a short viewport does not shrink it. Nothing
 * scrolls the page behind a centred dialog, so a panel past the fold is gone.
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

function InspectorColumnLeftEdge(): ReactElement {
  return <InspectorColumn at="left" preferSide="right" />;
}

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
 * A gesture that ends where it started leaves nothing to read afterwards,
 * so the extremes are published while it runs: `data-max-pull` off the
 * surface's inline transform, `data-max-scroll` off the scroller's
 * `scrollTop`. The counters reset when a finger lands.
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
 * The state is the component's own rather than a prop held still, because
 * collapsing is the outcome under test.
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
          // Read before the state change unmounts the surface: this is
          // where the sheet was when it collapsed.
          const surface = document.querySelector(
            "[data-testid='mobile-inspector-surface']",
          );
          document.body.dataset.surfaceTopAtCollapse = surface
            ? String(Math.round(surface.getBoundingClientRect().top))
            : "";
          setState(next);
          document.body.dataset.sheetState = next;
        }}
        halfSnap={0.4}
        peek={<div id="peek-row">peek</div>}
      >
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

/**
 * A file page as the shell draws it on a phone: a scrolling canvas holding
 * something at the header's tier and the sticky player, with the sheet over
 * it. The header is tall only so the raised sheet overlaps it.
 */
function SheetOverPage({
  state,
  player,
}: {
  state: SheetState;
  player?: ReactNode;
}): ReactElement {
  const resting = state === SHEET_STATE_PEEK;
  return (
    <NextIntlClientProvider
      locale="en"
      messages={{
        ...enMessages,
        inspector: { title: "Details", sheetDescription: "Sheet" },
      }}
    >
      <div
        data-sheet-snap={resting ? "peek" : "expanded"}
        // Not `fixed`, which would put the header's tier in a stacking
        // context of its own and out of the sheet's reach.
        className="absolute inset-0 flex flex-col"
      >
        <main
          id="page"
          className="flex min-h-0 flex-1 flex-col overflow-auto"
          style={resting ? { paddingBottom: SHEET_PEEK_HEIGHT } : undefined}
        >
          <div
            id="page-header"
            className="sticky top-0 z-20 shrink-0 bg-bg-card"
            style={{ height: "160px" }}
          >
            header
          </div>
          <div className="media-detail-host shrink-0">
            <div id="player" className="media-detail-player">
              {player ?? <div style={{ height: "220px", background: "#000" }} />}
            </div>
          </div>
          <div className="shrink-0" style={{ height: "2000px" }}>
            the description
          </div>
          <div id="page-end" className="shrink-0" style={{ height: "24px" }}>
            the end of the page
          </div>
        </main>
      </div>
      <MobileInspectorSheet
        state={state}
        onStateChange={() => {}}
        halfSnap={0.4}
        peek={<div id="peek-row">peek</div>}
      >
        <div style={{ height: "1200px" }}>the inspector</div>
      </MobileInspectorSheet>
    </NextIntlClientProvider>
  );
}

function SheetOverPagePeek(): ReactElement {
  return <SheetOverPage state={SHEET_STATE_PEEK} />;
}

function SheetOverPageHalf(): ReactElement {
  return <SheetOverPage state={SHEET_STATE_HALF} />;
}

function SheetOverPageFull(): ReactElement {
  return <SheetOverPage state="full" />;
}

function ArchiveToolbarInPlayer(): ReactElement {
  const noop = () => {};
  return (
    <div style={{ height: "220px" }} className="bg-bg-primary">
      <ArchiveToolbar
        fileId="abcdef123456"
        archive={{ entries: [], total_entries: 12, total_size: 1024 }}
        breadcrumbs={[{ label: "a.zip", path: "" }]}
        handleBreadcrumbClick={noop}
        sort="name"
        order="asc"
        typeFilter={null}
        viewMode="list"
        onSortChange={noop}
        onOrderChange={noop}
        onTypeFilterChange={noop}
        onViewModeChange={noop}
      />
    </div>
  );
}

/** Two menus in one bar, only one of them opted in to the phone portal. */
function MenuPortalChoice(): ReactElement {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <div className="flex gap-2 p-4">
        <ToolbarMenu label="Plain" value="Plain" icon={FolderTree}>
          {() => <div className="px-3 py-2">plain row</div>}
        </ToolbarMenu>
        <ToolbarMenu label="Portalled" value="Portalled" icon={FolderTree} portalOnPhone>
          {() => <div className="px-3 py-2">portalled row</div>}
        </ToolbarMenu>
        <ShortcutsProvider>
          <SortButton sort="title" order="asc" onChange={() => {}} />
        </ShortcutsProvider>
      </div>
    </NextIntlClientProvider>
  );
}

/** The strip under test's control: shown, raised, or gone. */
function RestingStripStates(): ReactElement {
  const [state, setState] = useState<SheetState | "gone">(SHEET_STATE_PEEK);
  return (
    <NextIntlClientProvider
      locale="en"
      messages={{ inspector: { title: "Details", sheetDescription: "Sheet" } }}
    >
      <div className="flex gap-2 p-4">
        <button id="to-peek" onClick={() => setState(SHEET_STATE_PEEK)}>peek</button>
        <button id="to-half" onClick={() => setState(SHEET_STATE_HALF)}>half</button>
        <button id="to-gone" onClick={() => setState("gone")}>gone</button>
      </div>
      {state !== "gone" && (
        <MobileInspectorSheet
          state={state}
          onStateChange={() => {}}
          halfSnap={0.4}
          peek={<div>peek</div>}
        >
          <div style={{ height: "600px" }}>the inspector</div>
        </MobileInspectorSheet>
      )}
    </NextIntlClientProvider>
  );
}

function PlayerMenuPeek(): ReactElement {
  return <SheetOverPage state={SHEET_STATE_PEEK} player={<ArchiveToolbarInPlayer />} />;
}

function PlayerMenuHalf(): ReactElement {
  return <SheetOverPage state={SHEET_STATE_HALF} player={<ArchiveToolbarInPlayer />} />;
}

/** The overlay sidebar's backdrop and panel, opened over a raised sheet. */
function SheetUnderSidebar(): ReactElement {
  return (
    <>
      <SheetGesture bodyPx={2000} />
      <div id="sidebar-backdrop" className="fixed inset-0 z-30 bg-black/30" />
      <nav
        id="sidebar"
        className="fixed top-0 left-0 z-40 h-dvh w-60 bg-bg-sidebar"
      />
    </>
  );
}

/**
 * The Add menu with the shortcut stack it answers Escape through. The page
 * control fills the lower half, so a press outside the menu lands on it.
 */
function AddMenu(): ReactElement {
  const [created, setCreated] = useState(0);
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ShortcutsProvider>
        <PageControl id="underneath" className="fixed inset-x-0 bottom-0 z-0 h-1/2 bg-bg-elevated">
          page
        </PageControl>
        <div className="p-4" data-created={created} id="add-host">
          <AddButton onCreateFolder={() => setCreated((n) => n + 1)} />
        </div>
      </ShortcutsProvider>
    </NextIntlClientProvider>
  );
}

/** The panel as it rests with text typed and the destination collapsed. */
function QuickNoteFooter({ locale }: { locale: "en" | "ja" }): ReactElement {
  const noop = () => {};
  return (
    <NextIntlClientProvider locale={locale} messages={locale === "ja" ? jaMessages : enMessages}>
      <QuickNotePresenter
        open
        onOpen={noop}
        triggerRef={{ current: null }}
        dialogRef={{ current: null }}
        onDialogKeyDown={noop}
        body="note"
        onBodyChange={noop}
        filename="note.md"
        bodyRef={{ current: null }}
        drives={["fixture"]}
        drive="fixture"
        onDriveChange={noop}
        folder="Inbox"
        onFolderChange={noop}
        destinationOpen={false}
        onToggleDestination={noop}
        drivesLoading={false}
        drivesFailed={false}
        onReloadDrives={noop}
        canSave
        submitting={null}
        error={null}
        onSave={noop}
        onSaveAndOpen={noop}
        onRequestClose={noop}
        discardOpen={false}
        discardRef={{ current: null }}
        onConfirmDiscard={noop}
        onCancelDiscard={noop}
      />
    </NextIntlClientProvider>
  );
}

function QuickNoteFooterJa(): ReactElement {
  return <QuickNoteFooter locale="ja" />;
}

function QuickNoteFooterEn(): ReactElement {
  return <QuickNoteFooter locale="en" />;
}

function OpenScoped({ label }: { label: string }): null {
  const scope = useMemo(
    () => ({ label, type: "text" as const, seeAllHref: (q: string) => `/notes?q=${encodeURIComponent(q)}` }),
    [label],
  );
  useSearchScope(scope);
  const search = useGlobalSearch();
  useEffect(() => {
    search.open();
  }, [search]);
  return null;
}

/** The modal opened scoped; the spec types the query. Requests fail offline. */
function ScopedSearch({ locale }: { locale: "en" | "ja" }): ReactElement {
  return (
    <NextIntlClientProvider locale={locale} messages={locale === "ja" ? jaMessages : enMessages}>
      <ShortcutsProvider>
        <CurrentDriveProvider>
          <GlobalSearchProvider>
            <GlobalSearch />
            <OpenScoped label={locale === "ja" ? "ノート" : "Notes"} />
          </GlobalSearchProvider>
        </CurrentDriveProvider>
      </ShortcutsProvider>
    </NextIntlClientProvider>
  );
}

function ScopedSearchJa(): ReactElement {
  return <ScopedSearch locale="ja" />;
}

function ScopedSearchEn(): ReactElement {
  return <ScopedSearch locale="en" />;
}

/**
 * The leading control stands in for `TreeToggle`, whose own hooks need the
 * app's providers; what is measured is the row it sits in. The parent is a
 * flex column because every screen that wears the frame puts it in one, and a
 * capped column shrinks to its content there unless it asks for the width.
 */
function PageFrameArrangement({ width }: { width: PageFrameWidth }): ReactElement {
  return (
    <div className="flex min-h-screen flex-col">
    <PageFrame
      width={width}
      header={
        <PageHeader
          leading={
            <button type="button" aria-label="Show tree" className="h-8 w-8 rounded-lg">
              <FolderTree size={16} />
            </button>
          }
          titleIcon={FolderTree}
          title="ライブラリのフォルダとファイルを一覧する"
          scope="動画 · 118件"
          actions={<Button variant="primary">新規ノート</Button>}
        />
      }
    >
      <div id="page-body" className="px-4">
        <p>body</p>
      </div>
    </PageFrame>
    </div>
  );
}


/**
 * Drives one folder navigation through the real entry point, inside the
 * shape the app has: a bounded scroller holding a page several times its
 * own height. A short page cannot show what a snapshot does when it is
 * taller than the box that clips it.
 *
 * The layout effect stands in for `NavigationCommitSignal`, which needs a
 * router the fixture does not have; it reports the same thing at the same
 * moment.
 */
function FolderPushArrangement(): ReactElement {
  const [path, setPath] = useState("/drive/main");
  useLayoutEffect(() => {
    notifyNavigationCommit(path);
  }, [path]);

  const go = (to: string) => {
    navigateWithTransition(folderTransitionKind(path, to), () => setPath(to));
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-14 flex-none items-center gap-3 border-b border-bg-border bg-bg-primary px-4">
        <span id="app-chrome">chrome</span>
        <button id="go-down" type="button" onClick={() => go("/drive/main/movies")}>
          down
        </button>
        <button id="go-up" type="button" onClick={() => go("/drive/main")}>
          up
        </button>
      </header>
      <section
        id="listing-scroller"
        data-listing-scroller=""
        className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-bg-primary"
      >
        <PageFrame
          width="full"
          header={<PageHeader titleIcon={FolderTree} title={path} />}
        >
          <div id="page-body" className="px-4">
            {Array.from({ length: 60 }, (_, i) => (
              <p key={i} className="h-16">
                {path} row {i}
              </p>
            ))}
          </div>
        </PageFrame>
      </section>
    </div>
  );
}




/**
 * The real code viewer, over a source file with one line long enough to
 * wrap. The numbers are generated content, which jsdom does not implement
 * and cannot lay out, so what they do to a selection and to a wrapped line
 * is only answerable here.
 */
const CODE_SOURCE = [
  "fn main() {",
  '    let message = "a line long enough that it has to wrap at this width, which is what puts a second visual row under the first";',
  "    println!(\"{}\", message);",
  "}",
  "",
].join("\n");

/** The same viewer over a file whose numbers need three digits. */
function CodeViewerMany(): ReactElement {
  (window as unknown as Record<string, number>).__maxDecoratedLines =
    MAX_DECORATED_LINES;
  const source = Array.from({ length: 150 }, (_, i) => `let x${i} = ${i};`).join(
    "\n",
  );
  window.fetch = (() =>
    Promise.resolve(new Response(source, { status: 200 }))) as typeof fetch;
  return (
    <NextIntlClientProvider
      locale="en"
      messages={{
        text: {
          loading: "Loading",
          loadFailed: "Failed",
          fileSizeLarge: "Large",
          loadContent: "Load",
          tooLargeToDecorate: "Too large",
        },
      }}
    >
      <div id="host" className="bg-bg-primary p-8" style={{ width: 520 }}>
        <TextPreview
          fileId="codeviewer2"
          fileSize={source.length}
          filename="many.rs"
        />
      </div>
    </NextIntlClientProvider>
  );
}

function CodeViewer(): ReactElement {
  window.fetch = (() =>
    Promise.resolve(new Response(CODE_SOURCE, { status: 200 }))) as typeof fetch;
  return (
    <NextIntlClientProvider
      locale="en"
      messages={{
        text: {
          loading: "Loading",
          loadFailed: "Failed",
          fileSizeLarge: "Large",
          loadContent: "Load",
          tooLargeToDecorate: "Too large",
        },
      }}
    >
      <div id="host" className="bg-bg-primary p-8" style={{ width: 520 }}>
        <TextPreview
          fileId="codeviewer1"
          fileSize={CODE_SOURCE.length}
          filename="main.rs"
          // Crosses the boundary between the last two lines, so every case
          // in this arrangement also holds while a citation is marked.
          highlight="message); }"
        />
      </div>
    </NextIntlClientProvider>
  );
}

/**
 * The same citation in a rendered note, split across elements and whole.
 * `.markdown-body mark` supplies the padding there, and the `pre` rule that
 * zeroes it does not reach — so this is where the seam declarations decide
 * what a reader sees.
 */
function CitationSeamsProse(): ReactElement {
  const split = useRef<HTMLParagraphElement>(null);
  const whole = useRef<HTMLParagraphElement>(null);
  useHighlightPassage(split, "alpha beta gamma", true);
  useHighlightPassage(whole, "alpha beta gamma", true);
  return (
    <div className="markdown-body bg-bg-primary p-8 text-base">
      <p ref={split} id="split">
        <span>alpha </span>
        <span>beta</span>
        {" gamma"}
        <span id="split-tail"> tail</span>
      </p>
      <p ref={whole} id="whole">
        {"alpha beta gamma"}
        <span id="whole-tail"> tail</span>
      </p>
    </div>
  );
}

/**
 * A citation that crosses syntax-highlighting tokens, beside the same line
 * with nothing marked. Both are needed: the question is whether marking a
 * run moves the characters after it.
 */
function CitationSeams(): ReactElement {
  const marked = useRef<HTMLPreElement>(null);
  useHighlightPassage(marked, "const answer = 42", true);
  const line = (tailId: string) => (
    <>
      <span className="hljs-keyword">const</span>
      {" answer = "}
      <span className="hljs-number">42</span>
      {"; // "}
      <span id={tailId}>tail</span>
    </>
  );
  return (
    <div className="bg-bg-primary p-8 font-mono text-base">
      <pre ref={marked} id="marked" className="whitespace-pre-wrap">
        {line("marked-tail")}
      </pre>
      <pre id="plain" className="whitespace-pre-wrap">
        {line("plain-tail")}
      </pre>
    </div>
  );
}

/**
 * A pressed card and the copy of it that swells and fades. The real helper,
 * so what is measured is the element it makes and when it takes it away.
 */
function OpenGhostArrangement(): ReactElement {
  return (
    <div className="flex h-screen flex-col bg-bg-primary">
      <header className="flex h-14 flex-none items-center border-b border-bg-border px-4">
        chrome
      </header>
      <div className="p-4">
        <button
          id="open-card"
          type="button"
          className="block w-56"
          onClick={(e) => showOpenGhost(e.currentTarget.querySelector("[data-file-thumb]"))}
        >
          <div
            data-file-thumb=""
            className="relative aspect-video overflow-hidden rounded-2xl bg-bg-elevated"
          >
            <span id="inside-the-card">card</span>
          </div>
        </button>
      </div>
    </div>
  );
}

/**
 * A path deep enough that the trail cannot fit beside the controls at any
 * width measured here. Its deepest folder is long too: a trail that gives
 * way from the wrong end loses the segment naming where the reader is, and
 * a short last segment hides that by fitting whatever happens.
 */
const DEEP_FOLDER = [
  "Documents",
  "Reference",
  "2026-Q3-Reorganisation",
  "Design-Review-Notes",
  "Attachments",
  "Screenshots",
  "Archived-2026-Originals-And-Masters",
].join("/");
/**
 * Longer than the row at every width measured. The trailing segment is the
 * only one drawn as a bare child of the trail, so it is also the only one
 * whose narrowing rests on `truncate` alone — a name short enough to fit
 * asks nothing of it, and a name that cannot narrow wraps rather than
 * overflowing, which grows the row instead of leaving its box.
 */
const DEEP_LEAF =
  "2026-09-annual-report-final-revision-board-approved.md";

/**
 * A note's row on a phone: the trail is hidden, and the back control, the
 * rename control and the editor's own buttons share the width instead.
 */
const NOTE_FOLDER = "Notes/ああああああああああああああああああああ";
const NOTE_NAME = "untitled-20260921-174327.md";

/**
 * The folder listing's own header: the trail's last segment is a folder,
 * not a trailing node, which is the form `FileDetailChrome` never asks for.
 */
function FolderListingHeaderArrangement(): ReactElement {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <PageFrame
        width="full"
        header={
          <PageHeader
            breadcrumb={
              <Breadcrumb driveName="Household Archive" folderPath={DEEP_FOLDER} />
            }
            scope="1,284 items"
          />
        }
      />
    </NextIntlClientProvider>
  );
}

/** Shallow enough that there is nothing worth folding. */
function FolderListingHeaderShallowArrangement(): ReactElement {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <PageFrame
        width="full"
        header={
          <PageHeader
            breadcrumb={
              <Breadcrumb driveName="Household Archive" folderPath="Documents/Reference" />
            }
            scope="12 items"
          />
        }
      />
    </NextIntlClientProvider>
  );
}

function FileDetailChromeArrangement(): ReactElement {
  const noop = () => {};
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <div className="w-full bg-bg-primary">
        <FileDetailChrome
          drive="Household Archive"
          folderPath={DEEP_FOLDER}
          title={DEEP_LEAF}
          inspector={{ open: false, onToggle: noop }}
        >
          <MediaLayoutToggle />
        </FileDetailChrome>
      </div>
    </NextIntlClientProvider>
  );
}

function FileDetailChromeNoteArrangement(): ReactElement {
  const noop = () => {};
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <div className="w-full bg-bg-primary">
        <FileDetailChrome
          drive="Household Archive"
          folderPath={NOTE_FOLDER}
          title={NOTE_NAME}
          titleNode={<EditableTitle title={NOTE_NAME} onRename={async () => {}} />}
          inspector={{ open: false, onToggle: noop }}
        >
          <SaveDot state={{ status: "idle" }} />
          <MarkdownViewModeToggle mode="preview" onChange={noop} hideSplit />
        </FileDetailChrome>
      </div>
    </NextIntlClientProvider>
  );
}

/** A plain file on a phone: a back control, and no name of its own. */
function FileDetailChromePlainPhoneArrangement(): ReactElement {
  const noop = () => {};
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <div className="w-full bg-bg-primary">
        <FileDetailChrome
          drive="Household Archive"
          folderPath={NOTE_FOLDER}
          title={DEEP_LEAF}
          inspector={{ open: false, onToggle: noop }}
        >
          <MediaLayoutToggle />
        </FileDetailChrome>
      </div>
    </NextIntlClientProvider>
  );
}

/**
 * Playing a collection: the host supplies `onBack`, so the row draws the
 * back control *and* the trail above `md` — the one form where both are on
 * screen at once.
 */
function FileDetailChromeCollectionArrangement(): ReactElement {
  const noop = () => {};
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <div className="w-full bg-bg-primary">
        <FileDetailChrome
          drive="Household Archive"
          folderPath={DEEP_FOLDER}
          title={DEEP_LEAF}
          titleNode={<EditableTitle title={DEEP_LEAF} onRename={async () => {}} />}
          onBack={noop}
          inspector={{ open: false, onToggle: noop }}
        >
          <MediaLayoutToggle />
        </FileDetailChrome>
      </div>
    </NextIntlClientProvider>
  );
}

/**
 * A note opened normally, above `md`: the trail has the whole row rather than
 * the half a collection's back control leaves it, and the rename control is
 * the trail's last segment.
 */
function FileDetailChromeNoteDeepArrangement(): ReactElement {
  const noop = () => {};
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <div className="w-full bg-bg-primary">
        <FileDetailChrome
          drive="Household Archive"
          folderPath={DEEP_FOLDER}
          title={DEEP_LEAF}
          titleNode={<EditableTitle title={DEEP_LEAF} onRename={async () => {}} />}
          inspector={{ open: false, onToggle: noop }}
        >
          <SaveDot state={{ status: "idle" }} />
          <MarkdownViewModeToggle mode="preview" onChange={noop} />
        </FileDetailChrome>
      </div>
    </NextIntlClientProvider>
  );
}

function ArchiveToolbarArrangement(): ReactElement {
  const noop = () => {};
  const crumbs = ["backup-2026-09.zip", ...DEEP_FOLDER.split("/")];
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <div className="w-full bg-bg-primary px-4">
        <ArchiveToolbar
          fileId="abcdef123456"
          archive={{ entries: [], total_entries: 1284, total_size: 734003200 }}
          breadcrumbs={crumbs.map((label, i) => ({
            label,
            path: crumbs.slice(1, i + 1).join("/"),
          }))}
          handleBreadcrumbClick={noop}
          sort="name"
          order="asc"
          typeFilter={null}
          viewMode="list"
          onSortChange={noop}
          onOrderChange={noop}
          onTypeFilterChange={noop}
          onViewModeChange={noop}
        />
      </div>
    </NextIntlClientProvider>
  );
}

/**
 * The phone file page's layers around a viewer opened from inside the
 * player box, which `[data-sheet-snap]` makes sticky.
 */
function ArchiveViewerInPlayer(): ReactElement {
  const noop = () => {};
  const entry: ArchiveEntry = {
    path: "a.jpg",
    filename: "a.jpg",
    file_size: 1,
    compressed_size: 1,
    file_type: "image",
    mime_type: "image/jpeg",
    is_dir: false,
  };
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <div data-sheet-snap="" className="h-dvh overflow-auto bg-bg-primary">
        <header id="page-header" className="sticky top-0 z-20 h-14 bg-bg-primary" />
        <div className="media-detail-host">
          <div className="media-detail-player h-64">
            <ArchiveImageViewer
              fileId="abcdef123456"
              currentImage={entry}
              imageEntries={[entry]}
              imageIndex={0}
              imageLoading={false}
              setImageLoading={noop}
              playing={false}
              setPlaying={noop}
              slideshowInterval={5}
              setSlideshowInterval={noop}
              showControls
              chromeProps={{
                inert: false,
                "aria-hidden": undefined,
                style: { opacity: 1, pointerEvents: "auto" },
                onPointerDown: noop,
              }}
              onIntervalOpenChange={noop}
              face={{ kind: "single", index: 0, indices: [0], showRightHalf: false }}
              faceLabel="1"
              subPageLabel={null}
              canGoPrev={false}
              canGoNext={false}
              rememberOrientation={noop}
              handleImageAreaClick={noop}
              closeViewer={noop}
              spreadMode={false}
              setSpreadMode={noop}
              readingDirection="ltr"
              setReadingDirection={noop}
              setIsCurrentLandscape={noop}
              showRightHalf={false}
              navigatePrev={noop}
              navigateNext={noop}
            />
          </div>
        </div>
        <div id="resting-strip" className="fixed inset-x-0 bottom-0 z-40 h-14 bg-bg-primary" />
      </div>
      <div className="h-[200vh]" />
    </NextIntlClientProvider>
  );
}

/** A 4:3 picture, drawn here so the page needs no file beside it. */
function landscapePicture(): string {
  const c = document.createElement("canvas");
  c.width = 400;
  c.height = 300;
  const g = c.getContext("2d")!;
  g.fillStyle = "#2a6";
  g.fillRect(0, 0, 400, 300);
  g.fillStyle = "#fff";
  g.fillRect(190, 140, 20, 20);
  return c.toDataURL();
}

/** The viewers' frame, content and face boxes around the zoom hook. */
function ViewerZoomFrame(): ReactElement {
  const [paged, setPaged] = useState(0);
  const [toggled, setToggled] = useState(0);
  const src = useMemo(() => landscapePicture(), []);
  const zoom = useViewerZoom({
    resetKey: paged,
    readingDirection: "ltr",
    navigatePrev: () => setPaged((n) => n - 1),
    navigateNext: () => setPaged((n) => n + 1),
    toggleControls: () => setToggled((n) => n + 1),
  });
  return (
    <div className="fixed inset-0 flex flex-col bg-black">
      <output id="paged">{paged}</output>
      <output id="toggled">{toggled}</output>
      <output id="settled">{zoom.settledScale}</output>
      <div
        id="zoom-frame"
        ref={zoom.frameRef}
        className="flex flex-1 items-center overflow-hidden touch-none"
        {...zoom.frameHandlers}
      >
        <div
          ref={zoom.contentRef}
          className="flex h-full w-full items-center"
          style={zoom.contentStyle}
        >
          <div className="flex h-full w-full items-center justify-center">
            <img
              id="zoom-picture"
              src={src}
              alt="picture"
              className="max-h-full max-w-full select-none object-contain"
              draggable={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

const PageFrameFull = (): ReactElement => <PageFrameArrangement width="full" />;
const PageFrameWide = (): ReactElement => <PageFrameArrangement width="wide" />;
const PageFrameList = (): ReactElement => <PageFrameArrangement width="list" />;
const PageFrameReading = (): ReactElement => <PageFrameArrangement width="reading" />;

/** The stubbed pathname is a drive route, so the tree toggle is drawn. */
function ChromeButtonsArrangement(): ReactElement {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <CurrentDriveProvider>
        <ChromeButtons />
      </CurrentDriveProvider>
    </NextIntlClientProvider>
  );
}

/**
 * The frame is what clips the seek knob, so the arrangement draws a real
 * one: the 16:9 `overflow-hidden` box both video players put the controls
 * in.
 */
function PlayerFrame({ visible }: { visible: boolean }): ReactElement {
  const noop = () => {};
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <div
        id="player-frame"
        className="relative aspect-video w-full overflow-hidden bg-black"
      >
        <TouchControlsPresenter
          displayTime={30}
          duration={120}
          bufferedFraction={0.5}
          paused={false}
          muted={false}
          volume={1}
          playbackRate={1}
          interrupted={false}
          visible={visible}
          isFullscreen={false}
          onTogglePlay={noop}
          onSkip={noop}
          onScrubStart={noop}
          onScrubChange={noop}
          onScrubEnd={noop}
          onToggleMute={noop}
          onVolumeChange={noop}
          onPlaybackRateChange={noop}
          onToggleFullscreen={noop}
          captions="unavailable"
          onToggleCaptions={noop}
        />
      </div>
    </NextIntlClientProvider>
  );
}

const PlayerSeekBar = (): ReactElement => <PlayerFrame visible />;
const PlayerHairline = (): ReactElement => <PlayerFrame visible={false} />;

/**
 * The real player, because what this arrangement is for is the browser's
 * own handling of `<track default>`: jsdom has none of it.
 *
 * A file opened from a list is drawn from the seed first, which carries no
 * subtitles, and its tracks are replaced when the detail answer arrives.
 * The button is that arrival.
 */
function PlayerCaptions(): ReactElement {
  const [subtitles, setSubtitles] = useState<SubtitleInfo[]>([]);
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <VideoPlayer videoId="vid" subtitles={subtitles} />
      <button
        type="button"
        id="subtitles-arrive"
        onClick={() =>
          setSubtitles([
            { index: 0, language: "ja", label: "Japanese", format: "srt" },
          ])
        }
      >
        subtitles arrive
      </button>
    </NextIntlClientProvider>
  );
}

const ARRANGEMENTS: Record<string, () => ReactElement> = {
  "chrome-buttons": ChromeButtonsArrangement,
  "folder-listing-header-deep": FolderListingHeaderArrangement,
  "folder-listing-header-shallow": FolderListingHeaderShallowArrangement,
  "file-detail-chrome-deep": FileDetailChromeArrangement,
  "file-detail-chrome-note": FileDetailChromeNoteArrangement,
  "file-detail-chrome-plain-phone": FileDetailChromePlainPhoneArrangement,
  "file-detail-chrome-collection": FileDetailChromeCollectionArrangement,
  "file-detail-chrome-note-deep": FileDetailChromeNoteDeepArrangement,
  "archive-toolbar-deep": ArchiveToolbarArrangement,
  "viewer-zoom": ViewerZoomFrame,
  "archive-viewer-in-player": ArchiveViewerInPlayer,
  "page-frame-full": PageFrameFull,
  "page-frame-wide": PageFrameWide,
  "page-frame-list": PageFrameList,
  "page-frame-reading": PageFrameReading,
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
  "sheet-under-sidebar": SheetUnderSidebar,
  "sheet-over-page-peek": SheetOverPagePeek,
  "sheet-over-page-half": SheetOverPageHalf,
  "sheet-over-page-full": SheetOverPageFull,
  "player-menu-peek": PlayerMenuPeek,
  "player-menu-half": PlayerMenuHalf,
  "menu-portal-choice": MenuPortalChoice,
  "resting-strip-states": RestingStripStates,
  "measured-sheet-peek": MeasuredSheetPeek,
  "measured-sheet-half": MeasuredSheetHalf,
  "measured-sheet-full": MeasuredSheetFull,
  "measured-inspector-left-edge": InspectorColumnLeftEdge,
  "measured-inspector-right-edge": InspectorColumnRightEdge,
  "measured-tree-pane": TreePaneColumn,
  "measured-picker-in-dialog": PickerInDialog,
  "add-menu": AddMenu,
  "quick-note-footer-ja": QuickNoteFooterJa,
  "quick-note-footer-en": QuickNoteFooterEn,
  "scoped-search-ja": ScopedSearchJa,
  "scoped-search-en": ScopedSearchEn,
  "player-seek-bar": PlayerSeekBar,
  "player-hairline": PlayerHairline,
  "player-captions": PlayerCaptions,
  "folder-push": FolderPushArrangement,
  "open-ghost": OpenGhostArrangement,
  "citation-seams": CitationSeams,
  "citation-seams-prose": CitationSeamsProse,
  "code-viewer": CodeViewer,
  "code-viewer-many": CodeViewerMany,
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
