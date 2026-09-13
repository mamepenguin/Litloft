/**
 * AC 22 — the sidebar as an overlay: what holds today, and what does not.
 *
 * Spec 2026-09-12-purpose-oriented-navigation §16 asks for three things.
 * This file measures the current behaviour of each and says plainly which
 * of them the app does **not** do, so that a reader is not left believing
 * a green suite means the criterion is met (arbitration 12).
 *
 * **Overlay is two inputs, not one.** `isOverlay = routeOverlay || narrow`
 * (`SidebarProvider.tsx:51`): a viewport below 1200px, *or* a route that
 * asked for overlay through `useOverlaySidebar` — which is how the
 * two-pane layout borrows the sidebar's place while the folder tree is
 * open beside the content, at any width. A test that reaches overlay only
 * by shrinking the window measures one of the two and calls it the
 * feature, so every case here is run through both doors.
 *
 * **What is not implemented, and is therefore pinned as absent:**
 *
 * - *Keyboard dismissal.* Nothing binds Escape; the sidebar has no
 *   keydown handler and no `useShortcuts` entry that closes it. The
 *   criterion's "keyboard-dismissable" is unmet, and a case below fails
 *   if a handler appears without this docstring being revisited.
 * - *"Navigation closes it only in overlay mode."* Every row calls
 *   `close()` unconditionally. In wide, non-overlay mode `close()` also
 *   writes the stored preference, so following a link there collapses
 *   the sidebar and remembers it collapsed.
 *
 * Both are recorded rather than fixed: this file is a detector, and
 * changing either is a behaviour change that belongs in its own PR.
 *
 * **What this cannot hold.** jsdom lays nothing out, so nothing here is
 * evidence about whether the overlay covers the content, what it does at
 * 1199px versus 1201px, or where focus goes
 * (`.claude/rules/review-workflow.md`, "What a test here cannot hold").
 * The width door is reached by driving `matchMedia`, not by measuring one.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import {
  SidebarProvider,
  useSidebar,
  useOverlaySidebarWhen,
  SIDEBAR_INLINE_MIN_WIDTH,
} from "../SidebarProvider";

/**
 * The width AC 22 names, written here rather than read from the module.
 * The provider builds its query from `SIDEBAR_INLINE_MIN_WIDTH`, so this
 * is the one place the criterion's own number and the implementation's
 * can disagree.
 */
const AC22_INLINE_MIN_WIDTH = 1200;
const NARROW_QUERY = `(max-width: ${SIDEBAR_INLINE_MIN_WIDTH - 1}px)`;

/** Where the provider remembers the wide-mode preference. */
const STORAGE_KEY = "sidebar-open";

/** The media query the provider subscribes to, driven by hand. */
let matches = false;
let listeners: (() => void)[] = [];

function setViewportNarrow(next: boolean): void {
  matches = next;
  act(() => {
    for (const l of listeners) l();
  });
}

beforeEach(() => {
  matches = false;
  listeners = [];
  localStorage.clear();
  window.matchMedia = ((query: string) => ({
    // A getter, not a snapshot. The provider keeps the object it got and
    // reads `.matches` when the listener fires, so a value captured at
    // construction never changes and the narrow door never opens.
    get matches() {
      return query === NARROW_QUERY ? matches : false;
    },
    media: query,
    addEventListener: (_: string, l: () => void) => listeners.push(l),
    removeEventListener: (_: string, l: () => void) => {
      listeners = listeners.filter((x) => x !== l);
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

/** Reports the context, and offers the two acts a row performs. */
function Probe({ routeAsksForOverlay = false }: { routeAsksForOverlay?: boolean }) {
  const { isOpen, isOverlay, toggle, close } = useSidebar();
  useOverlaySidebarWhen(routeAsksForOverlay);
  return (
    <div>
      <span data-testid="open">{String(isOpen)}</span>
      <span data-testid="overlay">{String(isOverlay)}</span>
      <button type="button" onClick={toggle}>
        toggle
      </button>
      <button type="button" onClick={close}>
        follow a row
      </button>
    </div>
  );
}

function mount(routeAsksForOverlay = false) {
  return render(
    <SidebarProvider>
      <Probe routeAsksForOverlay={routeAsksForOverlay} />
    </SidebarProvider>,
  );
}

const reads = (id: string) => screen.getByTestId(id).textContent;

/**
 * The two ways a screen becomes an overlay, declared rather than
 * collected: a door that stops working drops out of this table and takes
 * its own cases with it.
 */
const DOORS: [string, () => void][] = [
  ["a viewport under 1200px", () => setViewportNarrow(true)],
  ["a route that asks for it", () => {}],
];

describe("the sidebar in overlay mode", () => {
  it("switches at the width the criterion names", () => {
    expect(SIDEBAR_INLINE_MIN_WIDTH).toBe(AC22_INLINE_MIN_WIDTH);
  });

  it.each(DOORS)("%s puts it in overlay", (name, open) => {
    mount(name === "a route that asks for it");
    open();
    expect(reads("overlay")).toBe("true");
  });

  it("is not in overlay when neither door is open", () => {
    // The population: without this, every case above passes over a
    // provider that reports overlay unconditionally.
    mount(false);
    expect(reads("overlay")).toBe("false");
  });

  it.each(DOORS)("%s: it can still be opened and closed by hand", (name, open) => {
    mount(name === "a route that asks for it");
    open();
    expect(reads("open")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "toggle" }));
    expect(reads("open")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "toggle" }));
    expect(reads("open")).toBe("false");
  });

  it.each(DOORS)("%s: opening it does not become the remembered preference", (name, open) => {
    // Overlay is a state of the screen, not a choice about the app. A
    // sidebar opened over the content on a phone must not be waiting,
    // open, on the desktop afterwards.
    mount(name === "a route that asks for it");
    open();
    fireEvent.click(screen.getByRole("button", { name: "toggle" }));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe("AC 22's unmet halves, pinned as unmet", () => {
  it("has no keyboard dismissal: Escape does nothing", () => {
    // If this goes red because Escape now closes it, that is the
    // criterion being met — update this file's docstring with it rather
    // than deleting the case. Run in overlay, where the criterion asks
    // for the behaviour, and where an overlay with no keyboard exit is
    // the trap it describes.
    mount(false);
    setViewportNarrow(true);
    fireEvent.click(screen.getByRole("button", { name: "toggle" }));
    expect(reads("overlay")).toBe("true");
    expect(reads("open")).toBe("true");

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.keyDown(screen.getByTestId("open"), { key: "Escape" });

    expect(reads("open")).toBe("true");
  });

  it("closes on navigation in wide mode too, and remembers it closed", () => {
    // AC 22 asks for "navigation closes it only in overlay mode". Every
    // sidebar row calls `close()` with no test of the mode, and in wide
    // mode `close()` also writes the stored preference — so following a
    // link collapses the sidebar and the next visit finds it collapsed.
    //
    // Wide mode starts open with nothing stored, which is the state a
    // first-time reader is in, so no toggle is needed to reach it.
    mount(false);
    expect(reads("overlay")).toBe("false");
    expect(reads("open")).toBe("true");
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "follow a row" }));

    expect(reads("open")).toBe("false");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("false");
  });
});
