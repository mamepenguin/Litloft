import { describe, it, expect } from "vitest";

import type { FileRelationItem } from "@/lib/api";
import { groupRelations } from "../groupRelations";

let nextId = 1;

function item(
  counterpart: string,
  direction: FileRelationItem["direction"],
  origin: FileRelationItem["origin"],
  kind = "related",
): FileRelationItem {
  const id = nextId++;
  return {
    relation_id: id,
    kind,
    direction,
    origin,
    created_at: "2026-09-15T00:00:00Z",
    created_by: null,
    file: {
      id: counterpart,
      drive: "main",
      filename: `${counterpart}.md`,
      title: counterpart,
      folder_path: "",
      file_type: "document",
      mime_type: "text/markdown",
      thumbnail_url: `/api/files/${counterpart}/thumbnail`,
      has_thumbnail: false,
      file_size: 1,
      duration: null,
      missing_since: null,
      created_at: "2026-09-15T00:00:00Z",
      updated_at: "2026-09-15T00:00:00Z",
    },
  };
}

const ids = (files: { id: string }[]) => files.map((f) => f.id);

describe("groupRelations", () => {
  it("puts markdown rows by direction and every other row under related", () => {
    const groups = groupRelations([
      item("out", "outgoing", "markdown"),
      item("in", "incoming", "markdown"),
      item("internal-out", "outgoing", "internal"),
      item("internal-in", "incoming", "internal"),
      item("legacy", "incoming", null),
    ]);

    expect(ids(groups.linksFrom)).toEqual(["out"]);
    expect(ids(groups.linksTo)).toEqual(["in"]);
    expect(ids(groups.related)).toEqual([
      "internal-out",
      "internal-in",
      "legacy",
    ]);
  });

  it("lists a mutual link under both links from and links to", () => {
    const groups = groupRelations([
      item("peer", "incoming", "markdown"),
      item("peer", "outgoing", "markdown"),
    ]);

    expect(ids(groups.linksFrom)).toEqual(["peer"]);
    expect(ids(groups.linksTo)).toEqual(["peer"]);
    expect(groups.related).toEqual([]);
  });

  it("lists a counterpart once per section whatever its kinds and directions", () => {
    const groups = groupRelations([
      item("a", "outgoing", "internal", "related"),
      item("a", "incoming", null, "derived_from"),
      item("b", "outgoing", "markdown", "related"),
      item("b", "outgoing", "markdown", "cites"),
      item("c", "incoming", "internal"),
    ]);

    expect(ids(groups.related)).toEqual(["a", "c"]);
    expect(ids(groups.linksFrom)).toEqual(["b"]);
  });

  it("keeps the order it was given", () => {
    const groups = groupRelations([
      item("newest", "outgoing", "markdown"),
      item("middle", "outgoing", "markdown"),
      item("oldest", "outgoing", "markdown"),
    ]);

    expect(ids(groups.linksFrom)).toEqual(["newest", "middle", "oldest"]);
  });

  it("returns three empty sections for no relations", () => {
    expect(groupRelations([])).toEqual({
      linksFrom: [],
      linksTo: [],
      related: [],
    });
  });
});
