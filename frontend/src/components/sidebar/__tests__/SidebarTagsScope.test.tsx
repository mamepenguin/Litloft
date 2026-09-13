/**
 * `useSidebarData` only calls `setTags` when the fetch resolves, so the
 * previous scope's rows stay on screen while a new fetch is in flight.
 */

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { render, screen } from "@testing-library/react";

import { SidebarTagsSection } from "../SidebarTagsSection";
import type { ScopedTags } from "../useSidebarData";

// ---- localStorage mock (tag sort mode reads it on render) --------------------

function makeLocalStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k: string) => store.get(k) ?? null,
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => {
      store.delete(k);
    },
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
  };
}

const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
const mockStorage = makeLocalStorageMock();
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: mockStorage,
});

afterAll(() => {
  if (originalLocalStorageDescriptor) {
    Object.defineProperty(window, "localStorage", originalLocalStorageDescriptor);
  }
});

vi.mock("next/link", () => ({
  default: ({ children, href, onClick, className }: {
    children: React.ReactNode;
    href: string;
    onClick?: () => void;
    className?: string;
  }) => (
    <a href={href} onClick={onClick} className={className}>
      {children}
    </a>
  ),
}));

function scoped(drive: string, folderPath: string | null, names: string[]): ScopedTags {
  return {
    resolvedScope: { drive, folderPath },
    items: names.map((name, i) => ({ name, count: names.length - i })),
  };
}

function hrefs(): string[] {
  return screen.getAllByRole("link").map((a) => a.getAttribute("href") ?? "");
}

function activeRowNames(): string[] {
  return Array.from(document.querySelectorAll(".is-active")).map(
    (el) => el.textContent?.replace(/[0-9]/g, "").trim() ?? "",
  );
}

function renderSection(props: {
  tags: ScopedTags | null;
  drive: string | null;
  currentFolderPath: string | null;
  pathname?: string;
  activeTag?: string | null;
  activeView?: string | null;
}) {
  const defaultPathname = `/drive/${encodeURIComponent(props.drive ?? "")}${
    props.currentFolderPath
      ? `/${props.currentFolderPath.split("/").map(encodeURIComponent).join("/")}`
      : ""
  }`;
  return render(
    <SidebarTagsSection
      drive={props.drive}
      currentFolderPath={props.currentFolderPath}
      pathname={props.pathname ?? defaultPathname}
      tags={props.tags}
      activeTag={props.activeTag ?? null}
      activeView={props.activeView ?? null}
      // Report the active flag the section computed, so the tests can
      // assert the highlight independently of the href.
      linkClass={(_href, active) => (active ? "is-active" : "")}
      close={vi.fn()}
    />,
  );
}

