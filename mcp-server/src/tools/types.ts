import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { ZodRawShape } from "zod";
import type { LitloftClient } from "../client.js";

export type TextBlock = { type: "text"; text: string };
export type ImageBlock = { type: "image"; data: string; mimeType: string };

export interface ToolTextResult {
  [key: string]: unknown;
  content: TextBlock[];
  isError?: boolean;
}

export interface ToolMediaResult {
  [key: string]: unknown;
  content: (TextBlock | ImageBlock)[];
  isError?: boolean;
}

export interface LitloftTool<
  Args extends ZodRawShape = ZodRawShape,
  Result extends ToolMediaResult = ToolTextResult,
> {
  name: string;
  description: string;
  inputSchema: Args;
  annotations: ToolAnnotations;
  handler: (args: Record<string, unknown>, client: LitloftClient) => Promise<Result>;
}

export type LitloftMediaTool = LitloftTool<ZodRawShape, ToolMediaResult>;

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
  return { content: [textBlock(value)] };
}

export function textBlock(value: unknown): TextBlock {
  return { type: "text", text: typeof value === "string" ? value : JSON.stringify(value) };
}

export function imageBlock(bytes: Uint8Array, contentType: string): ImageBlock {
  return {
    type: "image",
    data: Buffer.from(bytes).toString("base64"),
    mimeType: contentType.split(";")[0].trim(),
  };
}

export function errorResult(message: string): ToolTextResult {
  return { content: [{ type: "text", text: message }], isError: true };
}
