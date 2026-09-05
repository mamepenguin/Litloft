import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";

import { FolderToolbar } from "../FolderToolbar";
import { BAR_WIDE } from "../ToolbarMenu";

vi.mock("@/components/AddonSlot", () => ({ AddonSlot: () => null }));

const props = {
  isSpecialView: false,
  isFolderAnchored: true,
  tagFilter: null,
  hasPlayableFiles: true,
  sort: "created_at" as const,
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
  folderPath: "photos",
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

const bar = (container: HTMLElement) =>
  container.querySelector<HTMLElement>(".sticky")!;

const controls = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>("button")].filter(
    (b) => !(b instanceof HTMLInputElement),
  );

const nameOf = (b: HTMLElement) =>
  b.getAttribute("aria-label") ?? (b.textContent ?? "").trim();

/**
 * Every responsive-visibility class between a control and the bar it sits on.
 *
 * Collected, not classified. A predicate that decided "is this control on the
 * bar at 375px?" would be a hand-written classifier, and this phase has three
 * recorded cases of one failing in the direction that stays green. The chain
 * is reported verbatim instead: a `lg:hidden` added anywhere on the way up
 * changes a row of the table below and names the control it changed.
 */
function visibilityChain(control: HTMLElement, root: HTMLElement): string[] {
  const out: string[] = [];
  let el: HTMLElement | null = control;
  while (el && el !== root) {
    for (const c of el.classList) {
      if (/^(hidden|(max-)?(sm|md|lg|xl|2xl):)/.test(c)) out.push(c);
    }
    el = el.parentElement;
  }
  return out;
}

describe("what the folder toolbar keeps on the bar", () => {
  afterEach(cleanup);

  it("carries six controls, and these are which", () => {
    // `toBe`, not a floor. The whole point of 案 2 is a number, and a
    // seventh control arriving unnoticed is the failure this counts against.
    const { container } = render(<FolderToolbar {...props} />);
    expect(controls(bar(container)).map(nameOf).sort()).toEqual([
      "Add",
      "Filter",
      "More actions",
      "Play",
      "Sort: Newest first",
      "View: Grid view",
    ]);
  });

  it("leaves three of them standing at 375px, and says so in class names", () => {
    // The mobile rule is "reduce the number, not the labels"
    // (`00-basis.md`). An empty chain means the control is on the bar at
    // every width; anything else names the width it appears at.
    //
    // Measured in Chromium at the same time as this was written: 375px, one
    // row, 60px tall, `Play` 74x44 · `Filter` 80x44 · `More actions` 44x44.
    // This assertion pins the classes that produce that, not the pixels —
    // jsdom lays nothing out, and the two are different claims.
    const { container } = render(<FolderToolbar {...props} />);
    const chains = Object.fromEntries(
      controls(bar(container)).map((b) => [
        nameOf(b),
        visibilityChain(b, bar(container)),
      ]),
    );
    expect(chains).toEqual({
      Play: [],
      Filter: [],
      "More actions": [],
      // The left group has had its own row above the bar since before this
      // phase; it is not part of what B2b-2b moved.
      Add: ["hidden", "sm:flex"],
      "View: Grid view": ["hidden", "md:flex"],
      "Sort: Newest first": ["hidden", "md:flex"],
    });
  });

  it("gives every control on it the touch floor, on the control itself", () => {
    // On each control, never on a wrapper. #142 measured why: the row's own
    // `align-items: center` stops a wrapper's height reaching the button
    // inside it, so a floor written one level up leaves the control at 28
    // or 32 while the box around it is 44.
    //
    // This pins the classes. The pixels were measured separately, in
    // Chromium with a coarse pointer, over ten widths from 320 to 1512, two
    // locales, three orders, two layouts and three listing states — 360
    // combinations, every control at least 44x44, the bar one row in all of
    // them. A class list cannot say that and this test does not claim to.
    const { container } = render(<FolderToolbar {...props} />);
    const floors = Object.fromEntries(
      controls(bar(container)).map((b) => [
        nameOf(b),
        [...b.classList].filter((c) => c.startsWith("pointer-coarse:")).sort(),
      ]),
    );
    expect(floors).toEqual({
      Add: ["pointer-coarse:min-h-11"],
      Play: ["pointer-coarse:min-h-11"],
      Filter: ["pointer-coarse:min-h-11"],
      "View: Grid view": ["pointer-coarse:min-h-11"],
      "Sort: Newest first": ["pointer-coarse:min-h-11"],
      // Square, not a minimum: it is the one control here with no word, so
      // its width is the icon's and a height floor alone would leave it 32
      // across.
      "More actions": ["pointer-coarse:h-11", "pointer-coarse:w-11"],
    });
  });

  it("puts the two that leave into the overflow, at exactly the widths they left", () => {
    // The two halves of one decision. Read from `BAR_WIDE` rather than
    // written out, so moving the breakpoint moves both or fails here: a bar
    // that hides a control at 900px while the overflow only offers it below
    // 768px loses the function outright in between.
    const breakpoint = BAR_WIDE.className.match(/^hidden (\w+):flex$/)![1];
    const { container } = render(<FolderToolbar {...props} />);
    fireEvent.click(screen.getByLabelText("More actions"));
    const groups = screen
      .getByRole("menu")
      .querySelectorAll<HTMLElement>(`.${breakpoint}\\:hidden`);
    expect(groups).toHaveLength(1);
    expect(controls(container).map(nameOf)).toContain("View: Grid view");
  });

  it("offers the same choices in the overflow as on the bar", () => {
    // Not a proof that one implementation draws both — they are the same
    // component today, and a test cannot see that. It is a drift check: the
    // day someone writes the phone's rows out by hand, the two lists stop
    // matching and this says which row went missing.
    render(<FolderToolbar {...props} />);

    const openMenu = (trigger: string) => {
      fireEvent.click(screen.getByLabelText(trigger));
      const rows = within(screen.getByRole("menu"))
        .getAllByRole("menuitemradio")
        .map((r) => (r.textContent ?? "").trim());
      fireEvent.click(screen.getByLabelText(trigger));
      return rows;
    };

    const onBar = [...openMenu("View: Grid view"), ...openMenu("Sort: Newest first")];

    fireEvent.click(screen.getByLabelText("More actions"));
    const inOverflow = within(screen.getByRole("menu"))
      .getAllByRole("menuitemradio")
      .map((r) => (r.textContent ?? "").trim());

    expect(inOverflow).toEqual(onBar);
    // Two layouts and seven orders. `toBe`, so an order that stops being
    // offered on both sides at once still fails here.
    expect(inOverflow.length).toBe(9);
  });

  it("keeps the overflow's copy away when there is nothing to arrange", () => {
    // Phase 0.5's E-2: an empty, unfiltered folder shows no way of
    // arranging nothing. The rule has to hold in the overflow too, or the
    // controls only *look* put away.
    render(<FolderToolbar {...props} total={0} folderCount={0} />);
    fireEvent.click(screen.getByLabelText("More actions"));
    expect(
      within(screen.getByRole("menu")).queryAllByRole("menuitemradio"),
    ).toHaveLength(0);
  });
});

