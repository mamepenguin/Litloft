/**
 * Overlay is two inputs, not one: a narrow viewport, *or* a route that asked
 * for overlay through `useOverlaySidebar`. Every case here is run through
 * both. Keyboard dismissal and overlay-only close-on-navigation are not
 * implemented, and are pinned as absent.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import {
  SidebarProvider,
  useSidebar,
  useOverlaySidebarWhen,
  SIDEBAR_INLINE_MIN_WIDTH,
} from "../SidebarProvider";

/** Written here rather than read from the module, so the two can disagree. */
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
    // behaviour arriving, not a regression.
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
    // Every sidebar row calls `close()` with no test of the mode, and in
    // wide mode `close()` also writes the stored preference.
    mount(false);
    expect(reads("overlay")).toBe("false");
    expect(reads("open")).toBe("true");
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "follow a row" }));

    expect(reads("open")).toBe("false");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("false");
  });
});
