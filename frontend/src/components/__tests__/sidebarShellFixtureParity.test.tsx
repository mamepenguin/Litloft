import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

import { AppShell } from "../AppShell";
import { SidebarProvider, SIDEBAR_INLINE_MIN_WIDTH } from "../SidebarProvider";

/**
 * The fixture draws its own markup because a static page off `file://`
 * cannot import a `.tsx`, so its class lists are pinned against the
 * components here.
 */
const FIXTURE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../e2e-layout/fixtures/sidebar-shell.html",
);

const SPEC: Record<string, string | number> = JSON.parse(
  readFileSync(FIXTURE, "utf8").match(
    /<script type="application\/json" id="fixture-markup">([\s\S]*?)<\/script>/,
  )![1],
);

const sidebarState = vi.hoisted(() => ({ isOpen: false, isOverlay: false }));

vi.mock("../SidebarProvider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../SidebarProvider")>()),
  useSidebar: () => ({
    isOpen: sidebarState.isOpen,
    isOverlay: sidebarState.isOverlay,
    toggle: vi.fn(),
    close: vi.fn(),
    setOverlayMode: vi.fn(),
    refreshKey: 0,
    requestRefresh: vi.fn(),
  }),
}));
vi.mock("../Header", () => ({ Header: () => <header /> }));
vi.mock("../ShortcutsProvider", () => ({
  ShortcutsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/hooks/useShortcuts", () => ({ useShortcuts: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/d",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("../AddonSlotsProvider", () => ({
  useAddonSlots: () => ({ addons: {}, slots: {}, loading: false }),
}));
vi.mock("../AddonSlot", () => ({ AddonSlot: () => null }));
vi.mock("../CurrentDriveProvider", () => ({
  useCurrentDrive: () => "d",
  useCurrentFolderPath: () => null,
  useSetOverrideDrive: () => vi.fn(),
}));
vi.mock("../sidebar/useSidebarData", () => ({
  useSidebarData: () => ({
    drives: [{ name: "d", file_count: 1 }],
    tags: null,
    pins: [],
    collectionList: [],
    setCollectionList: vi.fn(),
    authStatus: { is_admin: false },
    driveSummary: { missing_count: 0 },
  }),
}));
vi.mock("@/hooks/useSmartFolders", () => ({
  useSmartFolders: () => ({ smartFolders: [], update: vi.fn(), remove: vi.fn() }),
}));

afterEach(cleanup);

const tokens = (list: string) => [...new Set(list.split(/\s+/).filter(Boolean))].sort();

function shell(isOpen: boolean, isOverlay: boolean) {
  sidebarState.isOpen = isOpen;
  sidebarState.isOverlay = isOverlay;
  const { container } = render(
    <AppShell>
      <p>content</p>
    </AppShell>,
  );
  const aside = container.querySelector("aside")!;
  const main = container.querySelector("main")!;
  const scrims = [...container.querySelectorAll<HTMLElement>("div[aria-hidden].fixed.inset-0")];
  return { aside, main, content: main.parentElement!, scrims };
}

describe("the sidebar-shell fixture draws the app's markup", () => {
  it("open beside the page", () => {
    const s = shell(true, false);
    expect(tokens(s.aside.className)).toEqual(tokens(SPEC.asideOpen as string));
    expect(tokens(s.content.className)).toEqual(tokens(SPEC.contentInlineOpen as string));
    expect(tokens(s.main.className)).toEqual(tokens(SPEC.main as string));
    expect(s.scrims).toHaveLength(0);
  });

  it("open over the page", () => {
    const s = shell(true, true);
    expect(tokens(s.aside.className)).toEqual(tokens(SPEC.asideOpen as string));
    expect(tokens(s.content.className)).toEqual(tokens(SPEC.content as string));
    expect(s.scrims).toHaveLength(1);
    expect(tokens(s.scrims[0].className)).toEqual(tokens(SPEC.scrim as string));
  });

  it("closed, at either width", () => {
    for (const overlay of [false, true]) {
      const s = shell(false, overlay);
      expect(tokens(s.aside.className)).toEqual(tokens(SPEC.asideClosed as string));
      expect(tokens(s.content.className)).toEqual(tokens(SPEC.content as string));
      expect(s.scrims).toHaveLength(0);
      cleanup();
    }
  });

  it("switches to overlay at the width the stylesheet stops making room", async () => {
    expect(SPEC.inlineMinWidth).toBe(SIDEBAR_INLINE_MIN_WIDTH);
    expect(SPEC.contentInlineOpen).toContain(`min-[${SPEC.inlineMinWidth}px]:pl-60`);

    const queries: string[] = [];
    window.matchMedia = ((query: string) => {
      queries.push(query);
      return {
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      };
    }) as unknown as typeof window.matchMedia;
    render(
      <SidebarProvider>
        <p />
      </SidebarProvider>,
    );
    expect(queries).toContain(`(max-width: ${(SPEC.inlineMinWidth as number) - 1}px)`);
  });
});
