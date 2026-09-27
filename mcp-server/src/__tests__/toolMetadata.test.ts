import { describe, expect, it } from "vitest";
import { askTools } from "../tools/ask.js";
import { readTools } from "../tools/read.js";
import { allTools } from "../tools/index.js";
import { writeTools } from "../tools/write.js";

const destructiveWrites = new Set([
  "move_file",
  "rename_file",
  "trash_file",
  "update_file_content",
  "update_tags",
]);

describe("tool safety metadata", () => {
  it("annotates every advertised tool", () => {
    for (const tool of allTools) {
      expect(tool.annotations, tool.name).toEqual({
        readOnlyHint: expect.any(Boolean),
        destructiveHint: expect.any(Boolean),
        idempotentHint: expect.any(Boolean),
        openWorldHint: expect.any(Boolean),
      });
    }
  });

  it("marks library reads as read-only", () => {
    for (const tool of readTools) {
      expect(tool.annotations.readOnlyHint, tool.name).toBe(true);
      expect(tool.annotations.destructiveHint, tool.name).toBe(false);
    }
  });

  it("marks Ask as an open-world action because it can send excerpts to an LLM", () => {
    expect(askTools[0].annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    });
  });

  it("marks replacement, relocation, and trash operations as destructive", () => {
    for (const tool of writeTools) {
      expect(tool.annotations.readOnlyHint, tool.name).toBe(false);
      expect(tool.annotations.destructiveHint, tool.name).toBe(
        destructiveWrites.has(tool.name)
      );
    }
  });

  it("marks URL clipping as open-world access", () => {
    for (const tool of allTools) {
      expect(tool.annotations.openWorldHint, tool.name).toBe(
        tool.name === "ask" || tool.name === "clip_url"
      );
    }
  });
});
