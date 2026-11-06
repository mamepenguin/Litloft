import { describe, expect, it } from "vitest";
import { askTools } from "../tools/ask.js";
import { fakeClient } from "./testClient.js";
import { schemaOf } from "./toolHarness.js";

function askTool() {
  const tool = askTools.find((t) => t.name === "ask");
  if (!tool) throw new Error("tool not found: ask");
  return tool;
}

const SCOPE = {
  folders: ["Work/2024"],
  collections: ["読書メモ"],
  tags: ["会議"],
  kinds: ["pdf" as const],
};

describe("SPEC-CORE-045 the MCP ask tool's scope", () => {
  it("publishes scope as an optional object with canonical kinds only", () => {
    const schema = schemaOf("ask");

    const parsed = schema.parse({
      drive: "media",
      query: "summarize notes",
      scope: SCOPE,
    });
    expect(parsed.scope).toEqual(SCOPE);

    expect(() =>
      schema.parse({
        drive: "media",
        query: "summarize notes",
        scope: { kinds: ["markdown"] },
      })
    ).toThrow();
  });

  it("forwards scope unchanged and returns the stream's scope event", async () => {
    const client = fakeClient(
      async () => {
        throw new Error("request() should not be called by ask");
      },
      undefined,
      undefined,
      async () => [
        {
          event: "scope",
          data: { scope: SCOPE, matched_file_count: 2 },
        },
        { event: "answer_chunk", data: { delta: "hello" } },
        { event: "citations", data: { citations: [] } },
        { event: "done", data: { retrieved_count: 1, took_ms: 5 } },
      ]
    );

    const result = await askTool().handler(
      { drive: "media", query: "summarize notes", scope: SCOPE },
      client
    );

    expect(client.sseCalls[0].options?.json).toMatchObject({ scope: SCOPE });
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      answer: "hello",
      scope: { scope: SCOPE, matched_file_count: 2 },
    });
    expect(result.isError).toBeFalsy();
  });

  it("errors instead of answering unscoped when the server has no scope event", async () => {
    const client = fakeClient(
      async () => {
        throw new Error("request() should not be called by ask");
      },
      undefined,
      undefined,
      async () => [
        { event: "answer_chunk", data: { delta: "whole drive answer" } },
        { event: "citations", data: { citations: [] } },
        { event: "done", data: { retrieved_count: 1 } },
      ]
    );

    const result = await askTool().handler(
      { drive: "media", query: "summarize notes", scope: SCOPE },
      client
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(
      "This Litloft server does not support Ask scope"
    );
  });

  it("returns an empty answer and a zero count for a scope_empty done", async () => {
    const client = fakeClient(
      async () => {
        throw new Error("request() should not be called by ask");
      },
      undefined,
      undefined,
      async () => [
        {
          event: "scope",
          data: { scope: SCOPE, matched_file_count: 0 },
        },
        { event: "citations", data: { citations: [] } },
        {
          event: "done",
          data: { retrieved_count: 0, scope_empty: true, took_ms: 3 },
        },
      ]
    );

    const result = await askTool().handler(
      { drive: "media", query: "summarize notes", scope: SCOPE },
      client
    );

    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0].text);
    expect(body.answer).toBe("");
    expect(body.scope.matched_file_count).toBe(0);
  });

  it("describes scope in the tool description", () => {
    expect(askTool().description).toContain(
      "Pass scope to answer only from files in those folders (and below), collections (by name), tags and kinds of the drive; conditions combine with AND. An empty scope answers with no answer and matched_file_count 0."
    );
  });
});
