import { describe, expect, it } from "vitest";
import { fakeClient } from "./testClient.js";
import { writeTools } from "../tools/write.js";

function findTool(name: string) {
  const tool = writeTools.find((t) => t.name === name);
  if (!tool) throw new Error(`tool not found: ${name}`);
  return tool;
}

describe("rename_file", () => {
  it("calls PUT /api/files/{file_id}/rename with new_filename body", async () => {
    const client = fakeClient(async () => ({ id: "abc123456789" }));
    await findTool("rename_file").handler(
      { file_id: "abc123456789", new_filename: "new.md" },
      client
    );
    expect(client.calls).toEqual([
      {
        method: "PUT",
        path: "/api/files/abc123456789/rename",
        options: { json: { new_filename: "new.md" } },
      },
    ]);
  });
});

describe("move_file", () => {
  it("calls PUT /api/files/{file_id}/move with the remaining args as body", async () => {
    const client = fakeClient(async () => ({ id: "abc123456789" }));
    await findTool("move_file").handler(
      { file_id: "abc123456789", target_folder_path: "notes/archive" },
      client
    );
    expect(client.calls).toEqual([
      {
        method: "PUT",
        path: "/api/files/abc123456789/move",
        options: { json: { target_folder_path: "notes/archive" } },
      },
    ]);
  });
});

describe("trash_file", () => {
  it("calls DELETE /api/files/{file_id} (soft delete, not purge)", async () => {
    const client = fakeClient(async () => ({ status: "deleted" }));
    await findTool("trash_file").handler({ file_id: "abc123456789" }, client);
    expect(client.calls).toEqual([
      { method: "DELETE", path: "/api/files/abc123456789", options: undefined },
    ]);
  });
});

describe("restore_file", () => {
  it("calls POST /api/files/{file_id}/restore", async () => {
    const client = fakeClient(async () => ({ id: "abc123456789" }));
    await findTool("restore_file").handler({ file_id: "abc123456789" }, client);
    expect(client.calls).toEqual([
      { method: "POST", path: "/api/files/abc123456789/restore", options: undefined },
    ]);
  });
});

describe("update_tags", () => {
  it("calls PUT /api/files/{file_id}/tags with the full tag list", async () => {
    const client = fakeClient(async () => ({ id: "abc123456789" }));
    await findTool("update_tags").handler(
      { file_id: "abc123456789", tags: ["a", "b"] },
      client
    );
    expect(client.calls).toEqual([
      {
        method: "PUT",
        path: "/api/files/abc123456789/tags",
        options: { json: { tags: ["a", "b"] } },
      },
    ]);
  });
});

describe("update_file_content", () => {
  it("calls requestRaw PUT with If-Match and raw text body, returns the new ETag", async () => {
    const client = fakeClient(
      async () => {
        throw new Error("request() should not be called by update_file_content");
      },
      async () => ({
        status: 200,
        headers: new Headers({ ETag: '"new-etag"' }),
        text: "",
      })
    );
    const result = await findTool("update_file_content").handler(
      { file_id: "abc123456789", content: "new body", etag: '"old-etag"' },
      client
    );
    expect(client.rawCalls).toEqual([
      {
        method: "PUT",
        path: "/api/files/abc123456789/content",
        options: {
          body: "new body",
          headers: { "If-Match": '"old-etag"', "Content-Type": "text/plain" },
        },
      },
    ]);
    expect(JSON.parse(result.content[0].text)).toEqual({ etag: '"new-etag"' });
  });
});

describe("create_playlist", () => {
  it("calls POST /api/drives/{drive}/collections with name/description body", async () => {
    const client = fakeClient(async () => ({ id: "col1" }));
    await findTool("create_playlist").handler(
      { drive: "media", name: "Favorites", description: "my faves" },
      client
    );
    expect(client.calls).toEqual([
      {
        method: "POST",
        path: "/api/drives/media/collections",
        options: { json: { name: "Favorites", description: "my faves" } },
      },
    ]);
  });
});

