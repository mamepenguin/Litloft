import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * The create-and-add button.
 *
 * It had no test at all, which the Phase 3 button sweep made expensive:
 * deleting its `onClick` left 4314 tests green, and the user-visible result is
 * a Create button that does nothing at all. A sweep that edits the line above
 * a handler needs something watching the handler.
 */

const apiMocks = vi.hoisted(() => ({
  getCollections: vi.fn(),
  createCollection: vi.fn(),
  addCollectionItems: vi.fn(),
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  ...apiMocks,
}));

import { CollectionPicker } from "../CollectionPicker";

function open() {
  return render(
    <CollectionPicker open drive="main" fileIds={["f1"]} onClose={vi.fn()} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.getCollections.mockResolvedValue([]);
  apiMocks.createCollection.mockResolvedValue({ id: "c9", name: "Reading" });
  apiMocks.addCollectionItems.mockResolvedValue(undefined);
});

async function startCreating() {
  open();
  await waitFor(() => expect(apiMocks.getCollections).toHaveBeenCalled());
  fireEvent.click(screen.getByText("New collection"));
  return screen.getByPlaceholderText("New collection name...") as HTMLInputElement;
}

describe("CollectionPicker create-and-add", () => {
  it("creates the collection and adds the files", async () => {
    const input = await startCreating();
    fireEvent.change(input, { target: { value: "Reading" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(apiMocks.createCollection).toHaveBeenCalledWith("main", "Reading"),
    );
    await waitFor(() =>
      expect(apiMocks.addCollectionItems).toHaveBeenCalledWith("main", "c9", ["f1"]),
    );
  });

  // The same handler is reachable two ways, and the sweep touched only one of
  // them. A test that pressed Enter would pass with the button inert.
  it("creates on Enter as well as on the button", async () => {
    const input = await startCreating();
    fireEvent.change(input, { target: { value: "Reading" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(apiMocks.createCollection).toHaveBeenCalledWith("main", "Reading"),
    );
  });

  it("stays disabled while the name is empty", async () => {
    const input = await startCreating();
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
    fireEvent.change(input, { target: { value: "Reading" } });
    expect(screen.getByRole("button", { name: "Create" })).not.toBeDisabled();
  });

  it("does not call the API when pressed with a blank name", async () => {
    await startCreating();
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(apiMocks.createCollection).not.toHaveBeenCalled();
  });
});
