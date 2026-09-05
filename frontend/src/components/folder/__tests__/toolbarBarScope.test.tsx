import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";

import { FolderToolbar } from "../FolderToolbar";
import { BAR_WIDE } from "../ToolbarMenu";
import { pressables } from "@/__tests__/helpers/pressable";

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

/**
 * Everything pressable on the bar, not everything that is a `<button>`.
 *
 * The first version of this file asked for `button` and filtered out
 * `HTMLInputElement` — a filter that excluded nothing, because
 * `querySelectorAll("button")` cannot return one, while reading as though a
 * decision had been made. What it did exclude, silently, was the one control
 * on this bar that is an `<a>`: `WidenTagScopeLink`, which was 38px tall on
 * a coarse pointer underneath the floor test below. Not unasserted —
 * unassertable. `pressables` is the same breadth `toolbarLabels` uses.
 */
const controls = pressables;

const nameOf = (b: HTMLElement) =>
  b.getAttribute("aria-label") ?? (b.textContent ?? "").trim();

/**
 * Every responsive class between a control and the bar it sits on.
 *
 * Collected, not classified. A predicate that decided "is this control on the
 * bar at 375px?" would be a hand-written classifier, and this phase has three
 * recorded cases of one failing in the direction that stays green. The chain
 * is reported verbatim instead: a `lg:hidden` added anywhere on the way up
 * changes a row of the table below and names the control it changed.
 *
 * Verbatim means sizing classes come along — `sm:w-40` on the new-folder
 * input, `sm:w-auto` on the row that holds it. They are kept rather than
 * filtered to a visibility allowlist, because the allowlist would be the
 * classifier this exists to avoid.
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

/**
 * The states this bar is actually in, not the one it rests in.
 *
 * Every enumeration below used to run against a single props object with
 * `widenTagScope` absent, `creatingFolder: false` and both filter axes null
 * — so a control that exists only in another state was outside the tables by
 * construction. Two live defects sat in that gap: the two-axis filter face,
 * which is 211px and wrapped the bar at 375px, and the tag-scope link, which
 * was 38px tall at every width.
 *
 * `toolbarLabels` next door already ran its scan over six states for the
 * same reason, and that insight belonged here more: it counts wordless
 * controls, a set that does not grow with state, while these measure floors
 * and widths, which do.
 */
const STATES = [
  ["resting", {}],
  ["filtering on both axes", { typeFilter: "markdown" as const, trustFilter: "verified" as const }],
  ["scoped to a tag", {
    tagFilter: "recipes",
    widenTagScope: { tagName: "recipes", href: "/drive/d?tag=recipes" },
  }],
  ["naming a new folder", { creatingFolder: true }],
  ["in select mode", { selectable: true }],
  ["searching", { isSearch: true, hasPlayableFiles: false }],
] as const;

/**
 * The coarse-pointer treatment each control on the bar is entitled to.
 *
 * Two recipes, and the difference is not cosmetic. `min-h-11` grows the box,
 * which is what a control with a label needs; the square is for the one
 * control with no word, whose width would otherwise stay at the icon's.
 * `Cancel` is `Button`'s `iconOnly`, which grows the *hit area* with a
 * `::before` reaching 6px past a 32px box — safe here because the 8px `gap-2`
 * beside it is wider than the reach, and because DESIGN.md §Row Actions
 * scopes its warning about colliding overhangs to a shorter pitch than this.
 *
 * A dictionary rather than a per-state literal: seven states times nine
 * controls is a table nobody re-reads, and the point is that every control
 * has *an* entry. A control that appears with no entry here fails by name.
 */
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
  "Filter: Markdown · Verified only": MIN,
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
  "Filter: Markdown · Verified only": [],
  "More actions": [],
  "Search the whole drive": [],
  // The left group has had its own row above the bar since before this
  // phase; it is not part of what B2b-2b moved. The create-folder form
  // opens inside that group, so it inherits the same scope.
  Add: ["hidden", "sm:flex"],
  INPUT: ["sm:w-40", "sm:flex-initial", "sm:w-auto", "hidden", "sm:flex"],
  Create: ["sm:w-auto", "hidden", "sm:flex"],
  Cancel: ["sm:w-auto", "hidden", "sm:flex"],
  "View: Grid view": ["hidden", "md:flex"],
  "Sort: Newest first": ["hidden", "md:flex"],
  "Sort: Relevance": ["hidden", "md:flex"],
};

const nameOrTag = (b: HTMLElement) => nameOf(b) || b.tagName;

