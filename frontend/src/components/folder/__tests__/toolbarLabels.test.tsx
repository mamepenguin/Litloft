import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { FolderToolbar } from "../FolderToolbar";
import { pressables } from "@/__tests__/helpers/pressable";

vi.mock("@/components/AddonSlot", () => ({ AddonSlot: () => null }));

/**
 * The count is asserted with the *names*, not a number, so a control that
 * loses its word fails here with its own identity in the diff. `SortButton`
 * and `ViewToggle` are deliberately not mocked.
 */
const props = {
  isSpecialView: false,
  isWriteDestination: true,
  tagFilter: null,
  hasPlayableFiles: true,
  sort: "random" as const,
  order: "desc" as const,
  typeFilter: null,
  trustFilter: null,
  total: 42,
  selectable: false,
  scanning: false,
  creatingFolder: false,
  newFolderName: "",
  folderError: null,
  fileIds: ["f1"],
  drive: "d",
  viewMode: "grid" as const,
  onSortChange: vi.fn(),
  onTypeFilterChange: vi.fn(),
  onTrustFilterChange: vi.fn(),
  onViewChange: vi.fn(),
  onToggleSelectable: vi.fn(),
  onScan: vi.fn(),
  onPlayAll: vi.fn(),
  onSetCreatingFolder: vi.fn(),
  onSetNewFolderName: vi.fn(),
  onSetFolderError: vi.fn(),
  onCreateFolder: vi.fn(),
  onCreateFile: vi.fn(),
  onReshuffle: vi.fn(),
};

/** The pressable things with no text a sighted reader gets. */
function wordless(root: HTMLElement): string[] {
  return pressables(root)
    .filter((b) => (b.textContent ?? "").trim() === "")
    .map((b) => b.getAttribute("aria-label") ?? "(no accessible name)");
}

describe("the folder toolbar's wordless controls", () => {
  afterEach(cleanup);

  it("has the overflow and nothing else, at every state that draws a control", () => {
    const { container } = render(<FolderToolbar {...props} />);
    // Rendered twice, once per breakpoint, so the names are deduplicated.
    expect([...new Set(wordless(container))].sort()).toEqual(["More actions"]);
  });

  it.each([
    ["filtering by kind", { typeFilter: "audio" as const }],
    ["filtering by trust", { trustFilter: "verified" as const }],
    ["in list view", { viewMode: "list" as const }],
    ["ordered by size", { sort: "file_size" as const, order: "asc" as const }],
    ["in select mode", { selectable: true }],
    ["searching", { isSearch: true }],
  ])("keeps it to the overflow while %s", (_state, overrides) => {
    const { container } = render(<FolderToolbar {...props} {...overrides} />);
    expect([...new Set(wordless(container))].sort()).toEqual(["More actions"]);
  });

  it("has none of them where the folder is empty but the overflow", () => {
    const { container } = render(
      <FolderToolbar {...props} total={0} folderCount={0} sort="created_at" />,
    );
    expect([...new Set(wordless(container))]).toEqual(["More actions"]);
  });

  it.each([
    ["a", { href: "#" }],
    ["div", { role: "button", tabindex: "0" }],
    ["div", { role: "switch", tabindex: "0" }],
    ["div", { role: "tab", tabindex: "0" }],
    ["div", { role: "checkbox", tabindex: "0" }],
    ["div", { role: "menuitemradio", tabindex: "0" }],
    // No `tabindex`, so only the role catches it — and `[role=menuitem]`
    // does not match `menuitemradio`.
    ["div", { role: "menuitemradio" }],
    ["div", { tabindex: "0" }],
    ["input", { type: "button", value: "" }],
    ["label", {}],
  ])("sees a wordless <%s %s>", (tag, attrs) => {
    const { container } = render(<FolderToolbar {...props} />);
    const stray = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) stray.setAttribute(k, v as string);
    stray.appendChild(document.createElement("svg"));
    container.querySelector("div")!.appendChild(stray);
    expect(wordless(container)).toContain("(no accessible name)");
  });

  it("names the filter with a word at every state", () => {
    const { container } = render(<FolderToolbar {...props} />);
    expect(wordless(container)).not.toContain("File type");
    expect(wordless(container)).not.toContain("Verification");
    expect(
      screen.getAllByRole("button", { name: /^Filter/ }).length,
    ).toBeGreaterThan(0);
  });
});
