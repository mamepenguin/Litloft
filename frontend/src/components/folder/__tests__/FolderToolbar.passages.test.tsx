import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { FolderToolbar, type FolderToolbarSearch } from "../FolderToolbar";

vi.mock("@/components/AddonSlot", () => ({ AddonSlot: () => null }));
vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({ hasSlot: () => true }),
}));
vi.mock("@/components/SmartFolderSaveButton", () => ({
  SmartFolderMenuItems: () => null,
}));

const search: FolderToolbarSearch = {
  passagesApplicable: true,
  show: "passages",
  onShowChange: vi.fn(),
  showSceneSearch: true,
  sceneSearch: false,
  onSceneSearchChange: vi.fn(),
  countLabel: "5 items",
  passageCountLabel: "2 files · 7 passages",
  passageCountShort: "7 passages",
  query: "cats",
  smartFolderId: null,
  showFind: true,
  onSelect: vi.fn(),
  hideArranging: false,
};

const base = {
  isSpecialView: false,
  isWriteDestination: false,
  isSearch: true,
  search,
  tagFilter: null,
  hasPlayableFiles: true,
  sort: "relevance" as const,
  order: "desc" as const,
  typeFilter: null,
  total: 5,
  selectable: false,
  scanning: false,
  creatingFolder: false,
  newFolderName: "",
  folderError: null,
  fileIds: [] as string[],
  drive: "main",
  onSortChange: vi.fn(),
  onTypeFilterChange: vi.fn(),
  onViewChange: vi.fn(),
  onToggleSelectable: vi.fn(),
  onScan: vi.fn(),
  onPlayAll: vi.fn(),
  onSetCreatingFolder: vi.fn(),
  onSetNewFolderName: vi.fn(),
  onSetFolderError: vi.fn(),
  onCreateFolder: vi.fn(),
};

const names = () =>
  screen.queryAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent);

describe("SPEC-CORE-040 I17 what the toolbar drops in Passages", () => {
  const hidden = [
    ["sort", /^Sort/],
    ["view mode", /^View/],
    ["the type filter", /^Filter/],
  ] as const;

  it.each(hidden)("hides %s", (_name, pattern) => {
    render(<FolderToolbar {...base} isPassages search={{ ...search, show: "passages" }} />);

    expect(
      screen.queryByRole("button", { name: pattern }),
      `${String(pattern)} is still on the bar`,
    ).toBeNull();
  });

  it("keeps the view switch, Scene search, the count and …", () => {
    render(<FolderToolbar {...base} isPassages />);

    expect(screen.getByRole("group", { name: "Show" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Scene/ })).toBeInTheDocument();
    expect(screen.getByText("2 files · 7 passages")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^More actions$/ })).toBeInTheDocument();
  });

  it("offers no select mode", () => {
    render(<FolderToolbar {...base} isPassages selectable />);

    expect(names().some((n) => n === "Selection mode")).toBe(false);
  });

  it("offers all of them again in Files", () => {
    render(<FolderToolbar {...base} search={{ ...search, show: "files" }} />);

    expect(screen.getByRole("button", { name: /^Sort/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^View/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^More actions$/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Filter/ })).toBeNull();
  });
});
