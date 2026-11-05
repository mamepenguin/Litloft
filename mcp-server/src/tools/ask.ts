import { z } from "zod";
import { runTool } from "./runTool.js";
import {
  errorResult,
  textResult,
  writeAnnotations,
  type LitloftTool,
} from "./types.js";

const ASK_TIMEOUT_MS = 120_000;
const ASK_MAX_SSE_EVENTS = 4096;

const ask: LitloftTool = {
  name: "ask",
  description:
    "Ask Litloft Intelligence a question within one drive and return the synthesized answer with source events. Retrieved file excerpts may be sent to the LLM provider configured in Litloft Intelligence. Pass scope to answer only from files in those folders (and below), collections (by name), tags and kinds of the drive; conditions combine with AND. An empty scope answers with no answer and matched_file_count 0.",
  inputSchema: {
    drive: z.string(),
    query: z.string().min(1).max(1000),
    top_k: z.number().int().min(1).max(20).optional(),
    file_type: z.string().optional(),
    scope: z
      .object({
        folders: z.array(z.string()).optional(),
        collections: z.array(z.string()).optional(),
        tags: z.array(z.string()).optional(),
        kinds: z
          .array(
            z.enum([
              "video",
              "image",
              "audio",
              "document",
              "archive",
              "other",
              "text",
              "pdf",
            ])
          )
          .optional(),
      })
      .optional(),
  },
  annotations: writeAnnotations({
    destructive: false,
    idempotent: false,
    openWorld: true,
  }),
  handler: (args, client) =>
    runTool(async () => {
      const { drive, ...body } = args as { drive: string } & Record<string, unknown>;
      const sentScope = body.scope !== undefined;
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
      let scope: unknown = undefined;
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
        } else if (event.event === "scope") {
          scope = data;
        }
      }
      if (
        typeof done === "object" &&
        done !== null &&
        "error" in done
      ) {
        throw new Error(`Litloft ask failed: ${String((done as { error: unknown }).error)}`);
      }
      // A server older than this tool ignores `scope` and answers from the
      // whole drive. Its missing scope event is the only signal, so fail
      // rather than return an answer asked with a narrowing it did not apply.
      if (sentScope && scope === undefined) {
        return errorResult(
          "This Litloft server does not support Ask scope"
        );
      }

      return textResult({
        answer: chunks.join(""),
        sources,
        citations,
        done,
        ...(sentScope ? { scope } : {}),
      });
    }),
};

export const askTools: LitloftTool[] = [ask];
