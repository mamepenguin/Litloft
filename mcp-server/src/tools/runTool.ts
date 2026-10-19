import { LitloftApiError } from "../client.js";
import type { ToolTextResult } from "./types.js";

// MCP best practice: a failed tool call should surface as a normal result
// with isError=true (so the model can read and react to it), not as a
// JSON-RPC protocol-level error. Litloft 4xx responses (e.g. drive-not-
// found 404, tag validation 422) are meaningful information for the agent,
// not exceptional failures.
export async function runTool(fn: () => Promise<ToolTextResult>): Promise<ToolTextResult> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof LitloftApiError) {
      const detail =
        typeof err.body === "object" && err.body !== null && "detail" in err.body
          ? String((err.body as { detail: unknown }).detail)
          : JSON.stringify(err.body);
      return {
        content: [{ type: "text", text: `Litloft API error (${err.status}): ${detail}` }],
        isError: true,
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: message }], isError: true };
  }
}
