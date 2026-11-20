/**
 * SPEC-CORE-147: the core filter part's tag menu, through its contract.
 * The part is imported per test so that each one fails on its own while the
 * part is missing.
 */

import { useState, type ComponentType } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiStatusError } from "@/lib/api";

type Candidate = { name: string; count: number };
type Load = (signal: AbortSignal) => Promise<Candidate[]>;

// The state menu's option shape is the caller's; these tests pass `null`.
type FilterMenusProps = {
  tags: string[];
  onToggle: (name: string) => void;
  onClear: () => void;
  loadCandidates: Load;
  conditionsKey: string;
  excludeTags: string[];
  state: null;
  onViewerRejected: () => void;
};

async function part(): Promise<ComponentType<FilterMenusProps>> {
  const path = "@/components/appshell/FilterMenus";
  const mod = await import(/* @vite-ignore */ path);
  return mod.FilterMenus as unknown as ComponentType<FilterMenusProps>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

let loads: Array<{ tags: string[]; signal: AbortSignal; d: ReturnType<typeof deferred<Candidate[]>> }>;
let onViewerRejected: ReturnType<typeof vi.fn>;

function Harness({
  FilterMenus,
  initial = [],
  excludeTags = [],
}: {
  FilterMenus: ComponentType<FilterMenusProps>;
  initial?: string[];
  excludeTags?: string[];
}) {
  const [tags, setTags] = useState<string[]>(initial);
  const key = JSON.stringify(tags);
  return (
    <FilterMenus
      tags={tags}
      onToggle={(name) =>
        setTags((prev) =>
          prev.some((t) => t.toLowerCase() === name.toLowerCase())
            ? prev.filter((t) => t.toLowerCase() !== name.toLowerCase())
            : [...prev, name],
        )
      }
      onClear={() => setTags([])}
      loadCandidates={(signal) => {
        const d = deferred<Candidate[]>();
        loads.push({ tags, signal, d });
        return d.promise;
      }}
      conditionsKey={key}
      excludeTags={excludeTags}
      state={null}
      onViewerRejected={onViewerRejected}
    />
  );
}

const tagButton = () => screen.getByRole("button", { name: /^Tag/ });

function open() {
  fireEvent.click(tagButton());
}

function close() {
  fireEvent.keyDown(tagButton(), { key: "Escape" });
}

function anyRow(): HTMLElement {
  const label = screen.getByText("Any");
  const row = label.closest<HTMLElement>("[role^='menuitem']");
  if (!row) throw new Error("the Any row is not a menu item");
  return row;
}

/** Every candidate row, as its text with whitespace removed (name then count). */
function rows(): string[] {
  const any = screen.queryByText("Any")?.closest("[role^='menuitem']") ?? null;
  return screen
    .queryAllByRole("menuitemcheckbox")
    .filter((row) => row !== any)
    .map((row) => (row.textContent ?? "").replace(/\s+/g, ""));
}

function row(name: string): HTMLElement {
  const found = screen
    .getAllByRole("menuitemcheckbox")
    .find((r) => (r.textContent ?? "").replace(/\s+/g, "").startsWith(name));
  if (!found) throw new Error(`no row for ${name}`);
  return found;
}

async function answer(index: number, value: Candidate[]) {
  await act(async () => {
    loads[index].d.resolve(value);
  });
}

async function fail(index: number, error: unknown = new Error("boom")) {
  await act(async () => {
    loads[index].d.reject(error);
  });
}

const ANSWER: Candidate[] = [
  { name: "trip", count: 9 },
  { name: "food", count: 4 },
  { name: "Über", count: 2 },
  { name: "cats", count: 1 },
];

beforeEach(() => {
  loads = [];
  onViewerRejected = vi.fn();
});

describe("SPEC-CORE-147 the tag button", () => {
  it("SPEC-CORE-147 reads Tag: None specified when no tag is chosen", async () => {
    const FilterMenus = await part();
    render(<Harness FilterMenus={FilterMenus} />);

    expect(tagButton()).toHaveAccessibleName("Tag: None specified");
  });

  it("SPEC-CORE-147 reads the chosen names joined by a comma, in choice order", async () => {
    const FilterMenus = await part();
    render(<Harness FilterMenus={FilterMenus} initial={["trip", "food"]} />);

    expect(tagButton()).toHaveAccessibleName("Tag: trip, food");
  });

  it("SPEC-CORE-147 draws the Tag icon on the tag button", async () => {
    const FilterMenus = await part();
    render(<Harness FilterMenus={FilterMenus} />);

    expect(tagButton().querySelector("svg")?.getAttribute("class")).toContain("lucide-tag");
  });

  it("SPEC-CORE-147 draws no state menu when state is null", async () => {
    const FilterMenus = await part();
    render(<Harness FilterMenus={FilterMenus} />);

    expect(tagButton()).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^State/ })).not.toBeInTheDocument();
  });
});

