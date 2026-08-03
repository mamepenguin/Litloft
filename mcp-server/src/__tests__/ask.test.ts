import { describe, expect, it } from "vitest";
import { askTools } from "../tools/ask.js";
import { fakeClient } from "./testClient.js";

function askTool() {
  const tool = askTools.find((t) => t.name === "ask");
  if (!tool) throw new Error("tool not found: ask");
  return tool;
}

describe("ask", () => {
  it("calls intelligence /ask over SSE and concatenates answer_chunk delta fields", async () => {
    const client = fakeClient(
      async () => {
        throw new Error("request() should not be called by ask");
      },
      undefined,
      undefined,
      async () => [
        { event: "keywords", data: { keywords: "notes" } },
        { event: "sources", data: { sources: [{ file_id: "abc123" }] } },
        { event: "answer_chunk", data: { delta: "hello" } },
        { event: "answer_chunk", data: { delta: " world" } },
        { event: "citations", data: { citations: [{ file_id: "abc123" }] } },
        { event: "done", data: { took_ms: 42 } },
      ]
    );

    const result = await askTool().handler(
      { drive: "media", query: "summarize notes", top_k: 3 },
      client
    );

    expect(client.sseCalls).toEqual([
      {
        method: "POST",
        path: "/api/addons/intelligence/ask",
        options: {
          headers: { "X-Lit-Drive": "media" },
          json: { query: "summarize notes", top_k: 3 },
          timeoutMs: 120_000,
          maxEvents: 4096,
        },
      },
    ]);
    expect(JSON.parse(result.content[0].text)).toEqual({
      answer: "hello world",
      sources: { sources: [{ file_id: "abc123" }] },
      citations: { citations: [{ file_id: "abc123" }] },
      done: { took_ms: 42 },
    });
  });

  it("returns an error result when intelligence finishes with done.error", async () => {
    const client = fakeClient(
      async () => {
        throw new Error("request() should not be called by ask");
      },
      undefined,
      undefined,
      async () => [{ event: "done", data: { error: "Answer generation failed" } }]
    );

    const result = await askTool().handler(
      { drive: "media", query: "summarize notes" },
      client
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Answer generation failed");
  });
});
