/**
 * spec 2026-08-21-folder-scoped-tag-filter §5.0 / §9.2
 *
 * SidebarTagsScope.test.tsx pins the render gate against a scope handed in
 * directly. This file pins the thing the gate exists for: the window
 * between asking for a new scope and receiving it, driven through
 * `useSidebarData` itself.
 *
 * Every fetch here is a deferred promise, so the in-flight window is
 * *observed* rather than raced past. The failure this guards against is
 * silent: a drive-wide (or previous-folder) result is indistinguishable
 * from a correct one at a glance, so a click in that window navigates to
 * the wrong scope with nothing to show for it.
 */

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";

import { SidebarTagsSection } from "../SidebarTagsSection";
import { useSidebarData } from "../useSidebarData";

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

// ---- mocks -------------------------------------------------------------------

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

vi.mock("@/lib/api", () => ({
  getDrives: vi.fn().mockResolvedValue([]),
  getDriveTags: vi.fn(),
  getPins: vi.fn().mockResolvedValue([]),
  getCollections: vi.fn().mockResolvedValue([]),
  getAuthStatus: vi.fn().mockResolvedValue({ unlocked_groups: [], has_protected_drives: false }),
  getDriveSummary: vi.fn().mockResolvedValue({ name: "", trash_count: 0, missing_count: 0 }),
}));

vi.mock("@/hooks/useWebSocket", () => ({
  useWebSocket: vi.fn().mockReturnValue(null),
}));

import { getDriveTags } from "@/lib/api";
import type { Tag } from "@/types";

// ---- deferred-fetch harness --------------------------------------------------

type Deferred = { resolve: (tags: Tag[]) => void; promise: Promise<Tag[]> };

/**
 * Queue one deferred response per (drive, folderPath) pair so a test can
 * hold a fetch open, assert what is on screen meanwhile, then release it.
 */
function makeDeferredTags() {
  const pending = new Map<string, Deferred>();
  const key = (drive: string, folderPath: string | null) => `${drive}::${folderPath ?? "<root>"}`;

  vi.mocked(getDriveTags).mockImplementation((drive: string, folderPath?: string | null) => {
    const k = key(drive, folderPath ?? null);
    let resolve!: (tags: Tag[]) => void;
    const promise = new Promise<Tag[]>((r) => {
      resolve = r;
    });
    pending.set(k, { resolve, promise });
    return promise;
  });

  return {
    async settle(drive: string, folderPath: string | null, tags: Tag[]) {
      const k = key(drive, folderPath);
      const deferred = pending.get(k);
      if (!deferred) throw new Error(`no pending getDriveTags for ${k}`);
      await act(async () => {
        deferred.resolve(tags);
        await deferred.promise;
      });
    },
  };
}

// ---- component under test ----------------------------------------------------

function TagsUnderNavigation({
  drive,
  folderPath,
}: {
  drive: string | null;
  folderPath: string | null;
}) {
  const { tags } = useSidebarData(drive, folderPath, 0);
  return (
    <SidebarTagsSection
      drive={drive}
      currentFolderPath={folderPath}
      tags={tags}
      linkClass={() => ""}
      close={vi.fn()}
    />
  );
}

function hrefs(): string[] {
  return screen.getAllByRole("link").map((a) => a.getAttribute("href") ?? "");
}

// ---- tests -------------------------------------------------------------------