describe("add_to_playlist", () => {
  it("calls POST /api/drives/{drive}/collections/{collection_id}/items with file_ids", async () => {
    const client = fakeClient(async () => ({ id: "col1", items: [] }));
    await findTool("add_to_playlist").handler(
      { drive: "media", collection_id: "col1", file_ids: ["a", "b"] },
      client
    );
    expect(client.calls).toEqual([
      {
        method: "POST",
        path: "/api/drives/media/collections/col1/items",
        options: { json: { file_ids: ["a", "b"] } },
      },
    ]);
  });
});

describe("upload_file", () => {
  it("runs init -> single chunk -> complete and returns the created file", async () => {
    const contentBytes = Buffer.from("hello world", "utf-8");
    const contentBase64 = contentBytes.toString("base64");

    const client = fakeClient(
      async (call) => {
        if (call.path === "/api/drives/media/upload/init") {
          return { upload_id: "up1", chunk_size: contentBytes.length, total_chunks: 1 };
        }
        if (call.path === "/api/drives/media/upload/up1/complete") {
          return { id: "newfile123456" };
        }
        throw new Error(`unexpected request() call: ${call.path}`);
      },
      undefined,
      async (call) => {
        expect(call.path).toBe("/api/drives/media/upload/up1/chunk");
        expect(call.form.get("chunk_index")).toBe("0");
        const chunk = call.form.get("chunk") as File;
        expect(chunk.name).toBe("note.md");
        return { chunk_index: 0, received_chunks: 1, total_chunks: 1 };
      }
    );

    const result = await findTool("upload_file").handler(
      { drive: "media", filename: "note.md", content_base64: contentBase64 },
      client
    );

    expect(client.calls[0]).toEqual({
      method: "POST",
      path: "/api/drives/media/upload/init",
      options: {
        json: {
          filename: "note.md",
          file_size: contentBytes.length,
          folder_path: "",
          chunk_size: contentBytes.length,
        },
      },
    });
    expect(client.multipartCalls).toHaveLength(1);
    expect(client.calls[1]).toEqual({
      method: "POST",
      path: "/api/drives/media/upload/up1/complete",
      options: undefined,
    });
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toEqual({ id: "newfile123456" });
  });

  it("passes folder_path through to init when provided", async () => {
    const contentBase64 = Buffer.from("x").toString("base64");
    const client = fakeClient(
      async (call) => {
        if (call.path === "/api/drives/media/upload/init") {
          return { upload_id: "up1", chunk_size: 1, total_chunks: 1 };
        }
        return { id: "f" };
      },
      undefined,
      async () => ({ chunk_index: 0, received_chunks: 1, total_chunks: 1 })
    );
    await findTool("upload_file").handler(
      { drive: "media", filename: "x.md", content_base64: contentBase64, folder_path: "notes/inbox" },
      client
    );
    expect((client.calls[0].options as any).json.folder_path).toBe("notes/inbox");
  });

  it("rejects empty decoded content without calling the API", async () => {
    const client = fakeClient(async () => {
      throw new Error("request() should not be called");
    });
    const result = await findTool("upload_file").handler(
      { drive: "media", filename: "empty.md", content_base64: "" },
      client
    );
    expect(client.calls).toEqual([]);
    expect(result.content[0].text).toContain("empty");
  });

  it("rejects content over the 10MB cap without calling the API", async () => {
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1, 1).toString("base64");
    const client = fakeClient(async () => {
      throw new Error("request() should not be called");
    });
    const result = await findTool("upload_file").handler(
      { drive: "media", filename: "big.bin", content_base64: oversized },
      client
    );
    expect(client.calls).toEqual([]);
    expect(result.content[0].text).toContain("exceeds");
  });
});

describe("purge exclusion", () => {
  it("does not register a purge tool (irreversible physical delete is intentionally excluded)", () => {
    expect(writeTools.some((t) => t.name.includes("purge"))).toBe(false);
  });
});
