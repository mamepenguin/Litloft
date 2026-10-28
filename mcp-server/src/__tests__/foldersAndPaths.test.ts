import { describe, expect, it } from "vitest";
import { LitloftApiError } from "../client.js";
import { fakeClient } from "./testClient.js";
import { allRequests, run } from "./toolHarness.js";

function echoClient(response: unknown) {
  return fakeClient(async () => response);
}

function failingClient(status: number, detail: string) {
  return fakeClient(async () => {
    throw new LitloftApiError(status, { detail });
  });
}

describe("get_file_by_path (SPEC-CORE-012)", () => {
  it("SPEC-CORE-012 I8: sends one GET with the drive URL-encoded and path as the query, returning the file", async () => {
    const file = { id: "abc123456789", filename: "b.md", folder_path: "a" };
    const client = echoClient(file);
    const out = await run("get_file_by_path", { drive: "my drive", path: "a/b.md" }, client);
    expect(client.calls).toEqual([
      {
        method: "GET",
        path: "/api/drives/my%20drive/files/by-path",
        options: { query: { path: "a/b.md" } },
      },
    ]);
    expect(allRequests(client)).toHaveLength(1);
    expect(out.isError).toBe(false);
    expect(JSON.parse(out.text)).toEqual(file);
  });

  it.each([
    [404, "File not found"],
    [400, "Invalid path"],
  ])("SPEC-CORE-012: a backend %i is an error result", async (status, detail) => {
    const out = await run(
      "get_file_by_path",
      { drive: "media", path: "../outside.md" },
      failingClient(status, detail)
    );
    expect(out.isError).toBe(true);
    expect(out.text).toBe(`Litloft API error (${status}): ${detail}`);
  });
});

describe("folder tools (SPEC-CORE-013)", () => {
  it.each([
    [
      "create_folder",
      { drive: "media", name: "new" },
      { method: "POST", path: "/api/drives/media/folders", options: { json: { path: "", name: "new" } } },
    ],
    [
      "create_folder",
      { drive: "media", name: "new", path: "notes/2026" },
      {
        method: "POST",
        path: "/api/drives/media/folders",
        options: { json: { path: "notes/2026", name: "new" } },
      },
    ],
    [
      "rename_folder",
      { drive: "media", path: "notes/old", new_name: "fresh" },
      {
        method: "PUT",
        path: "/api/drives/media/folders",
        options: { json: { path: "notes/old", new_name: "fresh" } },
      },
    ],
    [
      "move_folder",
      { drive: "media", path: "notes/old", target_path: "archive/2025" },
      {
        method: "PUT",
        path: "/api/drives/media/folders/move",
        options: { json: { path: "notes/old", target_path: "archive/2025" } },
      },
    ],
    [
      "trash_folder",
      { drive: "media", path: "notes/old" },
      { method: "DELETE", path: "/api/drives/media/folders", options: { query: { path: "notes/old" } } },
    ],
  ])("SPEC-CORE-013 I8: %s sends exactly its row's request and returns the API response", async (name, args, expected) => {
    const response = { status: "ok", detail: { name } };
    const client = echoClient(response);
    const out = await run(name, args, client);
    expect(client.calls).toEqual([expected]);
    expect(allRequests(client)).toHaveLength(1);
    expect(out.isError).toBe(false);
    expect(JSON.parse(out.text)).toEqual(response);
  });

  it("SPEC-CORE-013 I8: create_folder without path sends path as the empty string, not omitted", async () => {
    const client = echoClient({});
    await run("create_folder", { drive: "media", name: "new" }, client);
    const json = (client.calls[0].options as { json: Record<string, unknown> }).json;
    expect(Object.prototype.hasOwnProperty.call(json, "path")).toBe(true);
    expect(json.path).toBe("");
  });

  it.each([
    ["rename_folder", { drive: "media", path: "gone", new_name: "x" }, 404, "Folder not found"],
    ["move_folder", { drive: "media", path: "gone", target_path: "x" }, 404, "Folder not found"],
    ["trash_folder", { drive: "media", path: "gone" }, 404, "Folder not found"],
    ["create_folder", { drive: "media", name: "dup" }, 409, "Folder already exists"],
    ["rename_folder", { drive: "media", path: "a", new_name: "b" }, 409, "Name taken"],
    ["move_folder", { drive: "media", path: "a", target_path: "b" }, 409, "Name taken"],
    ["trash_folder", { drive: "media", path: "" }, 400, "Cannot delete root"],
  ])("SPEC-CORE-013: %s with %o and a backend %i is an error result", async (name, args, status, detail) => {
    const out = await run(name, args, failingClient(status as number, detail as string));
    expect(out.isError).toBe(true);
    expect(out.text).toBe(`Litloft API error (${status}): ${detail}`);
  });
});
