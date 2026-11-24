/**
 * SPEC-CORE-172 sending 2, I9: saving or overwriting a Smart Collection whose
 * query has a `-in:` name only a Smart Collection carries writes nothing and
 * shows the refusal toast; a `-in:` naming a collection, or nothing, saves.
 */
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

describe("SPEC-CORE-172 sending 2, I9: Save refuses a -in: naming only a Smart Collection", () => {
  it.each([
    ["exact case", 'cats -in:"Weekly"'],
    ["other case", "cats -in:weekly"],
    ["beside a collection", 'cats in:"Trip" -in:"Weekly"'],
    ["with no free text", '-in:"Weekly"'],
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

  it.each([
    ["a collection's name", 'cats -in:"Trip"'],
    ["a name nothing carries", 'cats -in:"Nowhere"'],
  ])("loads the lists first, then saves %s", async (_label, query) => {
    createMock.mockResolvedValueOnce({ ...EDITED, id: "new-id" });
    menu(query);

    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Save as Smart Collection" }));
    });
    expect(getCollections).toHaveBeenCalledWith("main");
    fireEvent.click(await screen.findByTestId("dialog-submit"));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(REFUSED)).toBeNull();
  });

  it("a failure to load the lists writes nothing and shows the save-failed toast", async () => {
    getCollections.mockRejectedValue(new Error("offline"));
    menu('cats -in:"Trip"');

    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Save as Smart Collection" }));
    });

    expect(await screen.findByText(SAVE_FAILED)).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("SPEC-CORE-172 sending 2, I9: Overwrite refuses the same way", () => {
  it("sends no PATCH and shows the refusal toast", async () => {
    menu('cats -in:"Weekly"', "sf1");

    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Overwrite" }));
    });

    expect(await screen.findByText(REFUSED)).toBeInTheDocument();
    expect(updateMock).not.toHaveBeenCalled();
    expect(getSmartFolders).toHaveBeenCalledWith("main");
  });

  it("loads the lists, then sends the one PATCH for a collection's name", async () => {
    updateMock.mockResolvedValueOnce({ ...EDITED, query: 'cats -in:"Trip"' });
    menu('cats -in:"Trip"', "sf1");

    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Overwrite" }));
    });

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    expect(updateMock.mock.calls[0]).toEqual(["sf1", { query: 'cats -in:"Trip"', file_type: null }]);
    expect(getCollections).toHaveBeenCalledWith("main");
  });
});
