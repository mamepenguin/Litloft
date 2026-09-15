import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { FileItem } from "@/types";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/drive/main",
  useSearchParams: () => new URLSearchParams(),
}));

const apiMocks = vi.hoisted(() => ({
  getTrash: vi.fn(),
  getMissing: vi.fn(),
  emptyTrash: vi.fn(),
  purgeFile: vi.fn(),
  restoreFile: vi.fn(),
  purgeAllMissing: vi.fn(),
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  ...apiMocks,
}));

// Installed here, not left to another file in the same worker: CI shards
// differently.
vi.stubGlobal(
  "IntersectionObserver",
  class {
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
    // Never reports an intersection: these tests assert on the header, and a
    // sentinel that fires would pull the next page and change the count under
    // them.
    constructor(_cb: IntersectionObserverCallback) {}
  },
);

vi.mock("@/components/TreeToggle", () => ({
  TreeToggle: () => <button data-testid="tree-toggle">tree</button>,
}));

function file(id: string): FileItem {
  return {
    id,
    filename: `${id}.mp4`,
    title: id,
    file_path: `${id}.mp4`,
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    file_size: 100,
    duration: 10,
    drive: "main",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  } as unknown as FileItem;
}

import { TrashView } from "../trash/TrashView";
import { MissingView } from "../missing/MissingView";
import { accentFills } from "@/__tests__/helpers/accentFills";

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.getTrash.mockResolvedValue({ data: [file("a"), file("b")], meta: { total: 2 } });
  apiMocks.getMissing.mockResolvedValue({ data: [file("a"), file("b")], meta: { total: 2 } });
});

describe("the frame", () => {
  it.each([
    ["Trash", () => <TrashView driveName="main" />],
    ["Missing", () => <MissingView driveName="main" />],
  ])("%s wears a full-width frame", async (_name, view) => {
    render(view());
    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading.closest("header")!.parentElement?.getAttribute("data-page-frame")).toBe("full");
  });
});

describe("Trash header", () => {
  it("offers a way back to the drive", async () => {
    render(<TrashView driveName="main" />);
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "main" }).getAttribute("href")).toBe(
        "/drive/main",
      ),
    );
  });

  it("names itself in a heading, not in the trail", async () => {
    render(<TrashView driveName="main" />);
    expect(
      await screen.findByRole("heading", { level: 1, name: /Trash/ }),
    ).toBeInTheDocument();
    // One mention only: the trail stops at the drive.
    expect(screen.getAllByText(/^Trash$/)).toHaveLength(1);
  });

  // Scoped to the heading's own row: the "Empty Trash" button uses the same
  // glyph.
  it("shows the title icon beside the heading, not only inside a button", async () => {
    render(<TrashView driveName="main" />);
    const heading = await screen.findByRole("heading", { level: 1 });
    const titleRow = heading.closest("div")!.parentElement!;
    const icons = [...titleRow.children].flatMap((el) =>
      [...el.children].filter((c) => c.tagName.toLowerCase() === "svg" && !c.closest("button")),
    );
    expect(icons).toHaveLength(1);
  });

  it("offers Empty trash only when there is something in it", async () => {
    const { unmount } = render(<TrashView driveName="main" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Empty Trash/i })).toBeInTheDocument(),
    );
    unmount();

    apiMocks.getTrash.mockResolvedValue({ data: [], meta: { total: 0 } });
    render(<TrashView driveName="main" />);
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("button", { name: /Empty Trash/i })).toBeNull();
  });
});

describe("Missing header", () => {
  it("offers a way back to the drive", async () => {
    render(<MissingView driveName="main" />);
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "main" }).getAttribute("href")).toBe(
        "/drive/main",
      ),
    );
  });

  it("names itself in a heading, with its icon", async () => {
    const { container } = render(<MissingView driveName="main" />);
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(container.querySelector("svg.lucide-triangle-alert")).not.toBeNull();
  });

  it("keeps the description on the scope line", async () => {
    render(<MissingView driveName="main" />);
    await screen.findByRole("heading", { level: 1 });
    const header = document.querySelector("header")!;
    expect(header.textContent).toContain("not found on disk");
  });

  it("keeps the count, and only while there is something to count", async () => {
    const { unmount } = render(<MissingView driveName="main" />);
    await waitFor(() => expect(screen.getByText(/2 items/)).toBeInTheDocument());
    unmount();

    apiMocks.getMissing.mockResolvedValue({ data: [], meta: { total: 0 } });
    render(<MissingView driveName="main" />);
    await screen.findByRole("heading", { level: 1 });
    const header = document.querySelector("header")!;
    expect(header.textContent).not.toMatch(/\d+ items/);
  });

  // A fixture where the page and the total differ: with a page equal to the
  // total, `files.length` and `total` agree and the swap is invisible.
  it("counts everything missing, not the page that has loaded", async () => {
    apiMocks.getMissing.mockResolvedValue({
      data: [file("a"), file("b")],
      meta: { total: 500 },
    });
    render(<MissingView driveName="main" />);
    await screen.findByRole("heading", { level: 1 });
    // Asserted on the header's text, not with `findByText`: the count sits in
    // the same element as the description, so the query has no node of its own
    // to match.
    await waitFor(() => {
      const header = document.querySelector("header")!;
      expect(header.textContent).toMatch(/500 items/);
      expect(header.textContent).not.toMatch(/\b2 items/);
    });
  });

  it("keeps the view toggle, in the header's actions", async () => {
    render(<MissingView driveName="main" />);
    await waitFor(() =>
      expect(screen.getByLabelText("Grid view")).toBeInTheDocument(),
    );
    const header = document.querySelector("header")!;
    expect(header.contains(screen.getByLabelText("Grid view"))).toBe(true);
  });

  it("offers Purge all only when there is something to purge", async () => {
    apiMocks.getMissing.mockResolvedValue({ data: [], meta: { total: 0 } });
    render(<MissingView driveName="main" />);
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("button", { name: /Permanently Delete All/i })).toBeNull();
  });
});

describe("Trash and Missing spend no accent fill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("holds none in the trash", async () => {
    const { container } = render(<TrashView driveName="main" />);
    await waitFor(() => expect(container.querySelector("h1")).toBeTruthy());
    expect(accentFills(container)).toHaveLength(0);
  });

  it("holds none in missing", async () => {
    const { container } = render(<MissingView driveName="main" />);
    await waitFor(() => expect(container.querySelector("h1")).toBeTruthy());
    expect(accentFills(container)).toHaveLength(0);
  });
});
