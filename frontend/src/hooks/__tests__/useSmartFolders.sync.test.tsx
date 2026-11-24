import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSmartFolders } from "@/hooks/useSmartFolders";
import { smartFolderServer, type SmartFolderServer } from "@/test/smartFolderServer";
import type { SmartFolder } from "@/types/smartFolder";

const folder = (id: string, drive: string, query: string, name = id): SmartFolder => ({
  id,
  drive,
  name,
  query,
  file_type: null,
  sort_by: null,
  sort_order: null,
  created_at: "2026-05-01T00:00:00Z",
  updated_at: null,
});

const MAIN = [folder("sf1", "main", "cats", "Cats"), folder("sf2", "main", "dogs", "Dogs")];
const OTHER = [folder("sf9", "other", "birds", "Birds")];

let server: SmartFolderServer;

beforeEach(() => {
  server = smartFolderServer({ main: MAIN, other: OTHER });
  vi.stubGlobal("fetch", vi.fn(server.fetch));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const flush = () => act(async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
});

async function mounted(drive: string) {
  const hook = renderHook(({ d }: { d: string }) => useSmartFolders(d), {
    initialProps: { d: drive },
  });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

type Hook = Awaited<ReturnType<typeof mounted>>;

const ids = (h: Hook) => h.result.current.smartFolders.map((f) => `${f.id}:${f.name}:${f.query}`);
const serverIds = (drive: string) => server.lists[drive].map((f) => `${f.id}:${f.name}:${f.query}`);

async function swallow(p: unknown) {
  try {
    await p;
  } catch {
    /* the failure path is what is under test */
  }
}

const WRITES: Array<[string, (h: Hook) => Promise<unknown>]> = [
  ["create", (h) => h.result.current.create({ name: "Fish", query: "fish", file_type: null })],
  ["overwrite", (h) => h.result.current.update("sf1", { query: "cats kittens", file_type: "video" })],
  ["rename", (h) => h.result.current.update("sf1", { name: "Kittens" })],
  ["delete", (h) => h.result.current.remove("sf2")],
];

describe("SPEC-CORE-103 I6 a write through one instance refetches every other instance of that drive", () => {
  it.each(WRITES)("%s: the other main instance fetches once and shows the server's list; the writer and the other drive do not fetch", async (_label, write) => {
    const a = await mounted("main");
    const b = await mounted("main");
    const c = await mounted("other");
    const mainBefore = server.getCount("main");
    const otherBefore = server.getCount("other");

    await act(async () => {
      await write(a);
    });

    await waitFor(() => expect(ids(b)).toEqual(serverIds("main")));
    await flush();
    expect(server.getCount("main")).toBe(mainBefore + 1);
    expect(server.getCount("other")).toBe(otherBefore);
    expect(ids(a)).toEqual(serverIds("main"));
    expect(ids(c)).toEqual(serverIds("other"));
  });

  it.each(WRITES)(
    "a failed %s notifies no one, while a successful one does",
    async (_label, write) => {
      const a = await mounted("main");
      const b = await mounted("main");
      const before = server.getCount("main");

      server.state.failWrites = true;
      await act(async () => {
        await swallow(write(a));
      });
      await flush();
      expect(server.getCount("main")).toBe(before);

      server.state.failWrites = false;
      await act(async () => {
        await write(a);
      });
      await waitFor(() => expect(server.getCount("main")).toBe(before + 1));
      await waitFor(() => expect(ids(b)).toEqual(serverIds("main")));
    },
  );

  it("reaches an instance by the drive it shows at the moment of the write, not the one it mounted with", async () => {
    const a = await mounted("main");
    const moved = await mounted("other");
    const left = await mounted("main");

    moved.rerender({ d: "main" });
    left.rerender({ d: "other" });
    await waitFor(() => expect(ids(moved)).toEqual(serverIds("main")));
    await waitFor(() => expect(ids(left)).toEqual(serverIds("other")));
    await flush();
    const mainBefore = server.getCount("main");
    const otherBefore = server.getCount("other");

    await act(async () => {
      await a.result.current.update("sf1", { query: "cats kittens", file_type: null });
    });

    await waitFor(() => expect(ids(moved)).toContain("sf1:Cats:cats kittens"));
    await flush();
    expect(server.getCount("main")).toBe(mainBefore + 1);
    expect(server.getCount("other")).toBe(otherBefore);
    expect(ids(left)).toEqual(serverIds("other"));
  });

  it("of two overlapping fetches in one instance, the later-started one's response is what remains", async () => {
    const a = await mounted("main");
    const b = await mounted("main");
    const OLD = [folder("sf1", "main", "older", "Older")];
    const NEW = [folder("sf1", "main", "newer", "Newer")];

    server.state.holdGets = true;
    act(() => {
      void b.result.current.refetch();
    });
    await waitFor(() => expect(server.heldGetCount()).toBe(1));

    await act(async () => {
      await a.result.current.update("sf1", { query: "newer", file_type: null });
    });
    await waitFor(() => expect(server.heldGetCount()).toBe(2));

    await act(async () => {
      server.releaseGet(1, NEW);
    });
    await waitFor(() => expect(ids(b)).toEqual(["sf1:Newer:newer"]));
    await act(async () => {
      server.releaseGet(0, OLD);
    });
    await flush();
    expect(ids(b)).toEqual(["sf1:Newer:newer"]);
  });
});

describe("SPEC-CORE-103 I7 a failed notification refetch keeps the rows; a failed first load or refetch() clears them", () => {
  it("keeps B's rows with loading / error untouched, then clears them on an explicit refetch() failure and on a failed first load", async () => {
    const a = await mounted("main");
    const seen: Array<{ loading: boolean; error: unknown; rows: number }> = [];
    const b = renderHook(() => {
      const r = useSmartFolders("main");
      seen.push({ loading: r.loading, error: r.error, rows: r.smartFolders.length });
      return r;
    });
    await waitFor(() => expect(b.result.current.smartFolders).toHaveLength(2));
    const rowsBefore = b.result.current.smartFolders.map((f) => f.id);
    const settledAt = seen.length;
    const before = server.getCount("main");

    server.state.failGets = 1;
    await act(async () => {
      await a.result.current.update("sf1", { query: "cats kittens", file_type: null });
    });
    await waitFor(() => expect(server.getCount("main")).toBe(before + 1));
    await flush();

    expect(b.result.current.smartFolders.map((f) => f.id)).toEqual(rowsBefore);
    for (const s of seen.slice(settledAt - 1)) {
      expect(s.loading).toBe(false);
      expect(s.error).toBeNull();
      expect(s.rows).toBe(2);
    }

    server.state.failGets = 1;
    await act(async () => {
      await swallow(b.result.current.refetch());
    });
    await waitFor(() => expect(b.result.current.smartFolders).toEqual([]));

    server.state.failGets = 1;
    const fresh = renderHook(() => useSmartFolders("main"));
    await waitFor(() => expect(fresh.result.current.loading).toBe(false));
    expect(fresh.result.current.smartFolders).toEqual([]);
  });
});