describe("SidebarTagsSection — scope agreement", () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it("targets the drive root when the resolved scope has no folder", () => {
    renderSection({
      tags: scoped("main", null, ["soup"]),
      drive: "main",
      currentFolderPath: null,
    });
    expect(hrefs()).toEqual(["/drive/main?tag=soup"]);
  });

  it("targets the folder when the resolved scope has one", () => {
    renderSection({
      tags: scoped("main", "recipes", ["soup"]),
      drive: "main",
      currentFolderPath: "recipes",
    });
    expect(hrefs()).toEqual(["/drive/main/recipes?tag=soup"]);
  });

  it("encodes each path segment individually", () => {
    // The folder route decodes segments one at a time
    // (app/drive/[name]/[...path]/page.tsx), so a whole-path encode would
    // not round-trip. Non-ASCII names and symbols must survive.
    renderSection({
      tags: scoped("main", "料理/煮込み 2024", ["炒め物"]),
      drive: "main",
      currentFolderPath: "料理/煮込み 2024",
    });
    const [href] = hrefs();
    expect(href).toBe(
      `/drive/main/${encodeURIComponent("料理")}/${encodeURIComponent("煮込み 2024")}` +
        `?tag=${encodeURIComponent("炒め物")}`,
    );
    // The separator between segments stays a real "/", not %2F.
    expect(href.split("?")[0].split("/").filter(Boolean)).toHaveLength(4);
  });

  it("keeps rows visible but inert while the folder scope is stale", () => {
    renderSection({
      tags: scoped("main", "recipes", ["soup", "stew"]),
      drive: "main",
      currentFolderPath: "dev",
    });
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByText("soup")).toBeInTheDocument();
    expect(screen.getByText("stew")).toBeInTheDocument();
  });

  it("keeps rows inert while widening from a folder back to the root", () => {
    renderSection({
      tags: scoped("main", "recipes", ["soup"]),
      drive: "main",
      currentFolderPath: null,
    });
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByText("soup")).toBeInTheDocument();
  });

  it("keeps rows inert when the drive is stale, even at a matching folder", () => {
    renderSection({
      tags: scoped("work", null, ["confidential"]),
      drive: "personal",
      currentFolderPath: null,
    });
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByText("confidential")).toBeInTheDocument();
  });

  it("stays live on routes where currentFolderPath is stably null", () => {
    // /drive/[name]/search, /collections/[id], /addons/... and /files/[id]
    // never publish a folder path.
    renderSection({
      tags: scoped("main", null, ["soup"]),
      drive: "main",
      currentFolderPath: null,
    });
    expect(hrefs()).toEqual(["/drive/main?tag=soup"]);
  });

  it("renders nothing when no tags have been fetched yet", () => {
    const { container } = renderSection({
      tags: null,
      drive: "main",
      currentFolderPath: null,
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the fetched scope has no tags", () => {
    const { container } = renderSection({
      tags: scoped("main", "recipes", []),
      drive: "main",
      currentFolderPath: "recipes",
    });
    expect(container).toBeEmptyDOMElement();
  });
});

/**
 * `linkClass(href)` derives the highlight from the href, and a cleared
 * row's href no longer carries `?tag=`.
 */
describe("SidebarTagsSection — clearing the selected tag", () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it("points the selected tag back at the folder, without the tag", () => {
    renderSection({
      tags: scoped("main", "recipes", ["soup"]),
      drive: "main",
      currentFolderPath: "recipes",
      activeTag: "soup",
    });
    expect(hrefs()).toEqual(["/drive/main/recipes"]);
  });

  it("points the selected tag back at the drive root when unscoped", () => {
    renderSection({
      tags: scoped("main", null, ["soup"]),
      drive: "main",
      currentFolderPath: null,
      activeTag: "soup",
    });
    expect(hrefs()).toEqual(["/drive/main"]);
  });

  it("keeps the selected row highlighted even though its href lost the tag", () => {
    renderSection({
      tags: scoped("main", "recipes", ["soup", "stew"]),
      drive: "main",
      currentFolderPath: "recipes",
      activeTag: "soup",
    });
    expect(activeRowNames()).toEqual(["soup"]);
  });

  it("leaves unselected tags applying their own filter", () => {
    renderSection({
      tags: scoped("main", "recipes", ["soup", "stew"]),
      drive: "main",
      currentFolderPath: "recipes",
      activeTag: "soup",
    });
    expect(hrefs()).toEqual(["/drive/main/recipes", "/drive/main/recipes?tag=stew"]);
  });

  it("selects nothing when no tag filter is applied", () => {
    renderSection({
      tags: scoped("main", "recipes", ["soup"]),
      drive: "main",
      currentFolderPath: "recipes",
      activeTag: null,
    });
    expect(hrefs()).toEqual(["/drive/main/recipes?tag=soup"]);
    expect(activeRowNames()).toEqual([]);
  });

  it("selects nothing while a view is active", () => {
    // ?view= wins over ?tag= in the drive route, so a tag row must not
    // claim to be selected there.
    renderSection({
      tags: scoped("main", null, ["soup"]),
      drive: "main",
      currentFolderPath: null,
      activeTag: "soup",
      activeView: "favorites",
    });
    expect(hrefs()).toEqual(["/drive/main?tag=soup"]);
    expect(activeRowNames()).toEqual([]);
  });

  it("never marks a stale-scope row as selected", () => {
    renderSection({
      tags: scoped("main", "recipes", ["soup"]),
      drive: "main",
      currentFolderPath: "dev",
      activeTag: "soup",
    });
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(activeRowNames()).toEqual([]);
  });

  it("encodes the clear target per path segment", () => {
    renderSection({
      tags: scoped("main", "料理/煮込み 2024", ["炒め物"]),
      drive: "main",
      currentFolderPath: "料理/煮込み 2024",
      activeTag: "炒め物",
    });
    expect(hrefs()).toEqual([
      `/drive/main/${encodeURIComponent("料理")}/${encodeURIComponent("煮込み 2024")}`,
    ]);
  });
});

