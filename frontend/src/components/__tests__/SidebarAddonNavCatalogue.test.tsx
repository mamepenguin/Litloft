/**
 * The catalogue comes from the real provider and the real `getAddonsStatus`,
 * with `fetch` as the only stand-in: that function never rejects, so a failure
 * is only reachable by failing the request underneath it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, waitFor } from "@testing-library/react";

import { AddonSlotsProvider } from "../AddonSlotsProvider";
import { Sidebar } from "../Sidebar";
import { invalidateAddonsCache } from "@/lib/addons";

let drive = "alpha";

vi.mock("next/navigation", () => ({
  usePathname: () => `/drive/${drive}`,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("../SidebarProvider", () => ({
  useSidebar: () => ({ isOpen: true, isOverlay: false, close: vi.fn(), refreshKey: 0 }),
}));

vi.mock("../AddonSlot", () => ({ AddonSlot: () => null }));

vi.mock("../CurrentDriveProvider", () => ({
  useCurrentDrive: () => drive,
  useCurrentFolderPath: () => null,
  useSetOverrideDrive: () => vi.fn(),
}));

vi.mock("../sidebar/useSidebarData", () => ({
  useSidebarData: () => ({
    drives: [{ name: "alpha", file_count: 1 }, { name: "beta", file_count: 1 }],
    tags: null,
    pins: [],
    collectionList: [],
    setCollectionList: vi.fn(),
    authStatus: { is_admin: false },
    driveSummary: { missing_count: 0 },
  }),
}));

vi.mock("@/hooks/useShortcuts", () => ({ useShortcuts: vi.fn() }));
vi.mock("@/hooks/useSmartFolders", () => ({
  useSmartFolders: () => ({ smartFolders: [], update: vi.fn(), remove: vi.fn() }),
}));

function catalogueWith(names: string[]) {
  return {
    addons: Object.fromEntries(
      names.map((name, i) => [
        name,
        {
          label: name,
          icon: "package",
          href: `/drive/{drive}/addons/${name}`,
          scope: "drive",
          navigation: { label: `Nav ${name}`, placement: "sources", priority: i },
        },
      ]),
    ),
    slots: {},
  };
}

type Pending = { resolve: (body: unknown) => void };
let pending: Map<string, Pending>;

function respondFor(d: string, body: unknown) {
  const p = pending.get(d);
  if (!p) throw new Error(`no request for ${d}`);
  p.resolve(body);
}

const labels = () =>
  Array.from(document.querySelectorAll("nav a")).map((a) => a.textContent?.trim());
const addonLabels = () => labels().filter((l) => l?.startsWith("Nav "));
const coreRows = ["Home", "Library", "Favorites", "Liked", "Recently Viewed", "Recently Added", "All Files", "Trash"];

beforeEach(() => {
  drive = "alpha";
  pending = new Map();
  invalidateAddonsCache();
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const d = new URL(url, "http://x").searchParams.get("drive") ?? "";
      return new Promise((resolve) => {
        pending.set(d, {
          resolve: (body) => resolve({ ok: true, json: async () => body } as Response),
        });
      });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  invalidateAddonsCache();
});

const tree = () => (
  <AddonSlotsProvider>
    <Sidebar />
  </AddonSlotsProvider>
);

describe("addon rows from the drive's own catalogue", () => {
  it("keeps every Core row, with no addon row or heading, while the catalogue loads", () => {
    render(tree());
    expect(labels()).toEqual(expect.arrayContaining(coreRows));
    expect(addonLabels()).toEqual([]);
    expect(document.querySelector("nav")?.textContent).not.toContain("Sources");
  });

  it("keeps every Core row, with no addon row or heading, when the catalogue request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("network down"))));
    render(tree());
    await act(async () => {});
    expect(labels()).toEqual(expect.arrayContaining(coreRows));
    expect(addonLabels()).toEqual([]);
    expect(document.querySelector("nav")?.textContent).not.toContain("Sources");
  });

  it("draws the rows once the catalogue arrives", async () => {
    render(tree());
    await act(async () => respondFor("alpha", catalogueWith(["one"])));
    await waitFor(() => expect(addonLabels()).toEqual(["Nav one"]));
  });

  it("drops the previous drive's rows at the switch, before the new catalogue arrives", async () => {
    const { rerender } = render(tree());
    await act(async () => respondFor("alpha", catalogueWith(["only_on_alpha"])));
    await waitFor(() => expect(addonLabels()).toEqual(["Nav only_on_alpha"]));

    drive = "beta";
    rerender(tree());

    expect(addonLabels()).toEqual([]);
    await act(async () => respondFor("beta", catalogueWith(["on_beta"])));
    await waitFor(() => expect(addonLabels()).toEqual(["Nav on_beta"]));
  });

  it("does not let a late answer for the previous drive replace the current one's rows", async () => {
    const { rerender } = render(tree());
    drive = "beta";
    rerender(tree());

    await act(async () => respondFor("beta", catalogueWith(["on_beta"])));
    await waitFor(() => expect(addonLabels()).toEqual(["Nav on_beta"]));
    await act(async () => respondFor("alpha", catalogueWith(["only_on_alpha"])));

    expect(addonLabels()).toEqual(["Nav on_beta"]);
  });
});
