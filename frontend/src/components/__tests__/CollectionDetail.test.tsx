import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

import { CollectionDetail } from "../CollectionDetail";
import { accentFills } from "@/__tests__/helpers/accentFills";
import type { FileItem } from "@/types";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn() }),
}));

const selectFileSpy = vi.fn();
vi.mock("@/hooks/useSelectedFile", () => ({
  useSelectedFile: () => ({
    fileId: null,
    selectFile: selectFileSpy,
    clearFile: vi.fn(),
  }),
}));

const { toastErrorSpy } = vi.hoisted(() => ({
  toastErrorSpy: vi.fn(),
}));
vi.mock("@/components/ToastProvider", () => ({
  useToast: () => ({
    error: toastErrorSpy,
    success: vi.fn(),
    info: vi.fn(),
  }),
}));

const setOverrideDriveSpy = vi.fn();
vi.mock("@/components/CurrentDriveProvider", () => ({
  useSetOverrideDrive: () => setOverrideDriveSpy,
}));

vi.mock("@/lib/api", () => ({
  getCollection: vi.fn(),
  updateCollection: vi.fn().mockResolvedValue({}),
  deleteCollection: vi.fn().mockResolvedValue(undefined),
  reorderCollectionItems: vi.fn().mockResolvedValue({}),
  removeCollectionItem: vi.fn().mockResolvedValue(undefined),
}));

import * as api from "@/lib/api";
const apiMocks = {
  getCollection: vi.mocked(api.getCollection),
  updateCollection: vi.mocked(api.updateCollection),
  deleteCollection: vi.mocked(api.deleteCollection),
  reorderCollectionItems: vi.mocked(api.reorderCollectionItems),
  removeCollectionItem: vi.mocked(api.removeCollectionItem),
};

// FileGrid / FileList both render the title text we assert on; stub them
// for speed and to avoid pulling in their context-menu trees.
vi.mock("@/components/folder/TwoPaneLayout", () => ({
  TwoPaneLayout: ({
    children,
    leftPane,
  }: {
    children: React.ReactNode;
    leftPane?: React.ReactNode;
    drive?: string;
    folderPath?: string;
    leftPaneAriaLabel?: string;
  }) => (
    <>
      <aside data-testid="left-pane">{leftPane}</aside>
      <section data-testid="right-pane">{children}</section>
    </>
  ),
}));

vi.mock("@/components/CollectionItemsPane", () => ({
  CollectionItemsPane: ({ items }: { items: Array<{ id: number }> }) => (
    <div data-testid="items-pane">items:{items.length}</div>
  ),
}));

vi.mock("@/components/TreeToggle", () => ({
  TreeToggle: () => <button data-testid="tree-toggle">tree</button>,
}));

vi.mock("@/components/FileGrid", () => ({
  FileGrid: ({ files }: { files: FileItem[] }) => (
    <div data-testid="file-grid">
      {files.map((f) => (
        <div key={f.id} data-testid="grid-row">
          {f.title}
        </div>
      ))}
    </div>
  ),
}));
vi.mock("@/components/FileList", () => ({
  FileList: ({ files, showOrdinals }: { files: FileItem[]; showOrdinals?: boolean }) => (
    <div data-testid="file-list" data-ordinals={showOrdinals ? "on" : "off"}>
      {files.map((f) => (
        <div key={f.id} data-testid="list-row">
          {f.title}
        </div>
      ))}
    </div>
  ),
}));

function makeFile(
  id: string,
  type: FileItem["file_type"] = "document",
): FileItem {
  return {
    image_width: null,
    image_height: null,
    id,
    filename: `${id}.dat`,
    title: `File ${id}`,
    description: "",
    drive: "main",
    folder_path: "",
    file_type: type,
    mime_type: "application/octet-stream",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 100,
    duration: null,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier: "verified",
    trust_reviewed_at: null,
    created_at: "",
    updated_at: "",
  };
}

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  mockPush.mockClear();
  setOverrideDriveSpy.mockClear();
  toastErrorSpy.mockClear();
  for (const fn of Object.values(apiMocks)) (fn as ReturnType<typeof vi.fn>).mockClear();
  apiMocks.getCollection.mockResolvedValue({
    id: "c1",
    name: "My Collection",
    description: "Hand-picked",
    drive: "main",
    items: [
      { id: 1, position: 0, file: makeFile("a", "document") },
      { id: 2, position: 1, file: makeFile("b", "audio") },
    ],
    created_at: "",
    updated_at: "",
  });
});

