import { describe, expect, it } from "vitest";

import {
  BROWSE_LIMIT,
  browseFolderHref,
  browseKeyAction,
  browseRowHref,
  filterBrowseRows,
  launchKeyAction,
  startsRootBrowse,
} from "../folderBrowse";

const folderNode = (path: string) => ({ kind: "folder" as const, name: path.split("/").pop()!, path });
const fileNode = (id: string, name: string, path: string) => ({
  kind: "file" as const,
  name,
  path,
  file_id: id,
  file_type: "video",
});

describe("filterBrowseRows", () => {
  const nodes = [folderNode("trips/2024"), folderNode("trips/Kyoto"), fileNode("f1", "kyoto.mp4", "trips/kyoto.mp4")];

  it("keeps every row, in the given order, for an empty filter", () => {
    expect(filterBrowseRows(nodes, "  ").map((n) => n.name)).toEqual(["2024", "Kyoto", "kyoto.mp4"]);
  });

  it("matches names by substring, ignoring case and width", () => {
    expect(filterBrowseRows(nodes, "ＫＹＯ").map((n) => n.name)).toEqual(["Kyoto", "kyoto.mp4"]);
  });

  it(`keeps at most ${BROWSE_LIMIT} rows`, () => {
    const many = Array.from({ length: BROWSE_LIMIT + 5 }, (_, i) => fileNode(`f${i}`, `f${i}`, `f${i}`));
    expect(filterBrowseRows(many, "")).toHaveLength(BROWSE_LIMIT);
  });
});

describe("hrefs", () => {
  it.each([
    ["", "/drive/my%20drive"],
    ["a b/c#d", "/drive/my%20drive/a%20b/c%23d"],
  ])("browsed folder %j", (path, href) => {
    expect(browseFolderHref("my drive", path)).toBe(href);
  });

  it("opens a folder row at its folder page and a file row at its detail page", () => {
    expect(browseRowHref("main", folderNode("trips/kyoto"))).toBe("/drive/main/trips/kyoto");
    expect(browseRowHref("main", fileNode("f1", "a.mp4", "trips/a.mp4"))).toBe("/files/f1");
  });
});

describe("launchKeyAction (outside browse mode)", () => {
  const jumps = [
    { key: "fixed:trash" },
    { key: "folder:trips", folderPath: "trips" },
  ];
  it.each([
    ["→ on a folder row enters it", "ArrowRight", 1, false, "trips"],
    ["→ on a page row does nothing new", "ArrowRight", 0, false, null],
    ["→ with nothing highlighted moves the caret", "ArrowRight", -1, false, null],
    ["→ with a scope does nothing new", "ArrowRight", 1, true, null],
    ["other keys do nothing new", "ArrowLeft", 1, false, null],
  ])("%s", (_, key, selected, scoped, expected) => {
    expect(launchKeyAction(key, selected, jumps, scoped)).toBe(expected);
  });

  it.each([
    ["", "/", true],
    ["a", "a/", false],
    ["", "／", false],
    ["", "a", false],
  ])("%j → %j starts at the root: %s", (previous, next, expected) => {
    expect(startsRootBrowse(previous, next)).toBe(expected);
  });
});

describe("browseKeyAction (in browse mode)", () => {
  const rows = [folderNode("trips/kyoto"), fileNode("f1", "a.mp4", "trips/a.mp4")];
  it.each([
    ["↓ moves down", "ArrowDown", "", -1, { kind: "move", index: 0 }],
    ["↓ stops at the last row", "ArrowDown", "", 1, { kind: "move", index: 1 }],
    ["↑ moves up to nothing", "ArrowUp", "", 0, { kind: "move", index: -1 }],
    ["→ on a folder enters it", "ArrowRight", "", 0, { kind: "enter", path: "trips/kyoto" }],
    ["→ on a file does nothing", "ArrowRight", "", 1, { kind: "none" }],
    ["← on an empty input goes up", "ArrowLeft", "", -1, { kind: "up" }],
    ["Backspace on an empty input goes up", "Backspace", "", 0, { kind: "up" }],
    ["← with text moves the caret", "ArrowLeft", "ky", -1, { kind: "none" }],
    ["Backspace with text deletes", "Backspace", "ky", -1, { kind: "none" }],
    ["Enter opens the highlighted row", "Enter", "", 1, { kind: "open", row: rows[1] }],
    ["Enter with nothing highlighted opens the folder", "Enter", "", -1, { kind: "open", row: null }],
    ["other keys type", "a", "", -1, { kind: "none" }],
  ])("%s", (_, key, query, selected, expected) => {
    expect(browseKeyAction(key, query, selected, rows)).toEqual(expected);
  });
});
