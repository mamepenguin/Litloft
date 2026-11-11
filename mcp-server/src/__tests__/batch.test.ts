import { describe, expect, it } from "vitest";
import { LitloftApiError } from "../client.js";
import { fakeClient } from "./testClient.js";
import { allRequests, run, schemaOf } from "./toolHarness.js";

const ID_A = "abc123456789";
const ID_B = "Z_-9y8x7w6v5";

function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `id${String(i).padStart(10, "0")}`);
}

function echoClient(response: unknown) {
  return fakeClient(async () => response);
}

function bodyOf(client: ReturnType<typeof echoClient>): Record<string, unknown> {
  return (client.calls[0].options as { json: Record<string, unknown> }).json;
}

describe("batch tools request mapping (SPEC-CORE-014)", () => {
  it.each([
    [
      "move_files",
      { file_ids: [ID_A, ID_B], target_folder_path: "archive" },
      { method: "PUT", path: "/api/files/batch/move", options: { json: { ids: [ID_A, ID_B], target_folder_path: "archive" } } },
    ],
    [
      "move_files",
      { file_ids: [ID_A], target_folder_path: "", target_drive: "other" },
      {
        method: "PUT",
        path: "/api/files/batch/move",
        options: { json: { ids: [ID_A], target_folder_path: "", target_drive: "other" } },
      },
    ],
    [
      "copy_files",
      { file_ids: [ID_A, ID_B], target_folder_path: "copies" },
      { method: "POST", path: "/api/files/batch/copy", options: { json: { ids: [ID_A, ID_B], target_folder_path: "copies" } } },
    ],
    [
      "copy_files",
      { file_ids: [ID_A], target_folder_path: "x", target_drive: "other" },
      {
        method: "POST",
        path: "/api/files/batch/copy",
        options: { json: { ids: [ID_A], target_folder_path: "x", target_drive: "other" } },
      },
    ],
    [
      "trash_files",
      { file_ids: [ID_A, ID_B] },
      { method: "POST", path: "/api/files/batch/delete", options: { json: { ids: [ID_A, ID_B] } } },
    ],
    [
      "restore_files",
      { file_ids: [ID_A] },
      { method: "POST", path: "/api/files/batch/restore", options: { json: { ids: [ID_A] } } },
    ],
    [
      "add_tags",
      { file_ids: [ID_A, ID_B], tags: ["trip", "2026"] },
      { method: "PUT", path: "/api/files/batch/tags", options: { json: { ids: [ID_A, ID_B], tags: ["trip", "2026"] } } },
    ],
  ])("SPEC-CORE-014 I8: %s sends exactly its row's request and returns the API response", async (name, args, expected) => {
    const response = { count: 2, errors: [] };
    const client = echoClient(response);
    const out = await run(name, args, client);
    expect(client.calls).toEqual([expected]);
    expect(allRequests(client)).toHaveLength(1);
    expect(out.isError).toBe(false);
    expect(JSON.parse(out.text)).toEqual(response);
  });

  it.each(["move_files", "copy_files"])(
    "SPEC-CORE-014 I8: %s leaves target_drive out of the body when not given and never sends file_ids",
    async (name) => {
      const client = echoClient({ count: 1, errors: [] });
      await run(name, { file_ids: [ID_A], target_folder_path: "x" }, client);
      const body = bodyOf(client);
      expect(Object.keys(body).sort()).toEqual(["ids", "target_folder_path"]);
    }
  );

  it.each([
    ["trash_files", { file_ids: [ID_A] }, ["ids"]],
    ["restore_files", { file_ids: [ID_A] }, ["ids"]],
    ["add_tags", { file_ids: [ID_A], tags: ["t"] }, ["ids", "tags"]],
  ])("SPEC-CORE-014 I8: %s's body carries only %o", async (name, args, keys) => {
    const client = echoClient({ count: 1, errors: [] });
    await run(name, args, client);
    expect(Object.keys(bodyOf(client)).sort()).toEqual([...keys].sort());
  });

  it.each(["move_files", "copy_files", "trash_files", "restore_files", "add_tags"])(
    "SPEC-CORE-014 I6: %s reaches no permanent-delete endpoint",
    async (name) => {
      const client = echoClient({ count: 1, errors: [] });
      await run(name, { file_ids: [ID_A], target_folder_path: "x", tags: ["t"] }, client);
      for (const req of allRequests(client)) {
        expect(req.path).not.toMatch(/purge|empty/);
        expect(req.method).not.toBe("DELETE");
      }
    }
  );
});

