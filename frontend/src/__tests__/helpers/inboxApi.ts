/**
 * A fetch stub for the inbox page's acceptance files. The page's own API
 * helpers are the thing under test, so this answers by URL rather than
 * mocking `@/lib/api`.
 */

import { vi } from "vitest";

import type { ProcessingStage } from "@/lib/api";
import type { InboxItemWire } from "./inboxData";

export interface ProcessingAnswer {
  stages: ProcessingStage[];
  ready: boolean;
}

export interface NeighboursWire {
  prev_id: string | null;
  next_id: string | null;
  position: number | null;
  total: number | null;
}

export interface RecordedCall {
  url: string;
  method: string;
  body: unknown;
}

export interface InboxApiState {
  items: InboxItemWire[];
  openCount?: number | null;
  next?: string | null;
  processing?: Record<string, ProcessingAnswer>;
  neighbours?: Record<string, NeighboursWire>;
  doneCount?: number | null;
  doneAt?: string;
  undoReopened?: number | null;
  failList?: boolean;
  failDone?: boolean;
  failUndo?: boolean;
  /** Held open to keep a done request in flight while the page reloads. */
  doneGate?: Promise<void> | null;
  folders?: { name: string; path: string }[];
}

export interface InboxApiHarness {
  state: InboxApiState;
  calls: RecordedCall[];
  listCalls: () => RecordedCall[];
  doneCalls: () => RecordedCall[];
  undoCalls: () => RecordedCall[];
  tagCalls: () => RecordedCall[];
  moveCalls: () => RecordedCall[];
  processingCalls: () => RecordedCall[];
  resetCalls: () => void;
}

const DEFAULT_DONE_AT = "2026-11-04T10:00:00.000000Z";

function ok(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function failed(status = 500): Response {
  return {
    ok: false,
    status,
    json: async () => ({ detail: "boom" }),
    text: async () => "boom",
  } as Response;
}

function parseBody(init?: RequestInit): unknown {
  if (!init?.body) return null;
  if (typeof init.body !== "string") return init.body;
  try {
    return JSON.parse(init.body);
  } finally {
    // `JSON.parse` already threw on malformed input; nothing to clean up.
  }
}

function idsOf(body: unknown): string[] {
  if (typeof body !== "object" || body === null) return [];
  const ids = (body as { ids?: unknown; file_ids?: unknown }).ids ??
    (body as { file_ids?: unknown }).file_ids;
  return Array.isArray(ids) ? ids.map(String) : [];
}

export function installInboxFetch(state: InboxApiState): InboxApiHarness {
  const calls: RecordedCall[] = [];

  const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const body = parseBody(init);
    calls.push({ url, method, body });
    const path = url.split("?")[0];

    if (path.endsWith("/inbox/count")) {
      return ok({ open: state.openCount ?? state.items.length });
    }
    if (path.endsWith("/inbox/done") && method === "POST") {
      if (state.failDone) return failed();
      if (state.doneGate) await state.doneGate;
      return ok({
        done: state.doneCount ?? idsOf(body).length,
        done_at: state.doneAt ?? DEFAULT_DONE_AT,
      });
    }
    if (path.endsWith("/inbox/undo") && method === "POST") {
      if (state.failUndo) return failed();
      return ok({
        reopened: state.undoReopened ?? 1,
      });
    }
    if (/\/inbox\/[^/]+\/neighbors$/.test(path)) {
      const id = path.split("/").slice(-2)[0];
      return ok(
        state.neighbours?.[id] ?? {
          prev_id: null,
          next_id: null,
          position: null,
          total: null,
        },
      );
    }
    if (/\/inbox$/.test(path) || /\/inbox\/$/.test(url)) {
      if (state.failList) return failed();
      return ok({
        items: state.items,
        next: state.next ?? null,
        open_count: state.openCount ?? state.items.length,
      });
    }
    if (path.endsWith("/api/files/processing") && method === "POST") {
      const ids = idsOf(body);
      const files: Record<string, ProcessingAnswer> = {};
      for (const id of ids) {
        const answer = state.processing?.[id];
        if (answer) files[id] = answer;
      }
      return ok({ files });
    }
    if (path.includes("/upload/init")) {
      return ok({ upload_id: "u1", chunk_size: 5 * 1024 * 1024, total_chunks: 1 });
    }
    if (path.includes("/upload/") && path.endsWith("/complete")) {
      return ok({ id: state.items[0]?.file.id ?? "f1" });
    }
    if (path.includes("/upload/")) return ok({});
    if (path.endsWith("/files/batch/tags") || path.endsWith("/files/batch/move")) {
      return ok({ updated: idsOf(body).length, moved: idsOf(body).length, errors: [] });
    }
    if (/\/api\/drives\/[^/]+\/folders$/.test(path)) {
      return ok(
        (state.folders ?? []).map((folder) => ({
          name: folder.name,
          path: folder.path,
          modified_at: null,
          file_count: 0,
          kind_counts: {},
        })),
      );
    }
    if (path.endsWith("/api/auth/status")) {
      return ok({ unlocked_groups: [], has_protected_drives: false, is_admin: false });
    }
    if (path.endsWith("/addon-policies")) return ok({ addons: {} });
    return ok([]);
  });

  vi.stubGlobal("fetch", fetchStub);

  const matching = (fragment: string) =>
    calls.filter((call) => call.url.includes(fragment));

  return {
    state,
    calls,
    listCalls: () => calls.filter((c) => /\/inbox(\?|$)/.test(c.url)),
    doneCalls: () => matching("/inbox/done"),
    undoCalls: () => matching("/inbox/undo"),
    tagCalls: () => matching("/files/batch/tags"),
    moveCalls: () => matching("/files/batch/move"),
    processingCalls: () => matching("/files/processing"),
    resetCalls: () => {
      calls.length = 0;
    },
  };
}
