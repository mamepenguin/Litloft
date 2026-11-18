import { z } from "zod";
import type { LitloftClient } from "../client.js";
import {
  SMART_COLLECTION_ENDPOINT_MISSING,
  SMART_COLLECTION_MEMBERS_PATH,
  hostTimeZone,
  isMissingSmartCollectionEndpoint,
  type SmartFolder,
} from "./collections.js";
import { runTool } from "./runTool.js";
import {
  errorResult,
  textResult,
  writeAnnotations,
  type LitloftTool,
} from "./types.js";

const ASK_TIMEOUT_MS = 120_000;
const ASK_MAX_SSE_EVENTS = 4096;
const ASK_MAX_SCOPE_FILE_IDS = 10_000;

interface SmartCollectionMembers {
  complete: boolean;
  total: number;
  ids: string[];
}

interface ReplacedSmartCollection {
  name: string;
  member_count: number;
}

interface PreparedScope {
  scope: Record<string, unknown>;
  smartCollections: ReplacedSmartCollection[];
}

function formatCount(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

// A name in scope.collections may name a Smart Collection, whose members live
// only behind the frontend endpoint; replacing it with the members' ids is what
// lets Ask take it alongside ordinary collections.
async function prepareScope(
  drive: string,
  scope: Record<string, unknown> | undefined,
  client: LitloftClient
): Promise<PreparedScope | undefined> {
  if (!scope) return undefined;
  const names = Array.isArray(scope.collections) ? (scope.collections as string[]) : [];
  if (names.length === 0) return undefined;

  const drivePath = encodeURIComponent(drive);
  const collections = await client.request<{ name: string }[]>(
    "GET",
    `/api/drives/${drivePath}/collections`
  );
  const smartFolders = await client.request<SmartFolder[]>(
    "GET",
    `/api/drives/${drivePath}/smart-folders`
  );
  const collectionNames = new Set(collections.map((row) => row.name.toLowerCase()));
  const smartByName = new Map(smartFolders.map((folder) => [folder.name.toLowerCase(), folder]));

  const kept: string[] = [];
  const evaluated = new Set<string>();
  const smartCollections: ReplacedSmartCollection[] = [];
  const memberIds: string[] = [];
  let replaced = false;

  for (const name of names) {
    const key = name.toLowerCase();
    if (collectionNames.has(key)) {
      kept.push(name);
      continue;
    }
    const folder = smartByName.get(key);
    if (!folder) {
      kept.push(name);
      continue;
    }
    replaced = true;
    if (evaluated.has(key)) continue;
    evaluated.add(key);

    let members: SmartCollectionMembers;
    try {
      members = await client.request<SmartCollectionMembers>("GET", SMART_COLLECTION_MEMBERS_PATH, {
        query: { drive, id: folder.id, ids: 1, tz: hostTimeZone() },
        timeoutMs: ASK_TIMEOUT_MS,
      });
    } catch (err) {
      if (isMissingSmartCollectionEndpoint(err)) {
        throw new Error(SMART_COLLECTION_ENDPOINT_MISSING);
      }
      throw err;
    }
    if (!members.complete) {
      throw new Error(
        `Smart Collection "${folder.name}" could not be read completely (meaning search unavailable); nothing was asked.`
      );
    }
    const ids = members.ids ?? [];
    memberIds.push(...ids);
    smartCollections.push({ name: folder.name, member_count: ids.length });
  }

  if (!replaced) {
    return { scope: { ...scope, collections: kept }, smartCollections };
  }

  const passed = Array.isArray(scope.file_ids) ? (scope.file_ids as string[]) : [];
  const fileIds = [...new Set([...passed, ...memberIds])];
  if (fileIds.length > ASK_MAX_SCOPE_FILE_IDS) {
    throw new Error(
      `The scope holds ${formatCount(fileIds.length)} files; at most ${formatCount(ASK_MAX_SCOPE_FILE_IDS)} can be asked about. Nothing was asked.`
    );
  }

  return { scope: { ...scope, collections: kept, file_ids: fileIds }, smartCollections };
}

const ask: LitloftTool = {
  name: "ask",
  description:
    "Ask Litloft Intelligence a question within one drive and return the synthesized answer with source events. Retrieved file excerpts may be sent to the LLM provider configured in Litloft Intelligence. Pass scope to answer only from files in those folders (and below), collections (by name), tags and kinds of the drive; conditions combine with AND. An empty scope answers with no answer and matched_file_count 0. A Smart Collection name may also be given in the collections scope: its members are combined with the named collections as one collection condition, and file_ids is sent when a name was replaced.",
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
        file_ids: z.array(z.string()).optional(),
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
      // The server owns the scope contract; keep a key this tool does not
      // know so the server's 422 can say so instead of the tool dropping it.
      .passthrough()
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
      const prepared = await prepareScope(
        drive,
        body.scope as Record<string, unknown> | undefined,
        client
      );
      const requestBody = prepared ? { ...body, scope: prepared.scope } : body;
      const events = await client.requestSse(
        "POST",
        "/api/addons/intelligence/ask",
        {
          headers: { "X-Lit-Drive": encodeURIComponent(drive) },
          json: requestBody,
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
        ...(prepared && prepared.smartCollections.length > 0
          ? { smart_collections: prepared.smartCollections }
          : {}),
      });
    }),
};

export const askTools: LitloftTool[] = [ask];
