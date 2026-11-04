import { describe, expect, it } from "vitest";
import { z } from "zod";
import { allTools } from "../tools/index.js";
import { fakeClient } from "./testClient.js";
import { findTool, run, schemaOf } from "./toolHarness.js";

const NEXT_CURSOR =
  "MjAyNi0xMS0wNFQwOTowMDowMC4wMDAwMDBafGFiYzEyMzQ1Njc4OQ";

const LIST_ANSWER = {
  items: [
    {
      file: {
        id: "abc123456789",
        filename: "clip.md",
        folder_path: "notes",
        file_type: "text",
      },
      arrived_at: "2026-11-04T09:00:00.000000Z",
      source: "web_clip",
      source_i18n_key: "knowledge.inbox.sourceWebClip",
    },
  ],
  next: NEXT_CURSOR,
  open_count: 1,
};

describe("list_inbox", () => {
  it("SPEC-CORE-041 I14: calls GET /api/drives/{drive}/inbox with limit and before", async () => {
    const client = fakeClient(async () => LIST_ANSWER);

    await findTool("list_inbox").handler(
      { drive: "media", limit: 20, before: "cursor" },
      client
    );

    expect(client.calls).toEqual([
      {
        method: "GET",
        path: "/api/drives/media/inbox",
        options: { query: { limit: 20, before: "cursor" } },
      },
    ]);
  });

  it("SPEC-CORE-041 I14: omits the query when neither limit nor before is given", async () => {
    const client = fakeClient(async () => LIST_ANSWER);

    await findTool("list_inbox").handler({ drive: "media" }, client);

    expect(client.calls[0].path).toBe("/api/drives/media/inbox");
    expect(client.calls[0].options?.query ?? {}).toEqual({});
  });

  it("SPEC-CORE-041 I14: URL-encodes the drive name", async () => {
    const client = fakeClient(async () => LIST_ANSWER);

    await findTool("list_inbox").handler({ drive: "my drive" }, client);

    expect(client.calls[0].path).toBe("/api/drives/my%20drive/inbox");
  });

  it("SPEC-CORE-041 I14: returns the listed fields per item and the next cursor", async () => {
    const client = fakeClient(async () => LIST_ANSWER);

    const outcome = await run("list_inbox", { drive: "media" }, client);
    const payload = JSON.parse(outcome.text);

    expect(outcome.isError).toBe(false);
    expect(payload.next).toBe(NEXT_CURSOR);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({
      file_id: "abc123456789",
      filename: "clip.md",
      folder_path: "notes",
      source: "web_clip",
      arrived_at: "2026-11-04T09:00:00.000000Z",
    });
    expect(payload.items[0].file).toBeUndefined();
  });

  it("SPEC-CORE-041 I14: carries a null next through unchanged", async () => {
    const client = fakeClient(async () => ({ ...LIST_ANSWER, next: null }));

    const outcome = await run("list_inbox", { drive: "media" }, client);

    expect(JSON.parse(outcome.text).next).toBeNull();
  });

  it("SPEC-CORE-041 I14: takes a drive and an optional limit and before", () => {
    const schema = schemaOf("list_inbox");

    expect(schema.safeParse({ drive: "media" }).success).toBe(true);
    expect(schema.safeParse({ drive: "media", limit: 1 }).success).toBe(true);
    expect(schema.safeParse({ drive: "media", limit: 100 }).success).toBe(true);
    expect(schema.safeParse({ drive: "media", before: NEXT_CURSOR }).success).toBe(
      true
    );
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ drive: "media", limit: 0 }).success).toBe(false);
    expect(schema.safeParse({ drive: "media", limit: 101 }).success).toBe(false);
  });
});

describe("SPEC-CORE-041 I14: no MCP tool closes an inbox row", () => {
  it("exposes list_inbox as the only inbox tool", () => {
    const inboxTools = allTools
      .filter((tool) => /inbox/i.test(tool.name))
      .map((tool) => tool.name);

    expect(inboxTools).toEqual(["list_inbox"]);
  });

  it("advertises list_inbox as read-only", () => {
    expect(findTool("list_inbox").annotations.readOnlyHint).toBe(true);
  });
});

const CLOSING_TOOLS = [
  "move_file",
  "trash_file",
  "update_tags",
  "edit_file_content",
  "update_file_content",
  "move_files",
  "trash_files",
  "add_tags",
  "trash_folder",
];

describe("SPEC-CORE-041 I14: the tools that can close a row say so", () => {
  it.each(CLOSING_TOOLS)("%s names the inbox", (name) => {
    expect(findTool(name).description.toLowerCase()).toContain("inbox");
  });
});
