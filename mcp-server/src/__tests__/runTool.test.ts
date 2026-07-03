import { describe, expect, it } from "vitest";
import { LitloftApiError } from "../client.js";
import { runTool } from "../tools/runTool.js";

describe("runTool", () => {
  it("passes through a successful result unchanged", async () => {
    const result = await runTool(async () => ({
      content: [{ type: "text", text: "ok" }],
    }));
    expect(result).toEqual({ content: [{ type: "text", text: "ok" }] });
  });

  it("converts a LitloftApiError with a detail field into an isError result", async () => {
    const result = await runTool(async () => {
      throw new LitloftApiError(404, { detail: "Drive not found: secret" });
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("404");
    expect(result.content[0].text).toContain("Drive not found: secret");
  });

  it("converts a LitloftApiError without a detail field into an isError result", async () => {
    const result = await runTool(async () => {
      throw new LitloftApiError(500, { unexpected: true });
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("500");
  });

  it("converts an unexpected error into an isError result", async () => {
    const result = await runTool(async () => {
      throw new Error("network down");
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("network down");
  });
});
