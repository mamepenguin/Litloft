import { render, screen, waitFor } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { SidebarProvider, useSidebar } from "../SidebarProvider";

// jsdom has no `matchMedia`. A wide viewport is what the provider would
// settle on after hydration, so overlay only changes when asked for.
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

let mounts = 0;
let overlayRequests = 0;

function Probe() {
  const { isOpen, isOverlay } = useSidebar();
  useEffect(() => {
    mounts += 1;
  }, []);
  return (
    <div>
      <span data-testid="open">{String(isOpen)}</span>
      <span data-testid="overlay">{String(isOverlay)}</span>
    </div>
  );
}

beforeEach(() => {
  mounts = 0;
  overlayRequests = 0;
  localStorage.clear();
});

describe("SidebarProvider hydration", () => {
  it("does not remount its children when it knows the viewport after hydration", async () => {
    render(
      <SidebarProvider>
        <Probe />
      </SidebarProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("open")).toHaveTextContent("true"));

    expect(mounts).toBe(1);
  });

  it("keeps an overlay request made by a child's first mount effect", async () => {
    function Borrower() {
      const { setOverlayMode } = useSidebar();
      // A mount-only caller reads the callback once and never again; the
      // ref keeps this effect from being re-run by a changed identity.
      const requestOverlay = useRef(setOverlayMode);
      useEffect(() => {
        overlayRequests += 1;
        requestOverlay.current(true);
      }, []);
      return <Probe />;
    }

    render(
      <SidebarProvider>
        <Borrower />
      </SidebarProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("overlay")).toHaveTextContent("true"));
    expect(overlayRequests).toBe(1);
  });
});
