/** SPEC-CORE-118: collections beside Smart Collections in the Target menu and Manage…. */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { readShownTargets, writeShownTargets } from "@/lib/appPrefs";
import type { CollectionSummary } from "@/types";
import type { SmartFolder } from "@/types/smartFolder";
import type { LoadState } from "../useLoad";
import { TargetMenu } from "../TargetMenu";

const DRIVE = "main";

const getDriveFiles = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getDriveFiles: (...args: unknown[]) => getDriveFiles(...args),
}));

function folder(id: string, name: string, query = "tag:x"): SmartFolder {
  return {
    id,
    drive: DRIVE,
    name,
    query,
    file_type: null,
    sort_by: null,
    sort_order: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: null,
  };
}

function collection(id: string, name: string): CollectionSummary {
  return {
    id,
    name,
    description: null,
    drive: DRIVE,
    item_count: 4,
    first_file_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

/** Given in neither name order, as the server's newest-first order would be. */
const FOLDERS = [
  folder("sf-z", "Zeta"),
  folder("sf-i10", "Item 10"),
  folder("sf-same", "Same"),
  folder("sf-low", "beta"),
  folder("bad", "Broken"),
];
const COLLECTIONS = [
  collection("c-same", "Same"),
  collection("c-i2", "Item 2"),
  collection("c-dup-b", "Dup"),
  collection("c-a", "Alpha"),
  collection("c-dup-a", "Dup"),
];

/** Name order under `Intl.Collator("en", { numeric: true })`, a collection first on a tie. */
const ORDERED = [
  "collection:Alpha",
  "smart:beta",
  "smart:Broken",
  "collection:Dup",
  "collection:Dup",
  "collection:Item 2",
  "smart:Item 10",
  "collection:Same",
  "smart:Same",
  "smart:Zeta",
];

const USABLE_SMART_IDS = ["sf-z", "sf-i10", "sf-same", "sf-low"];
const COLLECTION_IDS = COLLECTIONS.map((c) => `collection:${c.id}`);

/** "Broken" stands in for a folder with a query part the app cannot use. */
const isUsable = (candidate: SmartFolder) => candidate.id !== "bad";

const onChoose = vi.fn();
const onRetryFolders = vi.fn();
const retryCollections = vi.fn();

type Props = React.ComponentProps<typeof TargetMenu>;

const loaded = <T,>(data: T): LoadState<T> => ({ status: "loaded", data });

function menu(
  overrides: Partial<Props> = {},
  collections: LoadState<CollectionSummary[]> | null = loaded(COLLECTIONS),
) {
  return (
    <TargetMenu
      drive={DRIVE}
      app="video"
      name="All videos"
      folders={loaded(FOLDERS)}
      selectedId="default"
      currentCount={7}
      label="Target"
      defaultLabel="All videos"
      unavailableLabel="Not available as a target"
      defaultTargetTypes={["video"]}
      isUsable={isUsable}
      onChoose={onChoose}
      onRetryFolders={onRetryFolders}
      {...(collections ? { collections: { list: collections, retry: retryCollections } } : {})}
      {...overrides}
    />
  );
}

function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: /Target/ }));
}

function openManage() {
  openMenu();
  fireEvent.click(screen.getByRole("menuitem", { name: /Manage/ }));
  return screen.getByRole("dialog");
}

function kindOf(row: Element): string {
  if (row.querySelector("svg.lucide-library")) return "collection";
  if (row.querySelector("svg.lucide-list-filter")) return "smart";
  return "none";
}

function describeRow(row: Element): string {
  return `${kindOf(row)}:${(row.textContent ?? "").trim()}`;
}

/** The menu's rows after the default row, as `kind:name`. */
function menuRows(): string[] {
  const rows = screen.getAllByRole("menuitemradio");
  expect(rows[0]).toHaveAccessibleName(/All videos/);
  expect(kindOf(rows[0])).toBe("none");
  return rows.slice(1).map(describeRow);
}

/** The smallest ancestor of a checkbox that also holds its row's text. */
function checklistRow(box: HTMLElement): Element {
  let node: Element | null = box.parentElement;
  while (node && (node.textContent ?? "").trim() === "") node = node.parentElement;
  return node ?? box;
}

function manageRows(): string[] {
  return screen.getAllByRole("checkbox").map((box) => describeRow(checklistRow(box)));
}

const sorted = (ids: readonly string[] | null) => (ids === null ? null : [...ids].sort());

beforeEach(() => {
  localStorage.clear();
  onChoose.mockReset();
  onRetryFolders.mockReset();
  retryCollections.mockReset();
  getDriveFiles.mockReset().mockResolvedValue({ data: [], meta: { total: 12, page: 1, limit: 1 } });
});