describe("batch tools results (SPEC-CORE-014)", () => {
  it("SPEC-CORE-014 I7: a partial failure is the API's count and errors as a normal result", async () => {
    const response = {
      count: 1,
      errors: [{ id: ID_B, error: "A file with that name already exists" }],
    };
    const out = await run(
      "move_files",
      { file_ids: [ID_A, ID_B], target_folder_path: "archive" },
      echoClient(response)
    );
    expect(out.isError).toBe(false);
    expect(JSON.parse(out.text)).toEqual(response);
  });

  it.each([
    ["add_tags", { file_ids: [ID_A], tags: ["bad tag!"] }, 422, "Invalid tag"],
    ["move_files", { file_ids: [ID_A], target_folder_path: "", target_drive: "locked" }, 404, "Drive not found"],
    ["copy_files", { file_ids: [ID_A], target_folder_path: "", target_drive: "locked" }, 403, "Forbidden"],
  ])("SPEC-CORE-014: %s with %o and a backend %i is an error result", async (name, args, status, detail) => {
    const client = fakeClient(async () => {
      throw new LitloftApiError(status as number, { detail });
    });
    const out = await run(name, args, client);
    expect(out.isError).toBe(true);
    expect(out.text).toBe(`Litloft API error (${status}): ${detail}`);
  });
});

describe("batch tools argument limits (SPEC-CORE-014)", () => {
  const extra: Record<string, Record<string, unknown>> = {
    move_files: { target_folder_path: "x" },
    copy_files: { target_folder_path: "x" },
    trash_files: {},
    restore_files: {},
    add_tags: { tags: ["t"] },
  };
  const names = Object.keys(extra);

  it.each(names)("SPEC-CORE-014 I7: %s accepts 1 and 100 well-formed ids", (name) => {
    const schema = schemaOf(name);
    expect(schema.safeParse({ ...extra[name], file_ids: [ID_A] }).success).toBe(true);
    expect(schema.safeParse({ ...extra[name], file_ids: [ID_B] }).success).toBe(true);
    expect(schema.safeParse({ ...extra[name], file_ids: ids(100) }).success).toBe(true);
  });

  it.each(
    names.flatMap((name) =>
      [
        ["0 ids", []],
        ["101 ids", ids(101)],
        ["an 11-character id", [ID_A, "abc12345678"]],
        ["a 13-character id", ["abc1234567890"]],
        ["an id with '.'", ["abc12345678."]],
        ["an id with '/'", ["abc/23456789"]],
        ["an id with a space", ["abc 23456789"]],
      ].map(([label, fileIds]) => [name, label, fileIds] as const)
    )
  )("SPEC-CORE-014 I7: %s rejects %s in its schema", (name, _label, fileIds) => {
    expect(schemaOf(name).safeParse({ ...extra[name], file_ids: fileIds }).success).toBe(false);
  });

  it("SPEC-CORE-014 I7: add_tags takes 1 to 10 tags", () => {
    const schema = schemaOf("add_tags");
    const tags = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`);
    expect(schema.safeParse({ file_ids: [ID_A], tags: tags(1) }).success).toBe(true);
    expect(schema.safeParse({ file_ids: [ID_A], tags: tags(10) }).success).toBe(true);
    expect(schema.safeParse({ file_ids: [ID_A], tags: [] }).success).toBe(false);
    expect(schema.safeParse({ file_ids: [ID_A], tags: tags(11) }).success).toBe(false);
  });
});
