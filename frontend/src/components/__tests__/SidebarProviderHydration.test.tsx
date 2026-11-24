import { render, screen, waitFor } from "@testing-library/react";
import { useEffect, useRef, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { COOKIE_NAME } from "@/lib/nickname";

import { ProfileProvider, useProfile } from "../ProfileProvider";
import { SidebarProvider, useSidebar } from "../SidebarProvider";
import { ThemeProvider, useTheme } from "../ThemeProvider";

// jsdom has no `matchMedia`. A wide viewport is what the providers would
// settle on after hydration, so overlay and the system theme stay fixed.
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
let renders: string[] = [];
let overlayRequests = 0;

function useMountProbe(value: string): string {
  renders.push(value);
  useEffect(() => {
    mounts += 1;
  }, []);
  return value;
}

function SidebarContent() {
  const { isOpen, isOverlay } = useSidebar();
  const state = `${isOpen ? "open" : "closed"}/${isOverlay ? "overlay" : "inline"}`;
  return <span data-testid="value">{useMountProbe(state)}</span>;
}

function ProfileContent() {
  const { nickname } = useProfile();
  return <span data-testid="value">{useMountProbe(nickname ?? "none")}</span>;
}

function ThemeContent() {
  const { theme } = useTheme();
  return <span data-testid="value">{useMountProbe(theme)}</span>;
}

interface ProviderRow {
  name: string;
  Provider: (props: { children: ReactNode }) => ReactElement;
  Content: () => ReactElement;
  prepare: () => void;
  serverValue: string;
  settledValue: string;
}

const providerRows: ProviderRow[] = [
  {
    name: "SidebarProvider",
    Provider: SidebarProvider,
    Content: SidebarContent,
    prepare: () => {},
    serverValue: "closed/inline",
    settledValue: "open/inline",
  },
  {
    name: "ProfileProvider",
    Provider: ProfileProvider,
    Content: ProfileContent,
    prepare: () => {
      document.cookie = `${COOKIE_NAME}=Reader; path=/; SameSite=Strict`;
    },
    serverValue: "none",
    settledValue: "Reader",
  },
  {
    name: "ThemeProvider",
    Provider: ThemeProvider,
    Content: ThemeContent,
    prepare: () => localStorage.setItem("theme-preference", "dark"),
    serverValue: "system",
    settledValue: "dark",
  },
];

beforeEach(() => {
  mounts = 0;
  renders = [];
  overlayRequests = 0;
  localStorage.clear();
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0`;
});

describe("providers across hydration", () => {
  it.each(providerRows)(
    "$name mounts its children once",
    async ({ Provider, Content, prepare, serverValue, settledValue }) => {
      prepare();

      render(
        <Provider>
          <Content />
        </Provider>,
      );

      await waitFor(() =>
        expect(screen.getByTestId("value")).toHaveTextContent(settledValue),
      );

      expect(renders[0]).toBe(serverValue);
      expect(mounts).toBe(1);
    },
  );
});

describe("SidebarProvider overlay requests", () => {
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
      return <SidebarContent />;
    }

    render(
      <SidebarProvider>
        <Borrower />
      </SidebarProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("value")).toHaveTextContent("closed/overlay"),
    );
    expect(overlayRequests).toBe(1);
  });
});
