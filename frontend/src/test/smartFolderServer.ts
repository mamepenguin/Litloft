import type { SmartFolder } from "@/types/smartFolder";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

export interface Write {
  method: string;
  url: string;
  body: unknown;
}

export function smartFolderServer(initial: Record<string, SmartFolder[]>) {
  const lists: Record<string, SmartFolder[]> = Object.fromEntries(
    Object.entries(initial).map(([drive, rows]) => [drive, rows.map((r) => ({ ...r }))]),
  );
  const gets: Record<string, number> = {};
  const writes: Write[] = [];
  const heldGets: Array<Deferred<Response>> = [];
  const heldWrites: Array<Deferred<void>> = [];
  const state = {
    holdGets: false,
    failGets: 0,
    failWrites: false,
    holdWrites: false,
  };
  let nextId = 1;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, "http://localhost");
    const method = (init?.method ?? "GET").toUpperCase();
    const match = /^\/api\/drives\/([^/]+)\/smart-folders(?:\/([^/]+))?$/.exec(url.pathname);
    if (!match) return json([]);
    const drive = decodeURIComponent(match[1]);
    const id = match[2] ? decodeURIComponent(match[2]) : null;

    if (method === "GET") {
      gets[drive] = (gets[drive] ?? 0) + 1;
      if (state.holdGets) {
        const d = deferred<Response>();
        heldGets.push(d);
        return d.promise;
      }
      if (state.failGets > 0) {
        state.failGets -= 1;
        return json({ detail: "boom" }, 500);
      }
      return json(lists[drive] ?? []);
    }

    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    writes.push({ method, url: url.pathname, body });
    if (state.holdWrites) {
      const d = deferred<void>();
      heldWrites.push(d);
      await d.promise;
    }
    if (state.failWrites) return json({ detail: "boom" }, 500);

    const rows = lists[drive] ?? [];
    if (method === "POST") {
      const row: SmartFolder = {
        id: `new${nextId++}`,
        drive,
        name: body.name,
        query: body.query,
        file_type: body.file_type ?? null,
        sort_by: null,
        sort_order: null,
        created_at: "2026-11-14T00:00:00Z",
        updated_at: null,
      };
      lists[drive] = [...rows, row];
      return json(row, 201);
    }
    const existing = rows.find((r) => r.id === id);
    if (!existing) return json({ detail: "Not found" }, 404);
    if (method === "PATCH") {
      const row = { ...existing, ...body, updated_at: "2026-11-14T00:00:01Z" };
      lists[drive] = rows.map((r) => (r.id === id ? row : r));
      return json(row);
    }
    if (method === "DELETE") {
      lists[drive] = rows.filter((r) => r.id !== id);
      return new Response(null, { status: 204 });
    }
    return json({ detail: "Method not allowed" }, 405);
  };

  return {
    fetch: fetchImpl,
    lists,
    gets,
    writes,
    state,
    getCount: (drive: string) => gets[drive] ?? 0,
    heldGetCount: () => heldGets.length,
    releaseGet(index: number, rows: SmartFolder[] | null) {
      heldGets[index].resolve(rows === null ? json({ detail: "boom" }, 500) : json(rows));
    },
    heldWriteCount: () => heldWrites.length,
    releaseWrite(index: number) {
      heldWrites[index].resolve();
    },
  };
}

export type SmartFolderServer = ReturnType<typeof smartFolderServer>;
