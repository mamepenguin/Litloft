import { z } from "zod";
import { runTool } from "./runTool.js";
import { textResult, type LitloftTool } from "./types.js";

const ASK_TIMEOUT_MS = 120_000;
const ASK_MAX_SSE_EVENTS = 4096;

const ask: LitloftTool = {
  name: "ask",
  description:
    "Ask Litloft Intelligence a question within one drive and return the synthesized answer with source events.",
  inputSchema: {
    drive: z.string(),
    query: z.string().min(1).max(1000),
    top_k: z.number().int().min(1).max(20).optional(),
    file_type: z.string().optional(),
  },
  handler: (args, client) =>
    runTool(async () => {
      const { drive, ...body } = args as { drive: string } & Record<string, unknown>;
      const events = await client.requestSse(
        "POST",
        "/api/addons/intelligence/ask",
        {
          headers: { "X-Lit-Drive": drive },
          json: body,
          timeoutMs: ASK_TIMEOUT_MS,
          maxEvents: ASK_MAX_SSE_EVENTS,
        }
      );

      const chunks: string[] = [];
      let sources: unknown = undefined;
      let citations: unknown = undefined;
      let done: unknown = undefined;
      for (const event of events) {
        const data = event.data as Record<string, unknown>;
        if (event.event === "answer_chunk" && typeof data.delta === "string") {
          chunks.push(data.delta);
        } else if (event.event === "sources") {
          sources = data;
        } else if (event.event === "citations") {
          citations = data;
        } else if (event.event === "done") {
          done = data;
        }
      }
      if (
        typeof done === "object" &&
        done !== null &&
        "error" in done
      ) {
        throw new Error(`Litloft ask failed: ${String((done as { error: unknown }).error)}`);
      }

      return textResult({
        answer: chunks.join(""),
        sources,
        citations,
        done,
      });
    }),
};

export const askTools: LitloftTool[] = [ask];