describe("SPEC-CORE-118 I1 one name-ordered list of both kinds", () => {
  it("SPEC-CORE-118 I1 lists the default row, then both kinds by name, a collection first on a tie", () => {
    render(menu());
    openMenu();

    expect(menuRows()).toEqual(ORDERED);
  });

  it("SPEC-CORE-118 I1 equal collection names fall back to the id", () => {
    render(menu());
    openMenu();

    fireEvent.click(screen.getAllByRole("menuitemradio", { name: "Dup" })[0]);
    expect(onChoose).toHaveBeenCalledWith("collection:c-dup-a");
  });

  it("SPEC-CORE-118 I1 a collection row is never disabled, whatever isUsable says", () => {
    render(menu({ isUsable: () => false }));
    openMenu();

    for (const row of screen.getAllByRole("menuitemradio")) {
      if (kindOf(row) === "collection") expect(row).not.toBeDisabled();
      if (kindOf(row) === "smart") expect(row).toBeDisabled();
    }
    expect(screen.getByRole("menuitemradio", { name: "Alpha" })).not.toBeDisabled();
  });

  it("SPEC-CORE-118 step 1, I6 a menu given no collections lists no collection, Smart Collections by name", () => {
    render(menu({}, null));
    openMenu();

    expect(menuRows()).toEqual(["smart:beta", "smart:Broken", "smart:Item 10", "smart:Same", "smart:Zeta"]);
  });
});

