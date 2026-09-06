import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, cleanup } from "@testing-library/react";
import { useState } from "react";

import {
  SidebarProvider,
  useSidebar,
  useOverlaySidebarWhen,
} from "../SidebarProvider";

// jsdom has no `matchMedia`. `SidebarProvider` asks it one question — is
// the viewport too narrow for the sidebar to sit beside the content — and
// these tests are all about the wide case, where lending is visible.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  }),
});

/** Reports what the provider decided, and lets a test drive the borrow. */
function Probe({ borrowing }: { borrowing: boolean }) {
  useOverlaySidebarWhen(borrowing);
  const { isOpen, isOverlay, toggle } = useSidebar();
  return (
    <div>
      <span data-testid="open">{String(isOpen)}</span>
      <span data-testid="overlay">{String(isOverlay)}</span>
      <button onClick={toggle}>toggle</button>
    </div>
  );
}

function Harness({ initial }: { initial: boolean }) {
  const [borrowing, setBorrowing] = useState(initial);
  return (
    <SidebarProvider>
      <Probe borrowing={borrowing} />
      <button onClick={() => setBorrowing((b) => !b)}>flip</button>
    </SidebarProvider>
  );
}

const open = () => screen.getByTestId("open").textContent;
const overlay = () => screen.getByTestId("overlay").textContent;
const flip = () => fireFlip();
function fireFlip() {
  act(() => {
    screen.getByText("flip").click();
  });
}

/**
 * NAV-2 rule 1. The folder tree borrows the sidebar's place while it is
 * open. "Borrow" is the whole design: the reader's stored preference has
 * to survive the trip, which is why this is overlay mode and not
 * `close()` — `close()` writes `false` into `localStorage` when the
 * sidebar is inline, so there would be nothing left to restore.
 */
describe("lending the sidebar its place", () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("stops it taking width, and gives that back", () => {
    localStorage.setItem("sidebar-open", "true");
    render(<Harness initial={false} />);
    expect(open()).toBe("true");
    expect(overlay()).toBe("false");

    flip();
    expect(overlay()).toBe("true");
    expect(open()).toBe("false");

    flip();
    expect(overlay()).toBe("false");
    expect(open()).toBe("true");
  });

  it("leaves the reader's stored answer exactly as it found it", () => {
    localStorage.setItem("sidebar-open", "true");
    render(<Harness initial={false} />);

    flip();
    expect(localStorage.getItem("sidebar-open")).toBe("true");
    flip();
    expect(localStorage.getItem("sidebar-open")).toBe("true");
  });

  it("does not open a sidebar the reader keeps closed", () => {
    localStorage.setItem("sidebar-open", "false");
    render(<Harness initial={false} />);
    expect(open()).toBe("false");

    flip();
    flip();

    // Restoring means restoring, not opening.
    expect(open()).toBe("false");
    expect(localStorage.getItem("sidebar-open")).toBe("false");
  });

  it("still opens over the top while it is lending", () => {
    // Nothing is taken away, only moved: the hamburger works throughout.
    localStorage.setItem("sidebar-open", "false");
    render(<Harness initial={true} />);
    expect(overlay()).toBe("true");
    expect(open()).toBe("false");

    act(() => {
      screen.getByText("toggle").click();
    });
    expect(open()).toBe("true");
    // ...and opening it over the top is not a new preference.
    expect(localStorage.getItem("sidebar-open")).toBe("false");
  });

  it("asks for nothing while it is not borrowing", () => {
    // The conditional form has to be conditional: an unconditional
    // request would put the sidebar in overlay mode on every page that
    // renders a tree, whether or not the tree is on.
    localStorage.setItem("sidebar-open", "true");
    render(<Harness initial={false} />);
    expect(overlay()).toBe("false");
    expect(open()).toBe("true");
  });

  it("gives the place back when the borrower goes away without warning", () => {
    // A borrower does not always get to say it is finished. Navigating
    // from a folder with the tree open to `/`, `/admin`, an addon route or
    // `?view=trash` unmounts the whole layout that was holding the space,
    // and the only thing left to hand it back is the effect's own cleanup.
    // Without it the count never returns to zero and the sidebar takes no
    // width anywhere, at any width, until the tab is reloaded.
    localStorage.setItem("sidebar-open", "true");
    render(<UnmountHarness />);
    expect(overlay()).toBe("true");
    expect(open()).toBe("false");

    act(() => {
      screen.getByText("unmount").click();
    });

    expect(overlay()).toBe("false");
    expect(open()).toBe("true");
  });

  it("waits for the last borrower", () => {
    // Two surfaces can want the space at once; the count is what stops
    // the first one to finish handing it back on behalf of both.
    localStorage.setItem("sidebar-open", "true");
    function Two() {
      const [a, setA] = useState(true);
      const [b, setB] = useState(true);
      return (
        <SidebarProvider>
          <Probe borrowing={a} />
          <Borrower active={b} />
          <button onClick={() => setA(false)}>stopA</button>
          <button onClick={() => setB(false)}>stopB</button>
        </SidebarProvider>
      );
    }
    render(<Two />);
    expect(overlay()).toBe("true");

    act(() => screen.getByText("stopA").click());
    expect(overlay()).toBe("true");

    act(() => screen.getByText("stopB").click());
    expect(overlay()).toBe("false");
    expect(open()).toBe("true");
  });
});

function Borrower({ active }: { active: boolean }) {
  useOverlaySidebarWhen(active);
  return null;
}

/** Reads the provider's answer without borrowing, so it outlives the borrower. */
function Readout() {
  const { isOpen, isOverlay } = useSidebar();
  return (
    <div>
      <span data-testid="open">{String(isOpen)}</span>
      <span data-testid="overlay">{String(isOverlay)}</span>
    </div>
  );
}

function UnmountHarness() {
  const [mounted, setMounted] = useState(true);
  return (
    <SidebarProvider>
      {mounted && <Borrower active={true} />}
      <Readout />
      <button onClick={() => setMounted(false)}>unmount</button>
    </SidebarProvider>
  );
}

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/work",
}));