describe("SPEC-CORE-147 I3 I12 the candidate list", () => {
  it("SPEC-CORE-147 requests once on open and lists the answer in its order with counts", async () => {
    const FilterMenus = await part();
    render(<Harness FilterMenus={FilterMenus} />);
    expect(loads).toHaveLength(0);

    open();
    await waitFor(() => expect(loads).toHaveLength(1));
    await answer(0, ANSWER);

    expect(rows()).toEqual(["trip9", "food4", "Über2", "cats1"]);
  });

  it("SPEC-CORE-147 I3 lists the chosen tags first in choice order, each once, even at count 0", async () => {
    const FilterMenus = await part();
    render(<Harness FilterMenus={FilterMenus} initial={["cats", "gone"]} />);

    open();
    await waitFor(() => expect(loads).toHaveLength(1));
    await answer(0, ANSWER);

    expect(rows()).toEqual(["cats1", "gone0", "trip9", "food4", "Über2"]);
  });

  it("SPEC-CORE-147 I3 compares names folded, for the chosen tags and for excludeTags", async () => {
    const FilterMenus = await part();
    render(<Harness FilterMenus={FilterMenus} initial={["über"]} excludeTags={["TRIP"]} />);

    open();
    await waitFor(() => expect(loads).toHaveLength(1));
    await answer(0, ANSWER);

    expect(rows()).toHaveLength(3);
    expect(rows()[0]).toMatch(/^über|^Über/);
    expect(rows().slice(1)).toEqual(["food4", "cats1"]);
  });

  it("SPEC-CORE-147 I3 leaves out the Target's own tag conditions", async () => {
    const FilterMenus = await part();
    render(<Harness FilterMenus={FilterMenus} excludeTags={["food"]} />);

    open();
    await waitFor(() => expect(loads).toHaveLength(1));
    await answer(0, ANSWER);

    expect(rows()).toEqual(["trip9", "Über2", "cats1"]);
  });

  it("SPEC-CORE-147 marks the chosen rows checked and the rest unchecked", async () => {
    const FilterMenus = await part();
    render(<Harness FilterMenus={FilterMenus} initial={["food"]} />);

    open();
    await waitFor(() => expect(loads).toHaveLength(1));
    await answer(0, ANSWER);

    expect(row("food")).toHaveAttribute("aria-checked", "true");
    expect(row("trip")).toHaveAttribute("aria-checked", "false");
  });

  it("SPEC-CORE-147 I12 a toggle adds the tag, keeps the menu open and requests again under the new tags", async () => {
    const FilterMenus = await part();
    render(<Harness FilterMenus={FilterMenus} />);
    open();
    await waitFor(() => expect(loads).toHaveLength(1));
    await answer(0, ANSWER);

    fireEvent.click(row("food"));

    expect(tagButton()).toHaveAccessibleName("Tag: food");
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await waitFor(() => expect(loads).toHaveLength(2));
    expect(loads[1].tags).toEqual(["food"]);
  });

  it("SPEC-CORE-147 I12 a second toggle on a chosen row removes it and requests again", async () => {
    const FilterMenus = await part();
    render(<Harness FilterMenus={FilterMenus} initial={["food", "trip"]} />);
    open();
    await waitFor(() => expect(loads).toHaveLength(1));
    await answer(0, ANSWER);

    fireEvent.click(row("food"));

    expect(tagButton()).toHaveAccessibleName("Tag: trip");
    await waitFor(() => expect(loads).toHaveLength(2));
    expect(loads[1].tags).toEqual(["trip"]);
  });

  it("SPEC-CORE-147 keeps the rows already drawn until the reload answers", async () => {
    const FilterMenus = await part();
    render(<Harness FilterMenus={FilterMenus} />);
    open();
    await waitFor(() => expect(loads).toHaveLength(1));
    await answer(0, ANSWER);

    fireEvent.click(row("food"));
    await waitFor(() => expect(loads).toHaveLength(2));

    expect([...rows()].sort()).toEqual(["cats1", "food4", "trip9", "Über2"]);

    await answer(1, [
      { name: "food", count: 4 },
      { name: "trip", count: 3 },
    ]);
    expect(rows()).toEqual(["food4", "trip3"]);
  });

  it("SPEC-CORE-147 I3 never draws an answer for conditions no longer in force", async () => {
    const FilterMenus = await part();
    render(<Harness FilterMenus={FilterMenus} />);
    open();
    await waitFor(() => expect(loads).toHaveLength(1));
    await answer(0, ANSWER);

    fireEvent.click(row("food"));
    await waitFor(() => expect(loads).toHaveLength(2));
    fireEvent.click(row("trip"));
    await waitFor(() => expect(loads).toHaveLength(3));

    await answer(2, [
      { name: "food", count: 1 },
      { name: "trip", count: 1 },
    ]);
    await answer(1, [
      { name: "food", count: 4 },
      { name: "trip", count: 3 },
      { name: "stale", count: 3 },
    ]);

    expect(rows()).toEqual(["food1", "trip1"]);
  });

  it("SPEC-CORE-147 closing the menu drops the answer still out", async () => {
    const FilterMenus = await part();
    render(<Harness FilterMenus={FilterMenus} />);
    open();
    await waitFor(() => expect(loads).toHaveLength(1));
    close();
    await answer(0, [{ name: "stale", count: 1 }]);

    open();
    await waitFor(() => expect(loads).toHaveLength(2));

    expect(screen.queryByText("stale")).not.toBeInTheDocument();
    await answer(1, ANSWER);
    expect(rows()).toEqual(["trip9", "food4", "Über2", "cats1"]);
  });
});