describe("sidebar tags — scope agreement across navigations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.clear();
  });

  it("null → folder: drive-wide links first, then folder-scoped links", async () => {
    // Mirrors opening a folder URL directly. currentFolderPath is null
    // until the folder page publishes it, and the drive-wide answer is the
    // agreed one during that moment — which is exactly what Litloft does
    // today, so the links stay live (§9.2).
    const deferred = makeDeferredTags();
    const { rerender } = render(<TagsUnderNavigation drive="main" folderPath={null} />);

    await deferred.settle("main", null, [{ name: "soup", count: 7 }]);
    expect(hrefs()).toEqual(["/drive/main?tag=soup"]);

    rerender(<TagsUnderNavigation drive="main" folderPath="recipes" />);

    // In flight: the drive-wide rows are still on screen, and must not be
    // clickable now that they describe a scope we have left.
    expect(screen.getByText("soup")).toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);

    await deferred.settle("main", "recipes", [{ name: "soup", count: 3 }]);
    expect(hrefs()).toEqual(["/drive/main/recipes?tag=soup"]);
  });

  it("folder A → folder B: A's rows never become clickable with B's links", async () => {
    const deferred = makeDeferredTags();
    const { rerender } = render(<TagsUnderNavigation drive="main" folderPath="recipes" />);

    await deferred.settle("main", "recipes", [{ name: "soup", count: 3 }]);
    expect(hrefs()).toEqual(["/drive/main/recipes?tag=soup"]);

    rerender(<TagsUnderNavigation drive="main" folderPath="dev" />);

    expect(screen.getByText("soup")).toBeInTheDocument();
    // The bug this design removes: "soup" rendered with a /dev href.
    expect(screen.queryAllByRole("link")).toHaveLength(0);

    await deferred.settle("main", "dev", [{ name: "rust", count: 4 }]);
    expect(hrefs()).toEqual(["/drive/main/dev?tag=rust"]);
    expect(screen.queryByText("soup")).not.toBeInTheDocument();
  });

  it("folder → root: same guarantee in the widening direction", async () => {
    const deferred = makeDeferredTags();
    const { rerender } = render(<TagsUnderNavigation drive="main" folderPath="recipes" />);

    await deferred.settle("main", "recipes", [{ name: "soup", count: 3 }]);
    rerender(<TagsUnderNavigation drive="main" folderPath={null} />);

    expect(screen.queryAllByRole("link")).toHaveLength(0);

    await deferred.settle("main", null, [{ name: "soup", count: 7 }]);
    expect(hrefs()).toEqual(["/drive/main?tag=soup"]);
  });

  it("drive A → drive B: A's tags never render as links under B", async () => {
    // Both scopes have folderPath === null, so a folder-only comparison
    // would pass here. Drive is a security boundary
    // (hako cRNeIvcbhz449BwTmof5m) — a tag-shaped leak across drives is
    // precisely what that principle exists to prevent.
    const deferred = makeDeferredTags();
    const { rerender } = render(<TagsUnderNavigation drive="work" folderPath={null} />);

    await deferred.settle("work", null, [{ name: "confidential", count: 2 }]);
    expect(hrefs()).toEqual(["/drive/work?tag=confidential"]);

    rerender(<TagsUnderNavigation drive="personal" folderPath={null} />);

    expect(screen.queryAllByRole("link")).toHaveLength(0);

    await deferred.settle("personal", null, [{ name: "holiday", count: 1 }]);
    expect(hrefs()).toEqual(["/drive/personal?tag=holiday"]);
  });

  it("a failed fetch leaves the rows recoverable, not stranded", async () => {
    // §5.0: the catch records the scope it was fetching for. If it left
    // the previous value in place, nothing would ever match again and the
    // old rows would stay inert forever.
    vi.mocked(getDriveTags).mockResolvedValueOnce([{ name: "soup", count: 3 }]);
    const { rerender } = render(<TagsUnderNavigation drive="main" folderPath="recipes" />);
    await waitFor(() => {
      expect(hrefs()).toEqual(["/drive/main/recipes?tag=soup"]);
    });

    vi.mocked(getDriveTags).mockRejectedValueOnce(new Error("network"));
    rerender(<TagsUnderNavigation drive="main" folderPath="dev" />);
    await waitFor(() => {
      expect(screen.queryByText("soup")).not.toBeInTheDocument();
    });

    // A later successful fetch for the same scope renders live links again.
    vi.mocked(getDriveTags).mockResolvedValueOnce([{ name: "rust", count: 4 }]);
    rerender(<TagsUnderNavigation drive="main" folderPath="dev/rust" />);
    await waitFor(() => {
      expect(hrefs()).toEqual(["/drive/main/dev/rust?tag=rust"]);
    });
  });
});