describe("SPEC-CORE-118 step 3: choosing and the checked row", () => {
  it("SPEC-CORE-118 I2 a collection row chooses collection:<id>, a Smart Collection row its bare id", () => {
    render(menu());
    openMenu();
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Alpha" }));
    expect(onChoose).toHaveBeenLastCalledWith("collection:c-a");

    openMenu();
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Zeta" }));
    expect(onChoose).toHaveBeenLastCalledWith("sf-z");
  });

  it("SPEC-CORE-118 step 3 the row whose target id is selectedId is checked", () => {
    render(menu({ selectedId: "collection:c-i2", name: "Item 2" }));
    openMenu();

    expect(screen.getByRole("menuitemradio", { name: "Item 2" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemradio", { name: "Item 10" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getAllByRole("menuitemradio")[0]).toHaveAttribute("aria-checked", "false");
  });
});

describe("SPEC-CORE-118 I5 the shown set over both kinds", () => {
  it("SPEC-CORE-118 I5 a saved set lists exactly its members", () => {
    writeShownTargets(DRIVE, ["collection:c-a", "sf-z"]);
    render(menu());
    openMenu();

    expect(menuRows()).toEqual(["collection:Alpha", "smart:Zeta"]);
  });

  it("SPEC-CORE-118 step 4 a set saved with Smart Collections only lists no collection", () => {
    writeShownTargets(DRIVE, ["sf-z"]);
    render(menu());
    openMenu();

    expect(menuRows()).toEqual(["smart:Zeta"]);
  });

  it("SPEC-CORE-118 I5 an empty saved set lists none, and Manage… offers every collection unchecked", () => {
    writeShownTargets(DRIVE, []);
    render(menu());
    openMenu();

    expect(menuRows()).toEqual([]);

    fireEvent.click(screen.getByRole("menuitem", { name: /Manage/ }));
    for (const id of COLLECTIONS) {
      for (const box of screen.getAllByRole("checkbox", { name: id.name })) expect(box).not.toBeChecked();
    }
    expect(screen.getAllByRole("checkbox").length).toBe(FOLDERS.length + COLLECTIONS.length);
  });

  it("SPEC-CORE-118 I5 saved ids in neither loaded list are ignored", () => {
    writeShownTargets(DRIVE, ["collection:gone", "gone", "sf-z"]);
    render(menu());
    openMenu();

    expect(menuRows()).toEqual(["smart:Zeta"]);
  });

  it("SPEC-CORE-118 I1 a current collection outside the set is listed at its place in the order", () => {
    writeShownTargets(DRIVE, ["sf-z", "sf-low"]);
    render(menu({ selectedId: "collection:c-i2", name: "Item 2" }));
    openMenu();

    expect(menuRows()).toEqual(["smart:beta", "collection:Item 2", "smart:Zeta"]);
  });

  it("SPEC-CORE-118 I1 a current Smart Collection outside the set is listed at its place, not appended", () => {
    writeShownTargets(DRIVE, ["sf-z"]);
    render(menu({ selectedId: "sf-low", name: "beta" }));
    openMenu();

    expect(menuRows()).toEqual(["smart:beta", "smart:Zeta"]);
  });
});

describe("SPEC-CORE-118 step 5: Manage… over both kinds", () => {
  it("SPEC-CORE-118 I1 lists both kinds in the menu's order with their icons", () => {
    render(menu());
    openManage();

    expect(manageRows()).toEqual(ORDERED);
  });

  it("SPEC-CORE-118 step 5 checks every collection when nothing was ever saved, none disabled", () => {
    render(menu({ isUsable: () => false }));
    openManage();

    for (const name of ["Alpha", "Item 2", "Same"]) {
      const box = screen.getAllByRole("checkbox", { name })[0];
      expect(box).toBeChecked();
      expect(box).not.toBeDisabled();
    }
  });

  it("SPEC-CORE-118 I5 the first toggle saves every usable Smart Collection and every collection, then the toggle", async () => {
    render(menu());
    openManage();
    fireEvent.click(screen.getByRole("checkbox", { name: "Alpha" }));

    const expected = [...USABLE_SMART_IDS, ...COLLECTION_IDS.filter((id) => id !== "collection:c-a")];
    await waitFor(() => expect(sorted(readShownTargets(DRIVE))).toEqual(sorted(expected)));
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("SPEC-CORE-118 I5 toggling a collection on adds collection:<id> to an empty set", async () => {
    writeShownTargets(DRIVE, []);
    render(menu());
    openManage();

    expect(screen.getByRole("checkbox", { name: "Item 2" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "Item 2" }));

    await waitFor(() => expect(readShownTargets(DRIVE)).toEqual(["collection:c-i2"]));
  });

  it("SPEC-CORE-118 I5 a toggle writes the checked entries of both lists and drops ids in neither", async () => {
    writeShownTargets(DRIVE, ["sf-z", "collection:gone", "gone", "collection:c-a"]);
    render(menu());
    openManage();
    fireEvent.click(screen.getByRole("checkbox", { name: "Item 2" }));

    await waitFor(() =>
      expect(sorted(readShownTargets(DRIVE))).toEqual(sorted(["sf-z", "collection:c-a", "collection:c-i2"])),
    );
  });

  it("SPEC-CORE-118 I5 a toggle changes only this app's and this drive's set, never the current target", async () => {
    writeShownTargets(DRIVE, ["collection:c-a"]);
    render(menu({ selectedId: "collection:c-a", name: "Alpha" }));
    openManage();
    fireEvent.click(screen.getByRole("checkbox", { name: "Alpha" }));

    await waitFor(() => expect(readShownTargets(DRIVE)).toEqual([]));
    expect(onChoose).not.toHaveBeenCalled();
    expect(readShownTargets(DRIVE, "reading")).toBeNull();
    expect(readShownTargets("other")).toBeNull();
  });

  it("SPEC-CORE-118 the search field is named Search targets and filters both kinds", () => {
    render(menu());
    openManage();

    const search = screen.getByRole("searchbox", { name: "Search targets" });
    expect(search).toHaveAttribute("placeholder", "Search targets");
    fireEvent.change(search, { target: { value: "item" } });

    expect(manageRows()).toEqual(["collection:Item 2", "smart:Item 10"]);
  });
});

describe("SPEC-CORE-118 step 5, I7: a list still loading", () => {
  it("SPEC-CORE-118 I7 while collections load, the menu offers the Smart Collections and Manage… allows no toggle", () => {
    render(menu({}, { status: "loading" }));
    openMenu();

    expect(menuRows()).toEqual(["smart:beta", "smart:Broken", "smart:Item 10", "smart:Same", "smart:Zeta"]);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Zeta" }));
    expect(onChoose).toHaveBeenCalledWith("sf-z");

    openManage();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.length).toBe(FOLDERS.length);
    for (const box of boxes) expect(box).toBeDisabled();
  });

  it("SPEC-CORE-118 I7 while Smart Collections load, the menu offers the collections and Manage… allows no toggle", () => {
    render(menu({ folders: { status: "loading" } }));
    openMenu();

    expect(menuRows()).toEqual([
      "collection:Alpha",
      "collection:Dup",
      "collection:Dup",
      "collection:Item 2",
      "collection:Same",
    ]);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Alpha" }));
    expect(onChoose).toHaveBeenCalledWith("collection:c-a");

    openManage();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.length).toBe(COLLECTIONS.length);
    for (const box of boxes) expect(box).toBeDisabled();
  });
});

describe("SPEC-CORE-118 failure cases, I7: a list that failed", () => {
  it("SPEC-CORE-118 I7 collections failed: the menu keeps the Smart Collections, Manage… retries the collections only", () => {
    render(menu({}, { status: "failed" }));
    openMenu();

    expect(menuRows()).toEqual(["smart:beta", "smart:Broken", "smart:Item 10", "smart:Same", "smart:Zeta"]);

    openManage();
    expect(screen.queryAllByRole("checkbox")).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(retryCollections).toHaveBeenCalledTimes(1);
    expect(onRetryFolders).not.toHaveBeenCalled();
  });

  it("SPEC-CORE-118 I7 Smart Collections failed: the menu keeps the collections, Manage… retries the Smart Collections only", () => {
    render(menu({ folders: { status: "failed" } }));
    openMenu();

    expect(menuRows()).toEqual([
      "collection:Alpha",
      "collection:Dup",
      "collection:Dup",
      "collection:Item 2",
      "collection:Same",
    ]);

    openManage();
    expect(screen.queryAllByRole("checkbox")).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(onRetryFolders).toHaveBeenCalledTimes(1);
    expect(retryCollections).not.toHaveBeenCalled();
  });

  it("SPEC-CORE-118 I7 both failed: one retry asks again for both", () => {
    render(menu({ folders: { status: "failed" } }, { status: "failed" }));
    openManage();

    expect(screen.queryAllByRole("checkbox")).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(onRetryFolders).toHaveBeenCalledTimes(1);
    expect(retryCollections).toHaveBeenCalledTimes(1);
  });
});
