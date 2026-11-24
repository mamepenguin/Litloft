import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  getTrash: vi.fn(),
  emptyTrash: vi.fn(),
  purgeFile: vi.fn(),
  restoreFile: vi.fn(),
  batchRestore: vi.fn(),
  batchPurge: vi.fn(),
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  ...apiMocks,
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/drive/main",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/SelectionBar", () => ({
  SelectionBar: (p: {
    selectedIds: Set<string>;
    onSelectOnly?: (ids: string[]) => void;
    onProcessed?: (ids: string[]) => void;
  }) => (
    <div data-testid="selection-bar" data-selected={Array.from(p.selectedIds).join(",")}>
      <button onClick={() => p.onSelectOnly?.(["b", "c"])}>select b c</button>
      <button onClick={() => p.onSelectOnly?.(["b"])}>select b</button>
      <button onClick={() => p.onProcessed?.(["a"])}>processed a</button>
    </div>
  ),
}));
vi.mock("@/components/trash/TrashToolbar", () => ({
  TrashToolbar: ({ onToggleSelectable }: { onToggleSelectable: () => void }) => (
    <button onClick={() => onToggleSelectable()}>selection mode</button>
  ),
}));

vi.stubGlobal(
  "IntersectionObserver",
  class {
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
    constructor(_cb: IntersectionObserverCallback) {}
  },
);

import { TrashView } from "../trash/TrashView";

function trashFile(id: string) {
  return {
    id,
    filename: `${id}.mp4`,
    title: `Trash ${id}`,
    description: "",
    drive: "main",
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 1024,
    duration: 120,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: "2026-11-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

async function renderTrash() {
  render(<TrashView driveName="main" />);
  await screen.findByText("Trash a");
  fireEvent.click(screen.getByRole("button", { name: "selection mode" }));
}

describe("SPEC-CORE-120 I21: the trash view holds the ids a batch run could not process", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getTrash.mockResolvedValue({
      data: [trashFile("a"), trashFile("b"), trashFile("c")],
      meta: { total: 3, page: 1, limit: 30 },
    });
  });

  it("I21 [SPEC-CORE-120] onSelectOnly replaces the selection with exactly the ids passed", async () => {
    await renderTrash();

    fireEvent.click(screen.getByRole("button", { name: "select b c" }));
    expect(screen.getByTestId("selection-bar")).toHaveAttribute("data-selected", "b,c");

    fireEvent.click(screen.getByRole("button", { name: "select b" }));
    expect(screen.getByTestId("selection-bar")).toHaveAttribute("data-selected", "b");
  });

  it("I21 [SPEC-CORE-120] onProcessed removes the processed rows from the listing", async () => {
    await renderTrash();

    fireEvent.click(screen.getByRole("button", { name: "processed a" }));

    await waitFor(() => expect(screen.queryByText("Trash a")).not.toBeInTheDocument());
    expect(screen.getByText("Trash b")).toBeInTheDocument();
    expect(screen.getByText("Trash c")).toBeInTheDocument();
  });
});
