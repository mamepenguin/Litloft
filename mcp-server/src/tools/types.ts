import type { ZodRawShape } from "zod";
import type { LitloftClient } from "../client.js";

export interface ToolTextResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

export interface LitloftTool<Args extends ZodRawShape = ZodRawShape> {
  name: string;
  description: string;
  inputSchema: Args;
  handler: (args: Record<string, unknown>, client: LitloftClient) => Promise<ToolTextResult>;
}

export function textResult(value: unknown): ToolTextResult {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }] };
}
