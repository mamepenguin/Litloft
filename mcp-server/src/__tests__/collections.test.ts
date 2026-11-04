import { describe, expect, it } from "vitest";
import { LitloftApiError } from "../client.js";
import { findTool } from "./toolHarness.js";
import { fakeClient } from "./testClient.js";
import { readOnlyAnnotations } from "../tools/types.js";

const CID = "col000000001";
const DRIVE = "media";

function file(
  id: string,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id,
    filename: `${id}.mp4`,
    title: id,
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    file_size: 10,
    duration: 1.5,
    tags: ["tag"],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    thumbnail_path: "thumbs/a.jpg",
    is_favorite: true,
    likes: 3,
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    ...extra,
  };
}

const SUMMARY_OF_A = {
  id: "file000000aa",
  filename: "file000000aa.mp4",
  title: "file000000aa",
  folder_path: "",
  file_type: "video",
  mime_type: "video/mp4",
  file_size: 10,
  duration: 1.5,
  tags: ["tag"],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
};

function detail(items: unknown[]): Record<string, unknown> {
  return {
    id: CID,
    name: "Set",
    description: null,
    drive: DRIVE,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    items,
  };
}

describe("list_collections", () => {
  it("SPEC-CORE-038 I12: calls GET /api/drives/{drive}/collections and returns the core list unchanged", async () => {
    const coreList = [
      {
        id: CID,
        name: "Set",
        description: null,
        drive: DRIVE,
        item_count: 2,
        first_file_id: "file000000aa",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-02T00:00:00Z",
      },
    ];
    const client = fakeClient(async () => coreList);

    const result = await findTool("list_collections").handler(
      { drive: DRIVE },
      client
    );

    expect(client.calls).toHaveLength(1);
    expect(client.calls[0].method).toBe("GET");
    expect(client.calls[0].path).toBe("/api/drives/media/collections");
    expect(client.calls[0].options?.query).toBeUndefined();
    expect(result.isError).toBeUndefined();
    expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual(coreList);
  });

  it("SPEC-CORE-038 I12: percent-encodes the drive name in the path", async () => {
    const client = fakeClient(async () => []);
    await findTool("list_collections").handler({ drive: "my drive" }, client);
    expect(client.calls[0].path).toBe("/api/drives/my%20drive/collections");
  });
});

describe("get_collection", () => {
  it("SPEC-CORE-038 I12: calls GET /api/drives/{drive}/collections/{id} and never sends fields", async () => {
    const client = fakeClient(async () => detail([]));

    await findTool("get_collection").handler(
      { drive: DRIVE, collection_id: CID, fields: "full" },
      client
    );

    expect(client.calls).toHaveLength(1);
    expect(client.calls[0].method).toBe("GET");
    expect(client.calls[0].path).toBe(
      `/api/drives/media/collections/${CID}`
    );
    expect(client.calls[0].options?.query).toBeUndefined();
    expect(JSON.stringify(client.calls[0].options ?? {})).not.toContain(
      "fields"
    );
  });

  it("SPEC-CORE-038 I12: an item is { item_id, position, file } with the search_files summary by default", async () => {
    const item = { id: 11, position: 0, file: file("file000000aa") };
    const client = fakeClient(async () => detail([item]));

    const result = await findTool("get_collection").handler(
      { drive: DRIVE, collection_id: CID },
      client
    );

    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.items).toEqual([
      { item_id: 11, position: 0, file: SUMMARY_OF_A },
    ]);
  });

  it("SPEC-CORE-038 I12: fields: full returns the whole file object", async () => {
    const full = file("file000000aa");
    const client = fakeClient(async () =>
      detail([{ id: 11, position: 0, file: full }])
    );

    const result = await findTool("get_collection").handler(
      { drive: DRIVE, collection_id: CID, fields: "full" },
      client
    );

    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.items).toEqual([{ item_id: 11, position: 0, file: full }]);
  });

  it("SPEC-CORE-038 I7: lists only active items in the core's order and counts the rest", async () => {
    const activeOne = file("file000000aa");
    const trashed = file("file000000bb", { deleted_at: "2026-02-01T00:00:00Z" });
    const activeTwo = file("file000000cc");
    const missing = file("file000000dd", {
      deleted_at: null,
      missing_since: "2026-02-02T00:00:00Z",
    });
    const items = [
      { id: 11, position: 0, file: activeOne },
      { id: 12, position: 1, file: trashed },
      { id: 13, position: 2, file: activeTwo },
      { id: 14, position: 3, file: missing },
    ];
    const client = fakeClient(async () => detail(items));

    const result = await findTool("get_collection").handler(
      { drive: DRIVE, collection_id: CID },
      client
    );

    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.items.map((entry: { item_id: number }) => entry.item_id)).toEqual(
      [11, 13]
    );
    expect(parsed.inactive_count).toBe(2);
    expect(parsed.inactive_count + parsed.items.length).toBe(items.length);
  });

  it("SPEC-CORE-038 I7: a file without the state keys counts as active", async () => {
    const withoutState: Record<string, unknown> = file("file000000aa");
    delete withoutState.deleted_at;
    delete withoutState.missing_since;
    const client = fakeClient(async () =>
      detail([{ id: 11, position: 0, file: withoutState }])
    );

    const result = await findTool("get_collection").handler(
      { drive: DRIVE, collection_id: CID },
      client
    );

    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.items.map((entry: { item_id: number }) => entry.item_id)).toEqual(
      [11]
    );
    expect(parsed.inactive_count).toBe(0);
  });
});

const notFoundCases = [
  {
    label: "a locked drive, list_collections",
    tool: "list_collections",
    args: { drive: "locked" },
  },
  {
    label: "an unknown drive, list_collections",
    tool: "list_collections",
    args: { drive: "unknown" },
  },
  {
    label: "a locked drive, get_collection",
    tool: "get_collection",
    args: { drive: "locked", collection_id: CID },
  },
  {
    label: "an unknown drive, get_collection",
    tool: "get_collection",
    args: { drive: "unknown", collection_id: CID },
  },
  {
    label: "another drive's collection, get_collection",
    tool: "get_collection",
    args: { drive: "media", collection_id: CID },
  },
];

describe("SPEC-CORE-038 I8", () => {
  it.each(notFoundCases)(
    "$label is an isError result carrying the core's 404",
    async ({ tool, args }) => {
      const client = fakeClient(async () => {
        throw new LitloftApiError(404, { detail: "Collection not found" });
      });

      const result = await findTool(tool).handler(args, client);

      expect(result.isError).toBe(true);
      expect((result.content[0] as { text: string }).text).toContain("Litloft API error (404)");
    }
  );
});

describe("SPEC-CORE-038 I12", () => {
  it("marks both collection tools read-only", () => {
    for (const name of ["list_collections", "get_collection"]) {
      expect(findTool(name).annotations).toEqual(readOnlyAnnotations);
    }
  });

  it.each(["move_file", "move_files"])(
    "%s says a cross-drive move removes the file from the old drive's collections",
    (name) => {
      const description = findTool(name).description;
      expect(description).toMatch(/another drive|different drive/i);
      expect(description).toMatch(/collection/i);
      expect(description).toMatch(/(remov|takes? out|no longer)/i);
    }
  );
});
