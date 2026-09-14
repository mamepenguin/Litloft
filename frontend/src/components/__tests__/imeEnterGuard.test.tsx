import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";

import { confirmConversionThenEnter } from "@/__tests__/helpers/imeEnter";

const apiMocks = vi.hoisted(() => ({
  getCollections: vi.fn(),
  createCollection: vi.fn(),
  addCollectionItems: vi.fn(),
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  ...apiMocks,
}));

const setNickname = vi.hoisted(() => vi.fn());
vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => ({ nickname: null, setNickname, clearNickname: vi.fn() }),
}));

vi.mock("@/components/AddonSlot", () => ({ AddonSlot: () => null }));
vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({ hasSlot: () => false }),
}));

import { CollectionPicker } from "../CollectionPicker";
import { SmartFolderSaveDialog } from "../SmartFolderSaveDialog";
import { FolderToolbar } from "../folder/FolderToolbar";
import { ProfileSection } from "../settings/ProfileSection";
import { SidebarCollectionsSection } from "../sidebar/SidebarCollectionsSection";

interface Field {
  name: string;
  /** Renders the component with its field showing; returns the field and a count of the field's action. */
  mount: () => Promise<{ input: HTMLElement; acted: () => number }>;
  /**
   * For a field inside a `<form>`: jsdom performs no implicit submission, so
   * the Enter keydown's default being prevented is what stands for "did not act".
   */
  viaDefaultPrevented?: boolean;
}

function mountSidebar(props: Record<string, unknown>) {
  const handleCreateCollection = vi.fn();
  const handleRenameCollection = vi.fn();
  render(
    <SidebarCollectionsSection
      currentDrive="main"
      driveBase="/drive/main"
      collectionList={[
        {
          id: "c1",
          name: "Rock",
          description: null,
          drive: "main",
          item_count: 1,
          first_file_id: null,
          created_at: "",
          updated_at: "",
        },
      ]}
      setCollectionList={vi.fn()}
      creatingCollection={false}
      setCreatingCollection={vi.fn()}
      newCollectionName=""
      setNewCollectionName={vi.fn()}
      renamingId={null}
      setRenamingId={vi.fn()}
      renameValue=""
      setRenameValue={vi.fn()}
      contextMenu={null}
      setContextMenu={vi.fn()}
      createInputRef={createRef<HTMLInputElement>()}
      renameInputRef={createRef<HTMLInputElement>()}
      handleCreateCollection={handleCreateCollection}
      handleRenameCollection={handleRenameCollection}
      handleDeleteCollection={vi.fn()}
      handleCollectionClick={vi.fn()}
      {...props}
    />,
  );
  return { handleCreateCollection, handleRenameCollection };
}

const FIELDS: Field[] = [
  {
    name: "CollectionPicker new collection name",
    mount: async () => {
      render(<CollectionPicker open drive="main" fileIds={["f1"]} onClose={vi.fn()} />);
      await waitFor(() => expect(apiMocks.getCollections).toHaveBeenCalled());
      fireEvent.click(screen.getByText("New collection"));
      const input = screen.getByPlaceholderText("New collection name...");
      return { input, acted: () => apiMocks.createCollection.mock.calls.length };
    },
  },
  {
    name: "ProfileSection nickname",
    mount: async () => {
      render(<ProfileSection />);
      const input = screen.getByPlaceholderText("Enter your name");
      return { input, acted: () => setNickname.mock.calls.length };
    },
  },
  {
    name: "FolderToolbar new folder name",
    mount: async () => {
      const onCreateFolder = vi.fn();
      render(
        <FolderToolbar
          isSpecialView={false}
          isWriteDestination
          tagFilter={null}
          hasPlayableFiles={false}
          sort="created_at"
          order="desc"
          typeFilter={null}
          total={1}
          selectable={false}
          scanning={false}
          creatingFolder
          newFolderName=""
          folderError={null}
          fileIds={[]}
          drive="main"
          onSortChange={vi.fn()}
          onTypeFilterChange={vi.fn()}
          onViewChange={vi.fn()}
          onToggleSelectable={vi.fn()}
          onScan={vi.fn()}
          onPlayAll={vi.fn()}
          onSetCreatingFolder={vi.fn()}
          onSetNewFolderName={vi.fn()}
          onSetFolderError={vi.fn()}
          onCreateFolder={onCreateFolder}
        />,
      );
      const input = screen.getAllByPlaceholderText("Folder name...")[0];
      return { input, acted: () => onCreateFolder.mock.calls.length };
    },
  },
  {
    name: "SidebarCollectionsSection new collection name",
    mount: async () => {
      const { handleCreateCollection } = mountSidebar({ creatingCollection: true });
      const input = screen.getByPlaceholderText("Collection name...");
      return { input, acted: () => handleCreateCollection.mock.calls.length };
    },
  },
  {
    name: "SidebarCollectionsSection rename",
    mount: async () => {
      const { handleRenameCollection } = mountSidebar({ renamingId: "c1", renameValue: "Rock" });
      const input = screen.getByDisplayValue("Rock");
      return { input, acted: () => handleRenameCollection.mock.calls.length };
    },
  },
  {
    name: "SmartFolderSaveDialog name",
    viaDefaultPrevented: true,
    mount: async () => {
      render(<SmartFolderSaveDialog open onSubmit={vi.fn()} onCancel={vi.fn()} />);
      const input = screen.getByRole("textbox");
      return { input, acted: () => 0 };
    },
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.getCollections.mockResolvedValue([]);
  apiMocks.createCollection.mockResolvedValue({ id: "c9", name: "x" });
  apiMocks.addCollectionItems.mockResolvedValue(undefined);
});

describe("IME-confirming Enter in text fields", () => {
  it("covers the declared fields", () => {
    expect(FIELDS.length).toBe(6);
  });

  describe.each(FIELDS)("$name", (field) => {
    it("does not act on the Enter that confirms a conversion", async () => {
      const { input, acted } = await field.mount();
      const notPrevented = confirmConversionThenEnter(input, "日本語");
      await act(async () => {});
      if (field.viaDefaultPrevented) expect(notPrevented).toBe(false);
      expect(acted()).toBe(0);
    });

    it("acts once on an Enter pressed after the grace window", async () => {
      const { input, acted } = await field.mount();
      const notPrevented = confirmConversionThenEnter(input, "日本語", { afterGrace: true });
      await act(async () => {});
      if (field.viaDefaultPrevented) expect(notPrevented).toBe(true);
      else expect(acted()).toBe(1);
    });
  });
});
