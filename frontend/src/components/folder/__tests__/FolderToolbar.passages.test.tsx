import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { FolderToolbar } from "../FolderToolbar";

vi.mock("@/components/AddonSlot", () => ({ AddonSlot: () => null }));
vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({ hasSlot: () => true }),
}));

const base = {
  isSpecialView: false,
  isWriteDestination: false,
  isSearch: true,
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
    ["the … menu", /^More actions$/],
  ] as const;

  it.each(hidden)("hides %s", (_name, pattern) => {
    render(<FolderToolbar {...base} isPassages />);

    expect(
      screen.queryByRole("button", { name: pattern }),
      `${String(pattern)} is still on the bar`,
    ).toBeNull();
  });

  it("keeps the type filter", () => {
    render(<FolderToolbar {...base} isPassages />);

    expect(screen.getByRole("button", { name: /^Filter/ })).toBeInTheDocument();
  });

  it("offers no select mode", () => {
    render(<FolderToolbar {...base} isPassages selectable />);

    expect(names().some((n) => n === "Select")).toBe(false);
    expect(screen.queryByRole("button", { name: /^More actions$/ })).toBeNull();
  });

  it("offers all of them again in Files", () => {
    render(<FolderToolbar {...base} />);

    expect(screen.getByRole("button", { name: /^Sort/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^View/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^More actions$/ })).toBeInTheDocument();
  });
});