describe("SPEC-CORE-147 the Any row", () => {
  it("SPEC-CORE-147 is checked when no tag is chosen", async () => {
    const FilterMenus = await part();
    render(<Harness FilterMenus={FilterMenus} />);
    open();
    await waitFor(() => expect(loads).toHaveLength(1));
    await answer(0, ANSWER);

    expect(anyRow()).toHaveAttribute("aria-checked", "true");
  });

  it("SPEC-CORE-147 is unchecked with a tag chosen, and clears the choice", async () => {
    const FilterMenus = await part();
    render(<Harness FilterMenus={FilterMenus} initial={["food", "trip"]} />);
    open();
    await waitFor(() => expect(loads).toHaveLength(1));
    await answer(0, ANSWER);
    expect(anyRow()).toHaveAttribute("aria-checked", "false");

    fireEvent.click(anyRow());

    expect(tagButton()).toHaveAccessibleName("Tag: None specified");
  });
});

describe("SPEC-CORE-147 I3 the search field", () => {
  const search = () =>
    screen.queryByRole("searchbox", { name: "Search tags" }) ?? screen.getByRole("textbox", { name: "Search tags" });

  it("SPEC-CORE-147 shows exactly the rows containing the trimmed text, ignoring case", async () => {
    const FilterMenus = await part();
    render(<Harness FilterMenus={FilterMenus} />);
    open();
    await waitFor(() => expect(loads).toHaveLength(1));
    await answer(0, [...ANSWER, { name: "Catalogue", count: 1 }]);

    fireEvent.change(search(), { target: { value: "  CAT " } });

    expect(rows()).toEqual(["cats1", "Catalogue1"]);
  });

  it("SPEC-CORE-147 matches non-ASCII capitals ignoring case", async () => {
    const FilterMenus = await part();
    render(<Harness FilterMenus={FilterMenus} />);
    open();
    await waitFor(() => expect(loads).toHaveLength(1));
    await answer(0, ANSWER);

    fireEvent.change(search(), { target: { value: "über" } });

    expect(rows()).toEqual(["Über2"]);
  });

  it("SPEC-CORE-147 says No matching tags when nothing matches", async () => {
    const FilterMenus = await part();
    render(<Harness FilterMenus={FilterMenus} />);
    open();
    await waitFor(() => expect(loads).toHaveLength(1));
    await answer(0, ANSWER);

    fireEvent.change(search(), { target: { value: "zzz" } });

    expect(rows()).toEqual([]);
    expect(screen.getByText("No matching tags")).toBeInTheDocument();
  });

  it("SPEC-CORE-147 keeps the text across a toggle and clears it when the menu closes", async () => {
    const FilterMenus = await part();
    render(<Harness FilterMenus={FilterMenus} />);
    open();
    await waitFor(() => expect(loads).toHaveLength(1));
    await answer(0, ANSWER);
    fireEvent.change(search(), { target: { value: "fo" } });

    fireEvent.click(row("food"));
    await waitFor(() => expect(loads).toHaveLength(2));
    expect(search()).toHaveValue("fo");

    close();
    open();
    expect(search()).toHaveValue("");
  });
});

