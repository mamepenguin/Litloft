import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";

import { FolderToolbar } from "../FolderToolbar";
import { BAR_WIDE } from "@/components/ToolbarMenu";
import { pressables } from "@/__tests__/helpers/pressable";

vi.mock("@/components/AddonSlot", () => ({ AddonSlot: () => null }));

const props = {
  isSpecialView: false,
  isWriteDestination: true,
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
  onReshuffle: vi.fn(),
};

const bar = (container: HTMLElement) =>
  container.querySelector<HTMLElement>(".sticky")!;

const controls = pressables;

const nameOf = (b: HTMLElement) =>
  b.getAttribute("aria-label") ?? (b.textContent ?? "").trim();

/**
 * Collected verbatim, sizing classes included, rather than filtered to a
 * visibility allowlist: the allowlist would be a hand-written classifier that
 * can fail in the direction that stays green.
 */
function responsiveChain(control: HTMLElement, root: HTMLElement): string[] {
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

const BASE = ["Add", "Play", "View: Grid view", "Sort: Newest first", "Filter", "More actions"];

/**
 * The expected list is declared, not derived from the observation: a derived
 * expectation is blind to a missing control, which drops out of both sides at
 * once.
 */
const STATES = [
  ["resting", {}, BASE],
  [
    "filtering on both axes",
    { typeFilter: "text" as const, trustFilter: "verified" as const },
    BASE.map((c) => (c === "Filter" ? "Filter: Text · Verified only" : c)),
  ],
  [
    "scoped to a tag",
    {
      tagFilter: "recipes",
      widenTagScope: { tagName: "recipes", href: "/drive/d?tag=recipes" },
    },
    [...BASE.filter((c) => c !== "Play"), "Search the whole drive"],
  ],
  ["naming a new folder", { creatingFolder: true }, [...BASE, "INPUT", "Create", "Cancel"]],
  ["in select mode", { selectable: true }, BASE],
  [
    "searching",
    { isSearch: true, hasPlayableFiles: false },
    // The face reads the order that is *on*, and these props pass
    // `created_at`.
    BASE.filter((c) => c !== "Play"),
  ],
] as const;

const MIN = ["pointer-coarse:min-h-11"];
const SQUARE = ["pointer-coarse:h-11", "pointer-coarse:w-11"];
const OVERHANG = [
  "pointer-coarse:before:-inset-1.5",
  "pointer-coarse:before:absolute",
  "pointer-coarse:before:content-['']",
];
const FLOOR: Record<string, string[]> = {
  Add: MIN,
  Play: MIN,
  Filter: MIN,
  "Filter: Text · Verified only": MIN,
  "View: Grid view": MIN,
  "Sort: Newest first": MIN,
  "Sort: Relevance": MIN,
  "More actions": SQUARE,
  "Search the whole drive": MIN,
  Create: MIN,
  Cancel: OVERHANG,
  INPUT: MIN,
};


/** Where each control lives. Empty chain means "on the bar at every width". */
const SCOPE: Record<string, string[]> = {
  Play: [],
  Filter: [],
  "Filter: Text · Verified only": [],
  "More actions": [],
  "Search the whole drive": [],
  // Everything that leaves the bar leaves at 768, where `00-basis.md` ends
  // the mobile form.
  Add: ["hidden", "md:flex"],
  INPUT: ["md:w-40", "md:flex-initial", "hidden", "md:block"],
  Create: ["hidden", "md:block"],
  Cancel: ["hidden", "md:block"],
  "View: Grid view": ["hidden", "md:flex"],
  "Sort: Newest first": ["hidden", "md:flex"],
  "Sort: Relevance": ["hidden", "md:flex"],
};

const nameOrTag = (b: HTMLElement) => nameOf(b) || b.tagName;

/**
 * The tables below key by accessible name, and `Object.fromEntries` keeps
 * the last of any duplicate — so two controls sharing a name would collapse
 * into one row and the other would go unchecked.
 */
function namesAreUnique(root: HTMLElement): boolean {
  const names = controls(root).map(nameOrTag);
  return new Set(names).size === names.length;
}

describe("what the folder toolbar keeps on the bar", () => {
  afterEach(cleanup);

  it("carries six controls at rest, and these are which", () => {
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

  it.each(STATES)("carries exactly its declared controls while %s", (_state, overrides, expected) => {
    const { container } = render(<FolderToolbar {...props} {...overrides} />);
    expect(controls(bar(container)).map(nameOrTag).sort()).toEqual(
      [...expected].sort(),
    );
  });

  it.each(STATES)("gives every control a touch floor while %s", (_state, overrides) => {
    // On each control, never on a wrapper: the row's own
    // `align-items: center` stops a wrapper's height reaching the button
    // inside it.
    const { container } = render(<FolderToolbar {...props} {...overrides} />);
    expect(namesAreUnique(bar(container))).toBe(true);
    const floors = Object.fromEntries(
      controls(bar(container)).map((b) => [
        nameOrTag(b),
        [...b.classList].filter((c) => c.startsWith("pointer-coarse:")).sort(),
      ]),
    );
    const unlisted = Object.keys(floors).filter((k) => FLOOR[k] === undefined);
    expect(unlisted).toEqual([]);
    expect(floors).toEqual(
      Object.fromEntries(Object.keys(floors).map((k) => [k, FLOOR[k]])),
    );
  });

  it.each(STATES)("keeps each control at its declared widths while %s", (_state, overrides) => {
    const { container } = render(<FolderToolbar {...props} {...overrides} />);
    const chains = Object.fromEntries(
      controls(bar(container)).map((b) => [
        nameOrTag(b),
        responsiveChain(b, bar(container)),
      ]),
    );
    // Before the comparison, not after: `toEqual` already fails for a
    // missing key, so asked second this could never run.
    const unlisted = Object.keys(chains).filter((k) => SCOPE[k] === undefined);
    expect(unlisted).toEqual([]);
    expect(chains).toEqual(
      Object.fromEntries(Object.keys(chains).map((k) => [k, SCOPE[k]])),
    );
  });

  it("lets the two controls that can outgrow the bar shrink instead of wrapping it", () => {
    // Wrapping is decided on a flex item's *base* size, so shrink alone does
    // not prevent it: the link is given a zero base (`flex-1`) and the face a
    // cap.
    render(
      <FolderToolbar
        {...props}
        typeFilter="text"
        trustFilter="verified"
        tagFilter="recipes"
        widenTagScope={{ tagName: "recipes", href: "/drive/d?tag=recipes" }}
      />,
    );

    const face = screen.getByRole("button", { name: /^Filter:/ });
    expect([...face.querySelector("span")!.classList].sort()).toEqual([
      "max-lg:max-w-24",
      "truncate",
    ]);
    // The icon must not be the thing that shrinks. Without `shrink-0` the
    // flex line takes the reduction out of the 16px glyph before the text,
    // and the control loses the mark that says what it is.
    expect([...face.querySelector("svg")!.classList]).toContain("shrink-0");

    const link = screen.getByRole("link", { name: "Search the whole drive" });
    // `flex` stops the link filling the wrapper, `flex-1` gives a zero base
    // so a long label cannot wrap the row, `min-w-0` lets it shrink once the
    // slack is gone.
    expect([...link.parentElement!.classList].sort()).toEqual([
      "flex",
      "flex-1",
      "min-w-0",
    ]);
    expect([...link.classList]).toContain("min-w-0");
    expect([...link.querySelector("span")!.classList]).toContain("truncate");
    expect([...link.querySelector("svg")!.classList]).toContain("shrink-0");
  });

  it("caps the filter face only once a second axis makes it long", () => {
    // The cap is 96px and the widest single-axis face is "Unjudged only" at
    // 95 — one label-length from eliding a face that fits. So the cap
    // arrives with the second axis rather than sitting on the control.
    const face = () => screen.getByRole("button", { name: /^Filter/ });
    const classes = () => [...face().querySelector("span")!.classList].sort();

    const { rerender } = render(<FolderToolbar {...props} />);
    expect(classes()).toEqual(["truncate"]);

    rerender(<FolderToolbar {...props} typeFilter="text" />);
    expect(classes()).toEqual(["truncate"]);

    rerender(
      <FolderToolbar {...props} typeFilter="text" trustFilter="verified" />,
    );
    expect(classes()).toEqual(["max-lg:max-w-24", "truncate"]);
  });

  it("keeps the overflow's breakpoint wrapper out of the menu's own children", () => {
    // `role="menu"` publishes only menuitem / group / separator children, so
    // a bare <div> between the menu and its two `role="group"` sections
    // takes them out of the menu's ownership. `presentation` re-parents
    // them.
    render(<FolderToolbar {...props} />);
    fireEvent.click(screen.getByLabelText("More actions"));
    const menu = screen.getByRole("menu");
    for (const group of menu.querySelectorAll('[role="group"]')) {
      let el = group.parentElement;
      while (el && el !== menu) {
        expect(el.getAttribute("role")).toBe("presentation");
        el = el.parentElement;
      }
    }
  });

  it("hands the left group from one row to the other with no width between", () => {
    // Read out of the DOM rather than written twice, so moving the
    // breakpoint has to move every member or fail here.
    const { container } = render(<FolderToolbar {...props} creatingFolder />);
    const bp = (el: Element) => {
      const shown = [...el.classList].find((c) => /^[a-z]{2}:(flex|block)$/.test(c));
      const hidden = [...el.classList].find((c) => /^[a-z]{2}:hidden$/.test(c));
      return (shown ?? hidden)?.split(":")[0];
    };

    const flowRow = container.firstElementChild!;
    expect([...flowRow.classList]).toContain("md:hidden");

    // Every element on the bar that appears at a breakpoint, partitioned by
    // which one. Found by class rather than listed, so a fourth arrival has
    // to join a group or fail the count.
    const byBreakpoint: Record<string, number> = {};
    for (const el of bar(container).querySelectorAll<HTMLElement>("*")) {
      if (![...el.classList].includes("hidden")) continue;
      const at = bp(el);
      if (at) byBreakpoint[at] = (byBreakpoint[at] ?? 0) + 1;
    }

    // Four at one width: `Add`, the name field, and the two arranging
    // menus.
    const wide = BAR_WIDE.className.replace("hidden ", "").split(":")[0];
    expect(bp(flowRow)).toBe(wide);
    expect(byBreakpoint).toEqual({ [wide]: 4 });
  });

  it("draws the name field once per breakpoint, each on a line of its own", () => {
    const { container } = render(<FolderToolbar {...props} creatingFolder />);
    const fields = [...container.querySelectorAll<HTMLElement>('input[type="text"]')];
    expect(fields).toHaveLength(2);

    const scopeOf = (field: HTMLElement, token: string) => {
      let el: HTMLElement | null = field;
      while (el) {
        if ([...el.classList].includes(token)) return el;
        el = el.parentElement;
      }
      return null;
    };
    // Asserted on the wrapper, not on the inner row: the inner one has
    // `w-full` too, and it is the outer one that is the flex item.
    const flow = fields.find((f) => scopeOf(f, "md:hidden"));
    const onBar = fields.find((f) => scopeOf(f, "md:block"));
    expect(flow).toBeDefined();
    expect(onBar).toBeDefined();
    expect([...scopeOf(onBar!, "md:block")!.classList].sort()).toEqual([
      "hidden",
      "md:block",
      "w-full",
    ]);
  });

  it("puts nothing on the bar when no folder is being named", () => {
    // The wrapper is rendered inside the condition, not around it. An
    // always-present `w-full` box is a flex item whether or not it holds
    // anything: empty, it takes a line and the row-gap with it.
    const { container } = render(<FolderToolbar {...props} />);
    expect(bar(container).querySelectorAll(".w-full")).toHaveLength(0);
  });

  it("gives the name field a line rather than a place in the row", () => {
    // `w-full` on the field's own wrapper is what keeps it from competing
    // with the controls. Nested inside the left group, `w-full` is 100% of
    // that group rather than of the row, so the group grows and the row it
    // sits on wraps instead.
    const { container } = render(<FolderToolbar {...props} creatingFolder />);
    const field = container.querySelector<HTMLElement>('input[type="text"]')!;
    const row = field.parentElement!;
    expect([...row.classList]).toContain("w-full");
    expect(row.querySelector("[aria-haspopup]")).toBeNull();
  });

  it("says which controls leave the bar in an attribute, not only in a class", () => {
    const { container } = render(<FolderToolbar {...props} />);
    const wide = [...bar(container).querySelectorAll<HTMLElement>('[data-bar="wide"]')];
    expect(wide.map((el) => nameOf(controls(el)[0]))).toEqual([
      "View: Grid view",
      "Sort: Newest first",
    ]);
    // Attribute and class on the same element, saying the same thing. Split
    // across two elements they could disagree, and the class is the one that
    // decides.
    for (const el of wide) {
      expect([...el.classList].join(" ")).toContain(BAR_WIDE.className);
    }
    expect(bar(container).querySelectorAll("[data-bar]").length).toBe(2);
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

  it.each([
    ["an ordinary folder", {}, 9],
    ["a search", { isSearch: true, sort: "relevance" as const }, 10],
    ["a random order", { sort: "random" as const }, 10],
  ])("offers the same choices in the overflow as on the bar, in %s", (_case, overrides, rows) => {
    render(<FolderToolbar {...props} {...overrides} />);

    // `[role^=menuitem]`, so `menuitem` and `menuitemradio` are both rows.
    const rowsOf = (root: HTMLElement) =>
      [...root.querySelectorAll('[role^="menuitem"]')].map((r) =>
        (r.textContent ?? "").trim(),
      );

    const openMenu = (trigger: RegExp) => {
      const t = screen.getByRole("button", { name: trigger });
      fireEvent.click(t);
      const found = rowsOf(screen.getByRole("menu"));
      fireEvent.click(t);
      return found;
    };

    const onBar = [...openMenu(/^View:/), ...openMenu(/^Sort:/)];

    fireEvent.click(screen.getByLabelText("More actions"));
    const menu = screen.getByRole("menu");
    const inOverflow = rowsOf(menu).filter(
      (r) => !["Selection mode", "Rescan", "Pin this folder"].includes(r),
    );

    expect(inOverflow).toEqual(onBar);
    expect(inOverflow.length).toBe(rows);
  });

  it("closes the overflow when a choice inside it is taken", () => {
    render(<FolderToolbar {...props} sort="random" />);
    fireEvent.click(screen.getByLabelText("More actions"));
    fireEvent.click(
      within(screen.getByRole("menu")).getByRole("menuitemradio", { name: "List view" }),
    );
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("More actions"));
    fireEvent.click(
      within(screen.getByRole("menu")).getByRole("menuitemradio", { name: "Title A→Z" }),
    );
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("More actions"));
    fireEvent.click(
      within(screen.getByRole("menu")).getByRole("menuitem", { name: "Reshuffle" }),
    );
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("keeps the overflow's copy away when there is nothing to arrange", () => {
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
    // The toolbar holds this state instead of each menu holding its own: the
    // same choice is drawn twice, and two uncontrolled switchers would
    // disagree across the width where one hands over to the other.
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