describe("what the folder toolbar keeps on the bar", () => {
  afterEach(cleanup);

  it("carries six controls at rest, and these are which", () => {
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

  it.each(STATES)("gives every control a touch floor while %s", (_state, overrides) => {
    // On each control, never on a wrapper. #142 measured why: the row's own
    // `align-items: center` stops a wrapper's height reaching the button
    // inside it, so a floor written one level up leaves the control at 28
    // or 32 while the box around it is 44.
    //
    // Asserted as an exact map, not as "the set with no floor is empty". An
    // emptiness claim cannot see an exclusion rule that grew too broad —
    // this suite has that lesson written down twice — and it cannot see a
    // control that invented a third recipe either.
    const { container } = render(<FolderToolbar {...props} {...overrides} />);
    const floors = Object.fromEntries(
      controls(bar(container)).map((b) => [
        nameOrTag(b),
        [...b.classList].filter((c) => c.startsWith("pointer-coarse:")).sort(),
      ]),
    );
    expect(floors).toEqual(
      Object.fromEntries(Object.keys(floors).map((k) => [k, FLOOR[k]])),
    );
    // The dictionary is only a guard if every key resolved to something.
    expect(Object.values(floors).every((v) => v && v.length > 0)).toBe(true);
  });

  it.each(STATES)("keeps each control at its declared widths while %s", (_state, overrides) => {
    // Measured in Chromium alongside this, coarse pointer: at 375px the bar
    // is one row, 60px tall, in every state above. This assertion pins the
    // classes that produce that, not the pixels — jsdom lays nothing out,
    // and the two are different claims.
    const { container } = render(<FolderToolbar {...props} {...overrides} />);
    const chains = Object.fromEntries(
      controls(bar(container)).map((b) => [
        nameOrTag(b),
        responsiveChain(b, bar(container)),
      ]),
    );
    expect(chains).toEqual(
      Object.fromEntries(Object.keys(chains).map((k) => [k, SCOPE[k]])),
    );
    expect(Object.values(chains).every((v) => v !== undefined)).toBe(true);
  });

  it("lets the two controls that can outgrow the bar shrink instead of wrapping it", () => {
    // Both of these carry text whose length is not the toolbar's to choose:
    // the filter face names every axis that is on, and the tag-scope link is
    // a translated sentence. At full width they were 211px and 201px of a
    // 343px bar, and each wrapped `…` onto a second row at 375px.
    //
    // Wrapping is decided on a flex item's *base* size, so shrink alone does
    // not prevent it: the link is given a zero base (`flex-1`) and the face a
    // cap. This pins the recipes. It cannot pin the effect — jsdom lays
    // nothing out. Measured in Chromium, coarse pointer, both locales: the
    // face goes 211 -> 144 below 640 and the bar is one row at 320 and 375;
    // the link goes 201 -> 148 at 320 and the bar is one row from 320 up.
    const { container } = render(
      <FolderToolbar
        {...props}
        typeFilter="markdown"
        trustFilter="verified"
        tagFilter="recipes"
        widenTagScope={{ tagName: "recipes", href: "/drive/d?tag=recipes" }}
      />,
    );

    const face = screen.getByRole("button", { name: /^Filter:/ });
    expect([...face.querySelector("span")!.classList].sort()).toEqual([
      "max-sm:max-w-24",
      "truncate",
    ]);
    expect([...face.classList]).toContain("min-w-0");

    const link = screen.getByRole("link", { name: "Search the whole drive" });
    expect([...link.parentElement!.classList].sort()).toEqual([
      "flex-1",
      "min-w-0",
    ]);
    expect([...link.classList]).toContain("min-w-0");
    expect([...link.querySelector("span")!.classList]).toContain("truncate");
  });

  it("says which controls leave the bar in an attribute, not only in a class", () => {
    // `SelectionBar` emits `data-bar` *and* reads it in six places; this
    // toolbar emitted it and nothing read it, which made the comment on
    // `BAR_WIDE` — "the two toolbars now say their membership the same way"
    // — true of the emitting half only. Reading it here is what makes the
    // attribute a second, independent statement rather than decoration.
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
    // And nothing else on the bar claims a scope. `toBe`, so a third control
    // quietly declaring itself wide fails here.
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
    // Search adds Relevance — and search's *default* order is Relevance, so
    // an overflow that lost the flag would strand a phone with no way back
    // to the order it started in. Below 768px the overflow is the only sort
    // control on the screen.
    ["a search", { isSearch: true, sort: "relevance" as const }, 10],
    // Reshuffle is a `menuitem`, not a radio. Comparing only the radios let
    // the overflow drop it with nothing failing, which on a phone means a
    // random listing that cannot be reshuffled at all.
    ["a random order", { sort: "random" as const }, 10],
  ])("offers the same choices in the overflow as on the bar, in %s", (_case, overrides, rows) => {
    // Not a proof that one implementation draws both — they are the same
    // component today, and a test cannot see that. It is a drift check: the
    // day someone writes the phone's rows out by hand, the two lists stop
    // matching and this says which row went missing.
    render(<FolderToolbar {...props} {...overrides} />);

    // `[role^=menuitem]`, so `menuitem` and `menuitemradio` are both rows.
    // Comparing only the radios is what let reshuffle survive being dropped
    // from the overflow.
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
    // `toBe`, so a choice that stops being offered on both sides at once
    // still fails here rather than agreeing with itself.
    expect(inOverflow.length).toBe(rows);
  });

  it("closes the overflow when a choice inside it is taken", () => {
    // The bar's own menus are asserted to close on select. Their copies in
    // `…` are wired separately, and a copy that stayed open left the sheet
    // covering the listing it had just re-ordered.
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