describe("SPEC-CORE-147 the empty, loading and failed states", () => {
  it("SPEC-CORE-147 says No tags when the answer is empty and nothing is chosen", async () => {
    const FilterMenus = await part();
    render(<Harness FilterMenus={FilterMenus} />);
    open();
    await waitFor(() => expect(loads).toHaveLength(1));
    await answer(0, []);

    expect(screen.getByText("No tags")).toBeInTheDocument();
  });

  it("SPEC-CORE-147 lists a chosen tag rather than No tags when the answer is empty", async () => {
    const FilterMenus = await part();
    render(<Harness FilterMenus={FilterMenus} initial={["gone"]} />);
    open();
    await waitFor(() => expect(loads).toHaveLength(1));
    await answer(0, []);

    expect(rows()).toEqual(["gone0"]);
    expect(screen.queryByText("No tags")).not.toBeInTheDocument();
  });

  it("SPEC-CORE-147 draws no row, no empty text and no retry while the first request is out", async () => {
    const FilterMenus = await part();
    render(<Harness FilterMenus={FilterMenus} />);
    open();

    expect(
      screen.queryByRole("searchbox", { name: "Search tags" }) ?? screen.getByRole("textbox", { name: "Search tags" }),
    ).toBeInTheDocument();
    expect(rows()).toEqual([]);
    expect(screen.queryByText("No tags")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("SPEC-CORE-147 I9 a failed first request offers Try again, which requests again", async () => {
    const FilterMenus = await part();
    render(<Harness FilterMenus={FilterMenus} initial={["food"]} />);
    open();
    await waitFor(() => expect(loads).toHaveLength(1));
    await fail(0);

    expect(tagButton()).toHaveAccessibleName("Tag: food");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(loads).toHaveLength(2));
    await answer(1, ANSWER);

    expect(rows()).toEqual(["food4", "trip9", "Über2", "cats1"]);
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("SPEC-CORE-147 I9 a failed reload keeps the rows drawn and the chosen tags, with Try again under them", async () => {
    const FilterMenus = await part();
    render(<Harness FilterMenus={FilterMenus} />);
    open();
    await waitFor(() => expect(loads).toHaveLength(1));
    await answer(0, ANSWER);

    fireEvent.click(row("food"));
    await waitFor(() => expect(loads).toHaveLength(2));
    await fail(1);

    expect([...rows()].sort()).toEqual(["cats1", "food4", "trip9", "Über2"]);
    expect(tagButton()).toHaveAccessibleName("Tag: food");
    const retry = screen.getByRole("button", { name: "Try again" });
    const lastRow = screen.getAllByRole("menuitemcheckbox").at(-1)!;
    expect(lastRow.compareDocumentPosition(retry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("SPEC-CORE-147 hands a viewer_required answer to onViewerRejected", async () => {
    const FilterMenus = await part();
    render(<Harness FilterMenus={FilterMenus} />);
    open();
    await waitFor(() => expect(loads).toHaveLength(1));

    await fail(0, Object.assign(new ApiStatusError(400, "API error: 400"), { detail: "viewer_required" }));

    expect(onViewerRejected).toHaveBeenCalledTimes(1);
  });

  it("SPEC-CORE-147 does not call onViewerRejected for another failure", async () => {
    const FilterMenus = await part();
    render(<Harness FilterMenus={FilterMenus} />);
    open();
    await waitFor(() => expect(loads).toHaveLength(1));

    await fail(0);

    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(onViewerRejected).not.toHaveBeenCalled();
  });
});
