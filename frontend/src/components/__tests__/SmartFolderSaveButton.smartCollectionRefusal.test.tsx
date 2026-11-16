import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

import type { SmartFolder } from "@/types/smartFolder";
import type { CollectionSummary } from "@/types";
import {
  SmartFolderController,
  SmartFolderMenuItems,
} from "../SmartFolderSaveButton";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const createMock = vi.fn();
const updateMock = vi.fn();
let hookSmartFolders: SmartFolder[] = [];
vi.mock("@/hooks/useSmartFolders", () => ({
  useSmartFolders: () => ({
    smartFolders: hookSmartFolders,
    loading: false,
    error: null,
    refetch: vi.fn(),
    create: createMock,
    update: updateMock,
    remove: vi.fn(),
  }),
}));

const getCollections = vi.fn();
const getSmartFolders = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getCollections: (...args: unknown[]) => getCollections(...args),
  getSmartFolders: (...args: unknown[]) => getSmartFolders(...args),
}));

vi.mock("../SmartFolderSaveDialog", () => ({
  SmartFolderSaveDialog: ({
    open,
    mode,
    onSubmit,
  }: {
    open: boolean;
    mode?: string;
    onSubmit: (name: string) => void;
  }) =>
    open ? (
      <div data-testid={`save-dialog-${mode ?? "save"}`}>
        <button data-testid="dialog-submit" onClick={() => onSubmit("my folder")}>
          submit
        </button>
      </div>
    ) : null,
}));

const REFUSED = "A search that includes a Smart Collection cannot be saved.";
const SAVE_FAILED = "Failed to save Smart Collection";
const UPDATE_FAILED = "Failed to update Smart Collection";

function smart(id: string, name: string, query = "foo"): SmartFolder {
  return {
    id,
    drive: "main",
    name,
    query,
    file_type: null,
    sort_by: null,
    sort_order: null,
    created_at: "2026-05-01T00:00:00Z",
    updated_at: null,
  };
}

function collection(id: string, name: string): CollectionSummary {
  return {
    id,
    name,
    description: null,
    drive: "main",
    item_count: 1,
    first_file_id: null,
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
  };
}

const EDITED = smart("sf1", "Edited", "old");
const WEEKLY = smart("sf2", "Weekly", "weekly stuff");

function menu(query: string, smartFolderId: string | null = null) {
  render(
    <SmartFolderController
      drive="main"
      query={query}
      typeFilter={null}
      smartFolderId={smartFolderId}
    >
      <div role="menu">
        <SmartFolderMenuItems closeMenu={vi.fn()} />
      </div>
    </SmartFolderController>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  createMock.mockReset();
  updateMock.mockReset();
  getCollections.mockReset();
  getSmartFolders.mockReset();
  // The hook's own list holds a stale view: Weekly is not in it. The refusal
  // must come from lists loaded at the press.
  hookSmartFolders = [EDITED];
  getCollections.mockResolvedValue([collection("c1", "Trip")]);
  getSmartFolders.mockResolvedValue([EDITED, WEEKLY]);
});