describe("the folder toolbar's one view mode", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  // Uncontrolled: search and the flat virtual views have no folder to key a
  // view mode on, so the switcher remembers it under the global key itself.
  // `FolderBrowser` passes `viewMode={undefined}` there.
  const uncontrolled = { ...props, viewMode: undefined };

  it("remembers an uncontrolled choice under the shared key", () => {
    render(<FolderToolbar {...uncontrolled} />);
    fireEvent.click(screen.getByLabelText("View: Grid view"));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "List view" }));
    expect(localStorage.getItem("video-share-view-mode")).toBe("list");
    expect(props.onViewChange).toHaveBeenCalledWith("list");
  });

  it("reads that key back on the way in", () => {
    localStorage.setItem("video-share-view-mode", "list");
    render(<FolderToolbar {...uncontrolled} />);
    expect(screen.getByLabelText("View: List view")).toBeInTheDocument();
  });

  it("shows the bar and the overflow the same answer", () => {
    // The reason the toolbar holds this state instead of each menu holding
    // its own: the same choice is drawn twice, and two uncontrolled
    // switchers would disagree across the width where one hands over to the
    // other. Nothing about the rendered output says which arrangement is in
    // use, so it is asserted through the behaviour.
    render(<FolderToolbar {...uncontrolled} />);
    fireEvent.click(screen.getByLabelText("View: Grid view"));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "List view" }));

    fireEvent.click(screen.getByLabelText("More actions"));
    const inOverflow = within(screen.getByRole("menu"))
      .getAllByRole("menuitemradio")
      .filter((r) => /view$/.test((r.textContent ?? "").trim()));
    expect(
      inOverflow.map((r) => [r.textContent?.trim(), r.getAttribute("aria-checked")]),
    ).toEqual([
      ["Grid view", "false"],
      ["List view", "true"],
    ]);
  });
});

describe("the folder toolbar's pin row", () => {
  afterEach(cleanup);

  const openMore = () => fireEvent.click(screen.getByLabelText("More actions"));

  it("offers to pin the folder being looked at", () => {
    const onTogglePin = vi.fn();
    render(<FolderToolbar {...props} isPinned={false} onTogglePin={onTogglePin} />);
    openMore();
    fireEvent.click(screen.getByRole("menuitem", { name: "Pin this folder" }));
    expect(onTogglePin).toHaveBeenCalledWith("photos");
  });

  it("names the flip it is actually making", () => {
    // Both directions, because a row that always said "Pin" would be right
    // half the time and unfalsifiable the other half.
    render(<FolderToolbar {...props} isPinned onTogglePin={vi.fn()} />);
    openMore();
    expect(screen.getByRole("menuitem", { name: "Unpin this folder" })).toBeInTheDocument();
    expect(screen.queryByText("Pin this folder")).not.toBeInTheDocument();
  });

  it.each([
    ["there is no handler", { onTogglePin: undefined }],
    ["there is no folder path", { onTogglePin: vi.fn(), folderPath: undefined }],
    ["the path is the drive root", { onTogglePin: vi.fn(), folderPath: "" }],
  ])("offers nothing to pin when %s", (_why, overrides) => {
    render(<FolderToolbar {...props} {...overrides} />);
    openMore();
    expect(screen.queryByText(/^(Pin|Unpin) this folder$/)).not.toBeInTheDocument();
  });
});