/**
 * `currentFolderPath` is stably null on /drive/[name]/search,
 * /drive/[name]/collections/[id], the addon routes and /files/[id], so
 * scope agreement alone cannot tell "at the drive root" from "on a sibling
 * route".
 */
describe("SidebarTagsSection — selection is page-scoped", () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it("does not treat a tag as selected on a sibling route", () => {
    renderSection({
      tags: scoped("main", null, ["soup"]),
      drive: "main",
      currentFolderPath: null,
      pathname: "/drive/main/search",
      activeTag: "soup",
    });
    expect(hrefs()).toEqual(["/drive/main?tag=soup"]);
    expect(activeRowNames()).toEqual([]);
  });

  it("does not treat a tag as selected on a file-detail route", () => {
    renderSection({
      tags: scoped("main", null, ["soup"]),
      drive: "main",
      currentFolderPath: null,
      pathname: "/files/abc123",
      activeTag: "soup",
    });
    expect(hrefs()).toEqual(["/drive/main?tag=soup"]);
    expect(activeRowNames()).toEqual([]);
  });

  it("does not treat a tag as selected on a collection route", () => {
    renderSection({
      tags: scoped("main", null, ["soup"]),
      drive: "main",
      currentFolderPath: null,
      pathname: "/drive/main/collections/c1",
      activeTag: "soup",
    });
    expect(hrefs()).toEqual(["/drive/main?tag=soup"]);
    expect(activeRowNames()).toEqual([]);
  });

  it("treats a decoded pathname as the same page as an encoded href", () => {
    renderSection({
      tags: scoped("main", "料理", ["炒め物"]),
      drive: "main",
      currentFolderPath: "料理",
      pathname: "/drive/main/料理",
      activeTag: "炒め物",
    });
    expect(hrefs()).toEqual([`/drive/main/${encodeURIComponent("料理")}`]);
    expect(activeRowNames()).toEqual(["炒め物"]);
  });
});

/**
 * The server matches tags case-insensitively. An exact comparison in the
 * UI would filter the listing while showing nothing selected.
 */
describe("SidebarTagsSection — tag matching follows the server", () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it("selects a tag whose stored casing differs from the URL", () => {
    renderSection({
      tags: scoped("main", "recipes", ["Soup"]),
      drive: "main",
      currentFolderPath: "recipes",
      activeTag: "soup",
    });
    expect(hrefs()).toEqual(["/drive/main/recipes"]);
    expect(activeRowNames()).toEqual(["Soup"]);
  });

  it("keeps the stored casing in the applying href", () => {
    renderSection({
      tags: scoped("main", "recipes", ["Soup"]),
      drive: "main",
      currentFolderPath: "recipes",
      activeTag: null,
    });
    expect(hrefs()).toEqual(["/drive/main/recipes?tag=Soup"]);
  });

  it("still distinguishes different tags", () => {
    renderSection({
      tags: scoped("main", "recipes", ["Soup", "Stew"]),
      drive: "main",
      currentFolderPath: "recipes",
      activeTag: "stew",
    });
    expect(activeRowNames()).toEqual(["Stew"]);
  });
});