describe("SPEC-CORE-116 step 7 / I7: Save refuses a query whose in: names a Smart Collection", () => {
  it.each([
    ["exact case", 'cats in:"Weekly"'],
    ["other case", "cats in:weekly"],
    ["alongside a collection", 'cats in:"Trip" in:"Weekly"'],
  ])("refuses (%s): no dialog, nothing written, the refusal toast", async (_label, query) => {
    menu(query);

    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Save as Smart Collection" }));
    });

    expect(await screen.findByText(REFUSED)).toBeInTheDocument();
    expect(screen.queryByTestId("save-dialog-save")).toBeNull();
    expect(createMock).not.toHaveBeenCalled();
    expect(getSmartFolders).toHaveBeenCalledWith("main");
  });

  it("saves when the name equals a collection, the collection winning over a Smart Collection of the same name", async () => {
    getSmartFolders.mockResolvedValue([EDITED, smart("sf3", "Trip")]);
    createMock.mockResolvedValueOnce({ ...EDITED, id: "new-id" });
    menu('cats in:"trip"');

    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Save as Smart Collection" }));
    });
    expect(getCollections).toHaveBeenCalledWith("main");
    fireEvent.click(await screen.findByTestId("dialog-submit"));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(REFUSED)).toBeNull();
  });

  it("saves when the name equals neither kind", async () => {
    createMock.mockResolvedValueOnce({ ...EDITED, id: "new-id" });
    menu('cats in:"Nowhere"');

    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Save as Smart Collection" }));
    });
    expect(getCollections).toHaveBeenCalledWith("main");
    fireEvent.click(await screen.findByTestId("dialog-submit"));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
  });

  it.each([
    ["the collection list", () => getCollections.mockRejectedValue(new Error("offline"))],
    ["the Smart Collection list", () => getSmartFolders.mockRejectedValue(new Error("offline"))],
  ])("a failure to load %s writes nothing and shows the save-failed toast", async (_label, fail) => {
    fail();
    menu('cats in:"Weekly"');

    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Save as Smart Collection" }));
    });

    expect(await screen.findByText(SAVE_FAILED)).toBeInTheDocument();
    expect(screen.queryByTestId("save-dialog-save")).toBeNull();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("a second press while the lists load does nothing", async () => {
    const pending = deferred<CollectionSummary[]>();
    getCollections.mockReturnValue(pending.promise);
    menu('cats in:"Weekly"');

    const row = screen.getByRole("menuitem", { name: "Save as Smart Collection" });
    fireEvent.click(row);
    fireEvent.click(row);
    await act(async () => {
      pending.resolve([collection("c1", "Trip")]);
    });

    expect(await screen.findByText(REFUSED)).toBeInTheDocument();
    expect(getCollections).toHaveBeenCalledTimes(1);
  });
});

describe("SPEC-CORE-116 step 7 / I7, SPEC-CORE-103 I3 revised: Overwrite refuses the same way", () => {
  it("sends no PATCH and shows the refusal toast", async () => {
    hookSmartFolders = [EDITED];
    menu('cats in:"Weekly"', "sf1");

    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Overwrite" }));
    });

    expect(await screen.findByText(REFUSED)).toBeInTheDocument();
    expect(updateMock).not.toHaveBeenCalled();
    expect(getSmartFolders).toHaveBeenCalledWith("main");
  });

  it("sends the one PATCH when the name is a collection", async () => {
    updateMock.mockResolvedValueOnce({ ...EDITED, query: 'cats in:"Trip"' });
    menu('cats in:"Trip"', "sf1");

    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Overwrite" }));
    });

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    expect(updateMock.mock.calls[0]).toEqual(["sf1", { query: 'cats in:"Trip"', file_type: null }]);
    expect(getCollections).toHaveBeenCalledWith("main");
  });

  it("a list that fails to load sends no PATCH and shows the update-failed toast", async () => {
    getCollections.mockRejectedValue(new Error("offline"));
    menu('cats in:"Trip"', "sf1");

    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Overwrite" }));
    });

    expect(await screen.findByText(UPDATE_FAILED)).toBeInTheDocument();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("a second press while the lists load sends one PATCH at most", async () => {
    const pending = deferred<CollectionSummary[]>();
    getCollections.mockReturnValue(pending.promise);
    updateMock.mockResolvedValue({ ...EDITED, query: 'cats in:"Trip"' });
    menu('cats in:"Trip"', "sf1");

    const row = screen.getByRole("menuitem", { name: "Overwrite" });
    fireEvent.click(row);
    expect(row).toBeDisabled();
    fireEvent.click(row);
    await act(async () => {
      pending.resolve([collection("c1", "Trip")]);
    });

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    expect(getCollections).toHaveBeenCalledTimes(1);
  });
});
