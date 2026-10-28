import { z } from "zod";
import { allTools } from "../tools/index.js";
import type { LitloftClient } from "../client.js";
import { fakeClient } from "./testClient.js";

export const FILE_ID = "abc123456789";
export const MB = 1024 * 1024;

export function findTool(name: string) {
  const tool = allTools.find((t) => t.name === name);
  if (!tool) throw new Error(`tool not found: ${name}`);
  return tool;
}

export function schemaOf(name: string) {
  return z.object(findTool(name).inputSchema);
}

export interface ToolOutcome {
  isError: boolean;
  text: string;
}

export async function run(
  name: string,
  args: Record<string, unknown>,
  client: LitloftClient
): Promise<ToolOutcome> {
  const result = await findTool(name).handler(args as never, client);
  const first = result.content[0] as { type: string; text?: string };
  return { isError: result.isError === true, text: first?.text ?? "" };
}

export type Fake = ReturnType<typeof fakeClient>;

export function allRequests(client: Fake): { method: string; path: string }[] {
  return [
    ...client.calls,
    ...client.rawCalls,
    ...client.bytesCalls,
    ...client.multipartCalls,
    ...client.sseCalls,
  ].map((c) => ({ method: c.method, path: c.path }));
}

export function isOneLine(text: string): boolean {
  return text.length > 0 && !text.includes("\n");
}
