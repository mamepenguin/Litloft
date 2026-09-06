import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";

import { FolderToolbar } from "../FolderToolbar";
import { BAR_WIDE } from "@/components/ToolbarMenu";
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
const BASE = ["Add", "Play", "View: Grid view", "Sort: Newest first", "Filter", "More actions"];

/**
 * Each state, and **the controls the bar carries in it**.
 *
 * The expected list is declared, not derived. The first version of these
 * tables built the expectation from the observation
 * (`Object.fromEntries(Object.keys(observed)…)`), which can catch a wrong
 * value and an unlisted control but is blind to a *missing* one by
 * construction: a control that disappears drops out of both sides of the
 * comparison at once. Deleting either copy of the name field — making New
 * Folder unreachable above 768 or below it — passed the whole suite.
 */
const STATES = [
  ["resting", {}, BASE],
  [
    "filtering on both axes",
    { typeFilter: "markdown" as const, trustFilter: "verified" as const },
    BASE.map((c) => (c === "Filter" ? "Filter: Markdown · Verified only" : c)),
  ],
  [
    "scoped to a tag",
    {
      tagFilter: "recipes",
      widenTagScope: { tagName: "recipes", href: "/drive/d?tag=recipes" },
    },
    // A tag filter hides Play — it has always been scoped to a plain folder
    // listing — and adds the way back out to the whole drive.
    [...BASE.filter((c) => c !== "Play"), "Search the whole drive"],
  ],
  ["naming a new folder", { creatingFolder: true }, [...BASE, "INPUT", "Create", "Cancel"]],
  ["in select mode", { selectable: true }, BASE],
  [
    "searching",
    { isSearch: true, hasPlayableFiles: false },
    // The face reads the order that is *on*, and these props pass
    // `created_at`. `allowRelevance` adds a row to the menu; it does not
    // change the listing's order.
    BASE.filter((c) => c !== "Play"),
  ],
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
  // One breakpoint. Everything that leaves the bar leaves at 768, where
  // `00-basis.md` ends the mobile form — the left group to the row above,
  // the two arranging menus into `…`.
  Add: ["hidden", "md:flex"],
  // The name field is not in the left group any more; it is a row of its
  // own on the bar from 768, and a row of its own above the bar below that.
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
 * into one row and the other would go unchecked. Nothing on this bar shares
 * one today; this is what says so.
 */
function namesAreUnique(root: HTMLElement): boolean {
  const names = controls(root).map(nameOrTag);
  return new Set(names).size === names.length;
}

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

  it.each(STATES)("carries exactly its declared controls while %s", (_state, overrides, expected) => {
    // The assertion the two tables below cannot make. They key by name, so
    // a control that vanishes vanishes from the expectation with it; this
    // one names what has to be there.
    const { container } = render(<FolderToolbar {...props} {...overrides} />);
    expect(controls(bar(container)).map(nameOrTag).sort()).toEqual(
      [...expected].sort(),
    );
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
    expect(namesAreUnique(bar(container))).toBe(true);
    const floors = Object.fromEntries(
      controls(bar(container)).map((b) => [
        nameOrTag(b),
        [...b.classList].filter((c) => c.startsWith("pointer-coarse:")).sort(),
      ]),
    );
    // Same order as above, and for the same reason.
    const unlisted = Object.keys(floors).filter((k) => FLOOR[k] === undefined);
    expect(unlisted).toEqual([]);
    expect(floors).toEqual(
      Object.fromEntries(Object.keys(floors).map((k) => [k, FLOOR[k]])),
    );
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
    // Before the comparison, not after: `toEqual` already fails for a
    // missing key (received `[]` against expected `undefined`), so asked
    // second this could never run. Asked first it names the control that
    // has no entry, which is the more useful failure.
    const unlisted = Object.keys(chains).filter((k) => SCOPE[k] === undefined);
    expect(unlisted).toEqual([]);
    expect(chains).toEqual(
      Object.fromEntries(Object.keys(chains).map((k) => [k, SCOPE[k]])),
    );
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
    // face goes 211 -> 144 below 1024 and the bar is one row at 320 and
    // 375. The link is 201 at its natural width and shrinks from there
    // rather than pushing anything: 172 at 768 with an addon beside it, 148
    // at 320. Without the wrapper's `flex` it fills instead — 998 at 1512.
    render(
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
      "max-lg:max-w-24",
      "truncate",
    ]);
    // The icon must not be the thing that shrinks. Without `shrink-0` the
    // flex line takes the reduction out of the 16px glyph before the text,
    // and the control loses the mark that says what it is.
    expect([...face.querySelector("svg")!.classList]).toContain("shrink-0");

    const link = screen.getByRole("link", { name: "Search the whole drive" });
    // `flex` on the wrapper is what makes the link an item rather than a
    // block that fills it. Without it the link's own `display:flex` spans
    // the whole grower — 998px at 1512 around a 151px label, measured. All
    // three classes, exactly, because each does a different job: `flex`
    // stops the fill, `flex-1` gives a zero base so a long label cannot
    // wrap the row, `min-w-0` lets it shrink once the slack is gone.
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
    // 95 — one label-length from eliding a face that fits. Two axes join
    // with ` · ` and reach 211, which is what wraps the bar. So the cap
    // arrives with the second axis rather than sitting on the control.
    const face = () => screen.getByRole("button", { name: /^Filter/ });
    const classes = () => [...face().querySelector("span")!.classList].sort();

    const { rerender } = render(<FolderToolbar {...props} />);
    expect(classes()).toEqual(["truncate"]);

    rerender(<FolderToolbar {...props} typeFilter="markdown" />);
    expect(classes()).toEqual(["truncate"]);

    rerender(
      <FolderToolbar {...props} typeFilter="markdown" trustFilter="verified" />,
    );
    expect(classes()).toEqual(["max-lg:max-w-24", "truncate"]);
  });

  it("keeps the overflow's breakpoint wrapper out of the menu's own children", () => {
    // `role="menu"` publishes only menuitem / group / separator children, so
    // a bare <div> between the menu and its two `role="group"` sections
    // takes them out of the menu's ownership. `presentation` re-parents
    // them. The same rule this file's group tests cite.
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
    // The pair that decides where `Add`, the addon slot and the name field
    // live: a `md:hidden` row above the bar and a `hidden md:flex` group on
    // it. Two halves of one decision, exactly like `BAR_WIDE` and the
    // overflow's `md:hidden` — but invisible to `SCOPE`, which walks from a
    // control *up to the bar* and so never reaches a sibling of the bar.
    //
    // Mutating the row's `md:hidden` to `sm:hidden` passed every test in
    // this tree while `Add`, the name field and the addon's entry point
    // vanished outright at 640-767. There is no overflow copy of `Add`;
    // nothing else offers it.
    //
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
    // menus. `toEqual` on the whole map, so a control that drifts to a
    // second breakpoint fails with that breakpoint named rather than
    // balancing out inside a total.
    const wide = BAR_WIDE.className.replace("hidden ", "").split(":")[0];
    expect(bp(flowRow)).toBe(wide);
    expect(byBreakpoint).toEqual({ [wide]: 4 });
  });

  it("draws the name field once per breakpoint, each on a line of its own", () => {
    // Two copies, one per scope, and each individually required. Deleting
    // either one used to pass the whole suite: the bar-scoped tables never
    // look outside `.sticky`, so the flow-row copy was unread, and the
    // partition test counts the wrapper `div`, which survives its contents
    // being removed. Below 768 the missing copy makes New Folder
    // unreachable on a phone; above it, on a desktop.
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
    // One under the row that exists below 768, one under a wrapper that
    // exists from 768 — and that wrapper carries the `w-full` that gives it
    // a line. Asserted on the wrapper, not on the inner row: the inner one
    // has `w-full` too, and it is the outer one that is the flex item.
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
    // anything: empty, it takes a line and the row-gap with it, and the
    // resting bar measures 68px instead of 60 at every width from 768 up.
    // jsdom cannot see that height; it can see that the box is not there.
    const { container } = render(<FolderToolbar {...props} />);
    expect(bar(container).querySelectorAll(".w-full")).toHaveLength(0);
  });

  it("gives the name field a line rather than a place in the row", () => {
    // `w-full` on the field's own wrapper is what keeps it from competing
    // with the controls. Nested inside the left group, `w-full` is 100% of
    // that group rather than of the row, so the group grows and the row it
    // sits on wraps instead.
    //
    // A class assertion. The pixels are in Chromium: with this, the bar is
    // one row at every width from 320 to 1512 in both locales, with and
    // without an addon on it.
    const { container } = render(<FolderToolbar {...props} creatingFolder />);
    const field = container.querySelector<HTMLElement>('input[type="text"]')!;
    const row = field.parentElement!;
    expect([...row.classList]).toContain("w-full");
    // And it is not sharing that line with `Add`.
    expect(row.querySelector("[aria-haspopup]")).toBeNull();
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