describe("CollectionDetail", () => {
  it("renders name + description + item count from the API", async () => {
    render(<CollectionDetail drive="main" collectionId="c1" />);
    expect(await screen.findByRole("heading", { name: "My Collection" })).toBeInTheDocument();
    expect(screen.getByText("Hand-picked")).toBeInTheDocument();
    expect(screen.getByText("2 items")).toBeInTheDocument();
  });

  it("shows the Play button when the collection contains audio/video", async () => {
    render(<CollectionDetail drive="main" collectionId="c1" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument(),
    );
  });

  it("hides the Play button for collections with no media items", async () => {
    apiMocks.getCollection.mockResolvedValueOnce({
      id: "c1",
      name: "Docs Only",
      description: null,
      drive: "main",
      items: [
        { id: 1, position: 0, file: makeFile("doc1", "document") },
      ],
      created_at: "",
      updated_at: "",
    });
    render(<CollectionDetail drive="main" collectionId="c1" />);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Docs Only" }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: "Play" })).toBeNull();
  });

  it("navigates to the playback queue on Play click, starting at the first media item", async () => {
    render(<CollectionDetail drive="main" collectionId="c1" />);
    const play = await screen.findByRole("button", { name: "Play" });
    fireEvent.click(play);
    expect(mockPush).toHaveBeenCalledWith("/files/b?collection=c1");
  });

  it("renders FileGrid by default and switches to FileList via the toggle", async () => {
    render(<CollectionDetail drive="main" collectionId="c1" />);
    await waitFor(() => expect(screen.getByTestId("file-grid")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("List view"));
    expect(screen.getByTestId("file-list")).toBeInTheDocument();
  });

  it("numbers its rows, whichever way the list was reached", async () => {
    // A collection's order *is* the collection — unlike a folder, where
    // the order is a sort the reader picked. So the numbers are not a
    // property of the audio default that put this list on screen; they
    // are asked for unconditionally, and this reaches the list through
    // the toggle to say so.
    render(<CollectionDetail drive="main" collectionId="c1" />);
    await waitFor(() => expect(screen.getByTestId("file-grid")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("List view"));
    expect(screen.getByTestId("file-list")).toHaveAttribute("data-ordinals", "on");
  });

  it("persists a description edit through updateCollection", async () => {
    render(<CollectionDetail drive="main" collectionId="c1" />);
    const desc = await screen.findByText("Hand-picked");
    fireEvent.click(desc);
    const textarea = screen.getByPlaceholderText("Add description...");
    fireEvent.change(textarea, { target: { value: "Updated" } });
    fireEvent.blur(textarea);
    await waitFor(() =>
      expect(apiMocks.updateCollection).toHaveBeenCalledWith("main", "c1", {
        description: "Updated",
      }),
    );
  });

  // The name is click-to-edit, and moving it into PageHeader's <h1> turned the
  // heading itself into the trigger. Nothing covered any of that: blanking the
  // handler, dropping the Escape revert and dropping the blur save all left
  // the suite green.
  describe("the editable name", () => {
    it("opens an input when the heading is clicked", async () => {
      render(<CollectionDetail drive="main" collectionId="c1" />);
      fireEvent.click(await screen.findByRole("button", { name: "My Collection" }));
      expect(screen.getByDisplayValue("My Collection")).toBeInTheDocument();
    });

    it("persists a rename on blur", async () => {
      render(<CollectionDetail drive="main" collectionId="c1" />);
      fireEvent.click(await screen.findByRole("button", { name: "My Collection" }));
      const input = screen.getByDisplayValue("My Collection");
      fireEvent.change(input, { target: { value: "Renamed" } });
      fireEvent.blur(input);
      await waitFor(() =>
        expect(apiMocks.updateCollection).toHaveBeenCalledWith("main", "c1", {
          name: "Renamed",
        }),
      );
    });

    it("reverts on Escape without saving", async () => {
      render(<CollectionDetail drive="main" collectionId="c1" />);
      fireEvent.click(await screen.findByRole("button", { name: "My Collection" }));
      const input = screen.getByDisplayValue("My Collection");
      fireEvent.change(input, { target: { value: "Discarded" } });
      fireEvent.keyDown(input, { key: "Escape" });
      expect(screen.getByRole("button", { name: "My Collection" })).toBeInTheDocument();
      expect(apiMocks.updateCollection).not.toHaveBeenCalled();
    });

    // "Name the subject once": the trail stops at the drive, and the heading
    // carries the name. Adding it back to the trail is the state this
    // migration removed.
    it("names the collection once, in the heading and not the trail", () => {
      render(<CollectionDetail drive="main" collectionId="c1" />);
      return waitFor(() => {
        expect(screen.getAllByText("My Collection")).toHaveLength(1);
        expect(screen.getByRole("link", { name: "main" })).toBeInTheDocument();
      });
    });

    it("keeps the tree toggle at the start of the header", async () => {
      const { container } = render(<CollectionDetail drive="main" collectionId="c1" />);
      await screen.findByRole("button", { name: "My Collection" });
      const firstRow = container.querySelector("header > div")!;
      expect(firstRow.querySelector("[data-testid='tree-toggle']")).not.toBeNull();
    });
  });

  it("mounts CollectionItemsPane in the left pane with all items", async () => {
    render(<CollectionDetail drive="main" collectionId="c1" />);
    expect(await screen.findByTestId("items-pane")).toHaveTextContent(
      "items:2",
    );
  });

  it("renders the not-found state when the API returns an error", async () => {
    apiMocks.getCollection.mockRejectedValueOnce(new Error("404"));
    render(<CollectionDetail drive="main" collectionId="c1" />);
    expect(await screen.findByText("Collection not found")).toBeInTheDocument();
  });

  it("surfaces a toast when description save fails", async () => {
    apiMocks.updateCollection.mockRejectedValueOnce(new Error("500"));
    render(<CollectionDetail drive="main" collectionId="c1" />);
    const desc = await screen.findByText("Hand-picked");
    fireEvent.click(desc);
    const textarea = screen.getByPlaceholderText("Add description...");
    fireEvent.change(textarea, { target: { value: "Updated" } });
    fireEvent.blur(textarea);
    await waitFor(() =>
      expect(toastErrorSpy).toHaveBeenCalledWith("Failed to save description"),
    );
  });

  it("auto-detects list view for a markdown-heavy collection", async () => {
    apiMocks.getCollection.mockResolvedValueOnce({
      id: "c1",
      name: "Notes",
      description: null,
      drive: "main",
      items: [
        {
          id: 1,
          position: 0,
          file: { ...makeFile("a", "document"), mime_type: "text/markdown", filename: "a.md" },
        },
        {
          id: 2,
          position: 1,
          file: { ...makeFile("b", "document"), mime_type: "text/markdown", filename: "b.md" },
        },
      ],
      created_at: "",
      updated_at: "",
    });
    render(<CollectionDetail drive="main" collectionId="c1" />);
    expect(await screen.findByTestId("file-list")).toBeInTheDocument();
    expect(screen.queryByTestId("file-grid")).toBeNull();
  });
});

/**
 * DESIGN.md §2.2: one accent fill per screen.
 *
 * Here rather than in `accent-budget.test.tsx` for the same reason as
 * Trash and Missing — twelve mocks, and a second copy of them would be a
 * second thing to keep in step. `SCREENS` names this file.
 *
 * One, not zero. A collection is a playlist and playing it is what the
 * screen is for, so the fill is spent correctly here — the folder toolbar
 * gives Play a border because *there* the fill belongs to Add, and a
 * collection has nothing to add to. §2.2 asks for one action to own it,
 * not for the same action to own it everywhere.
 */
describe("deleting a collection", () => {
  const openMenu = async () => {
    const trigger = await screen.findByRole("button", {
      name: /More actions for My Collection/,
    });
    fireEvent.click(trigger);
    return trigger;
  };

  it("names itself for the collection it acts on", async () => {
    // An icon-only control repeated across screens needs a name that
    // says which entity it belongs to, not just "More".
    render(<CollectionDetail drive="main" collectionId="c1" />);
    const trigger = await screen.findByRole("button", {
      name: /More actions for My Collection/,
    });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    // Both states. Asserted only after opening, a hard-coded `"true"`
    // would pass — the property is that it reflects the menu, not that
    // it says the word.
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("closes on Escape", async () => {
    // Without this the only ways out of a menu are an outside click and
    // picking a row. Handled on the box rather than on `document`, so it
    // cannot answer a press aimed at whatever is stacked above it.
    render(<CollectionDetail drive="main" collectionId="c1" />);
    await openMenu();
    expect(screen.getByRole("menuitem")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menuitem")).toBeNull();
  });

  it("offers Delete with its name, in danger colour", async () => {
    render(<CollectionDetail drive="main" collectionId="c1" />);
    await openMenu();
    const item = screen.getByRole("menuitem", { name: "Delete collection" });
    expect(item.className).toMatch(/\btext-danger\b/);
  });

  it("offers nothing that already has a path of its own", async () => {
    // Renaming, the description and the order are each reachable
    // already — the title and scope edit in place, the order is the
    // items pane. A second route to one action is 原則 3.
    render(<CollectionDetail drive="main" collectionId="c1" />);
    await openMenu();
    expect(screen.getAllByRole("menuitem")).toHaveLength(1);
  });

  it("still goes through the confirmation, and deletes on confirm", async () => {
    render(<CollectionDetail drive="main" collectionId="c1" />);
    await openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete collection" }));

    // The menu closes behind the choice; the dialog is what answers next.
    expect(screen.queryByRole("menuitem")).toBeNull();
    expect(await screen.findByText("Delete collection?")).toBeInTheDocument();

    // The dialog's confirm carries the same words as the row that
    // opened it, which is what a confirm button should say; the row is
    // gone by now, so the name is unambiguous.
    fireEvent.click(screen.getByRole("button", { name: "Delete collection" }));
    await waitFor(() =>
      expect(apiMocks.deleteCollection).toHaveBeenCalledWith("main", "c1"),
    );
  });
});

describe("an empty collection", () => {
  beforeEach(() => {
    apiMocks.getCollection.mockResolvedValue({
      id: "c1",
      name: "My Collection",
      description: "Hand-picked",
      drive: "main",
      items: [],
      created_at: "",
      updated_at: "",
    });
  });

  it("says what to do about it, and where", async () => {
    // It was a bare `<p>No items</p>` — not an `EmptyState` call site at
    // all, which is why Phase 3's pass over the other ten did not reach
    // it. The one obvious next step is not on this screen.
    render(<CollectionDetail drive="main" collectionId="c1" />);
    expect(
      await screen.findByText("Nothing in this collection yet"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Browse the drive" }),
    ).toHaveAttribute("href", "/drive/main");
  });

  it("still offers Delete — an empty collection is the one you delete", async () => {
    render(<CollectionDetail drive="main" collectionId="c1" />);
    fireEvent.click(
      await screen.findByRole("button", { name: /More actions for My Collection/ }),
    );
    expect(
      screen.getByRole("menuitem", { name: "Delete collection" }),
    ).toBeInTheDocument();
  });
});

describe("a collection spends its accent fill on Play", () => {
  it("spends exactly one, on the thing the screen is for", async () => {
    const { container } = render(
      <CollectionDetail drive="main" collectionId="c1" />,
    );
    await waitFor(() => expect(container.querySelector("h1")).toBeTruthy());
    // By label, not by count: `toHaveLength(1)` would pass just as well if
    // the fill had moved to Delete.
    expect(accentFills(container).map((el) => el.textContent?.trim())).toEqual([
      "Play",
    ]);
  });

  it("spends none when there is nothing to play", async () => {
    apiMocks.getCollection.mockResolvedValueOnce({
      id: "c1",
      name: "My Collection",
      description: "Hand-picked",
      drive: "main",
      items: [],
      created_at: "",
      updated_at: "",
    });
    const { container } = render(
      <CollectionDetail drive="main" collectionId="c1" />,
    );
    await waitFor(() => expect(container.querySelector("h1")).toBeTruthy());
    // Not zero any more, and still one: Play is gone with nothing to
    // play, and the empty state's one call to action takes the budget
    // instead. By label, because "one fill somewhere" would also be true
    // of Play returning beside a collection that holds nothing.
    expect(accentFills(container).map((el) => el.textContent?.trim())).toEqual([
      "Browse the drive",
    ]);
  });

  it("keeps Delete out of the budget, and out of the header's own row", async () => {
    const { container } = render(
      <CollectionDetail drive="main" collectionId="c1" />,
    );
    await waitFor(() => expect(container.querySelector("h1")).toBeTruthy());
    // The destructive control is behind `…` now, so it is neither a fill
    // nor a tap target beside Play.
    expect(
      screen.queryByRole("button", { name: "Delete collection" }),
    ).toBeNull();
    expect(accentFills(container).map((el) => el.textContent?.trim())).toEqual([
      "Play",
    ]);
  });
});
