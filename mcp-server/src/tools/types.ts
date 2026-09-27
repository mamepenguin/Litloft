import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
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
  annotations: ToolAnnotations;
  handler: (args: Record<string, unknown>, client: LitloftClient) => Promise<ToolTextResult>;
}

export const readOnlyAnnotations: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export function writeAnnotations({
  destructive,
  idempotent,
  openWorld = false,
}: {
  destructive: boolean;
  idempotent: boolean;
  openWorld?: boolean;
}): ToolAnnotations {
  return {
    readOnlyHint: false,
    destructiveHint: destructive,
    idempotentHint: idempotent,
    openWorldHint: openWorld,
  };
}

export function textResult(value: unknown): ToolTextResult {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }] };
}
