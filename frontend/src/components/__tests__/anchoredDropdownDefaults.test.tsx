import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";

import { ANCHORED_VERTICAL } from "@/hooks/useAnchoredDirection";
import { ShortcutsProvider } from "@/components/ShortcutsProvider";
import { AddButton } from "@/components/AddButton";
import { EditableTagChips } from "@/components/EditableTagChips";
import { FolderPicker } from "@/components/FolderPicker";
import { SmartFolderSaveButton } from "@/components/SmartFolderSaveButton";
import { FilterField } from "@/components/folder/FilterField";
import { TrashToolbar } from "@/components/trash/TrashToolbar";

/**
 * Every `getBoundingClientRect()` in jsdom is zeros, which is what makes
 * this deterministic: with no room above and a zero-width panel, both the
 * direction and the side are the *declared* ones.
 */

vi.mock("@/lib/api", () => ({
  getFolders: vi.fn().mockResolvedValue([]),
  getFolderTree: vi.fn().mockResolvedValue([]),
  getDriveTags: vi
    .fn()
    .mockResolvedValue([{ name: "alpha" }, { name: "alpine" }]),
  updateFileTags: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/drive/media",
}));

vi.mock("@/hooks/useSmartFolders", () => ({
  useSmartFolders: () => ({
    smartFolders: [
      { id: "sf1", name: "Recent clips", query: "clip", file_type: null },
    ],
    loading: false,
    error: null,
    refetch: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  }),
}));

vi.mock("@/components/SortButton", () => ({
  SortButton: () => <button data-testid="sort-button">Sort</button>,
}));

function draw(node: ReactElement) {
  render(<ShortcutsProvider>{node}</ShortcutsProvider>);
}

const TRASH_PROPS = {
  sort: "created_at" as const,
  order: "desc" as const,
  typeFilter: null,
  total: 12,
  selectable: false,
  onSortChange: vi.fn(),
  onTypeFilterChange: vi.fn(),
  onViewChange: vi.fn(),
  onToggleSelectable: vi.fn(),
};

/**
 * Which side each form prefers, and the `ANCHORED_VERTICAL` step it hangs by.
 *
 * `side: null` is not "unknown" — it is `FolderPicker`'s `inset-x-0`, which
 * pins both edges to the trigger's, so there is no horizontal answer to give
 * it and it reads only `openUp`. Written as a value rather than left out, so
 * the case below asserts the panel carries *neither* side class instead of
 * skipping the axis.
 */
const FORMS = [
  {
    name: "AddButton, on the folder toolbar",
    side: "left-0",
    step: 1,
    open: () => {
      draw(<AddButton />);
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
      return screen.getByRole("menu");
    },
  },
  {
    name: "AddButton, in the drive root's page header",
    side: "right-0",
    step: 1,
    open: () => {
      draw(<AddButton align="right" />);
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
      return screen.getByRole("menu");
    },
  },
  {
    name: "FolderPicker",
    side: null,
    step: 2,
    open: () => {
      draw(<FolderPicker drive="media" value="" onChange={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: /Save to/ }));
      return screen.getByRole("dialog");
    },
  },
  {
    name: "EditableTagChips' suggestion list",
    side: "left-0",
    step: 1,
    open: async () => {
      draw(
        <EditableTagChips
          file={{
            id: "fVid0000001A",
            mime_type: "video/mp4",
            filename: "clip.mp4",
            drive: "media",
            folder_path: "clips",
          }}
          initialTags={[]}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /Add tag/ }));
      fireEvent.change(screen.getByPlaceholderText("Tag name..."), {
        target: { value: "alp" },
      });
      // The drive's tag list arrives from an effect, so the list is empty
      // for a tick after the keystroke that asks for it.
      return waitFor(() => screen.getByRole("listbox"));
    },
  },
  {
    name: "FilterField's type menu, with no kind chosen",
    side: "right-0",
    step: 1,
    open: () => {
      draw(
        <FilterField
          text=""
          onTextChange={vi.fn()}
          typeFilter={null}
          onTypeFilterChange={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Filter by type" }));
      return screen.getByRole("menu");
    },
  },
  {
    name: "FilterField's type menu, hanging off the chip",
    // The chip sits at the field's 28px offset rather than at its left
    // edge, so `left-7` is what the left side means in this form.
    side: "left-7",
    step: 1,
    open: () => {
      draw(
        <FilterField
          text=""
          onTextChange={vi.fn()}
          typeFilter="video"
          onTypeFilterChange={vi.fn()}
        />,
      );
      fireEvent.click(
        screen.getByRole("button", { name: /filter\. Click to change/ }),
      );
      return screen.getByRole("menu");
    },
  },
  {
    name: "TrashToolbar's kind filter",
    side: "left-0",
    step: 1,
    open: () => {
      draw(<TrashToolbar {...TRASH_PROPS} />);
      fireEvent.click(screen.getByRole("button", { name: "File type" }));
      return screen.getByRole("menu", { name: "File type" });
    },
  },
  {
    name: "SmartFolderSaveButton's saved-search menu",
    side: "right-0",
    step: 1,
    open: () => {
      draw(
        <SmartFolderSaveButton
          drive="media"
          query="clip"
          smartFolderId="sf1"
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /Saved:/ }));
      return screen.getByRole("menu");
    },
  },
] as const;

const SIDE_CLASSES = ["left-0", "left-7", "right-0"] as const;

describe("the sides the converted dropdowns prefer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("covers every form the sweep converted, and both edges", () => {
    // Eight forms, not six components: `AddButton` takes its preference
    // from a prop whose two callers disagree, and `FilterField` draws two
    // menus from one `renderMenu` with different defaults. A table keyed by
    // component would have four of the eight.
    expect(FORMS).toHaveLength(8);
    expect(FORMS.map((f) => f.name)).toHaveLength(new Set(FORMS.map((f) => f.name)).size);

    // Both edges are represented, and the sideless form is named rather
    // than inferred from a gap: a table that drifted to one edge would
    // still pass every case below.
    expect(FORMS.filter((f) => f.side === null).map((f) => f.name)).toEqual([
      "FolderPicker",
    ]);
    expect([...new Set(FORMS.map((f) => f.side))].sort()).toEqual([
      "left-0",
      "left-7",
      null,
      "right-0",
    ]);

    // And both gap steps, which is the other thing a site can get wrong:
    // `FolderPicker` is the only `mt-2` in the family, and giving it the
    // 4px entry would put its arithmetic 4px out with nothing to notice.
    expect(FORMS.filter((f) => f.step === 2).map((f) => f.name)).toEqual([
      "FolderPicker",
    ]);
  });

  it.each(FORMS.map((form) => [form.name, form] as const))(
    "%s",
    async (_name, form) => {
      const panel = await form.open();
      const classes = [...panel.classList];

      // Downward, which is what zero-sized boxes decide.
      for (const token of ANCHORED_VERTICAL[form.step].down.split(" ")) {
        expect(classes).toContain(token);
      }
      for (const token of ANCHORED_VERTICAL[form.step].up.split(" ")) {
        expect(classes).not.toContain(token);
      }

      // The preferred edge, and only it.
      for (const side of SIDE_CLASSES) {
        expect(classes.includes(side)).toBe(side === form.side);
      }
    },
  );
});
