import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { invalidateAddonsCache } from "@/lib/addons";
import type { FileKind } from "@/types";

import { useFileSearch } from "../useFileSearch";

const getDriveFiles = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({
  getDriveFiles: (...args: unknown[]) => getDriveFiles(...args),
}));

const writeSearchCache = vi.hoisted(() => vi.fn());
const readSearchCache = vi.hoisted(() => vi.fn());
vi.mock("@/lib/searchCache", () => ({
  readSearchCache: (...args: unknown[]) => readSearchCache(...args),
  writeSearchCache: (...args: unknown[]) => writeSearchCache(...args),
  searchCacheKey: (key: { drive: string; query: string; type: unknown; includeSceneClip: boolean }) =>
    `${key.drive}::${key.query}::${key.type ?? "all"}::${key.includeSceneClip ? 1 : 0}`,
  clearSearchCache: vi.fn(),
}));

interface Input {
  open: boolean;
  drive: string | null;
  query: string;
  scopeType: FileKind | null;
  browsing: boolean;
}

const base: Input = {
  open: true,
  drive: "main",
  query: "",
  scopeType: null,
  browsing: false,
};

const server = {
  searchStatus: 200,
  searchBody: { available: true, results: [] as unknown[] },
  searchHandler: null as null | (() => Promise<Response>),
  calls: [] as URL[],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
  const url = new URL(String(input), "http://localhost");
  server.calls.push(url);
  if (url.pathname === "/api/addons/status") {
    return json({
      addons: { intelligence: { label: "Intelligence", icon: "sparkles" } },
      slots: {},
    });
  }
  if (url.pathname === "/api/addons/intelligence/search") {
    if (server.searchHandler) return server.searchHandler();
    return json(server.searchBody, server.searchStatus);
  }
  return json({}, 404);
});

const searchCalls = () =>
  server.calls.filter((url) => url.pathname === "/api/addons/intelligence/search");

async function open(props: Partial<Input>) {
  const view = renderHook((input: Input) => useFileSearch(input), {
    initialProps: { ...base, ...props },
  });
  return view;
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  invalidateAddonsCache();
  getDriveFiles.mockReset();
  getDriveFiles.mockResolvedValue({
    data: [],
    meta: { total: 0, page: 1, limit: 8 },
  });
  writeSearchCache.mockClear();
  readSearchCache.mockReset();
  readSearchCache.mockReturnValue(null);
  server.searchStatus = 200;
  server.searchBody = { available: true, results: [] };
  server.searchHandler = null;
  server.calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-039 I6 the modal's meaning stage for a filtered query", () => {
  const rows: Array<[string, string, FileKind | null, string, Record<string, unknown>]> = [
    [
      "tags and a kind",
      "tag:会議 type:pdf 予算の見直し",
      null,
      "予算の見直し",
      { tags: ["会議"], kinds: ["pdf"] },
    ],
    [
      "the scope's kind joins the filter",
      "tag:会議 予算",
      "video",
      "予算",
      { tags: ["会議"], kinds: ["video"] },
    ],
    [
      "both flags",
      "is:favorite is:liked 予算",
      null,
      "予算",
      { favorite: true, liked: true },
    ],
    [
      "a kind narrowed by the scope",
      "type:document 予算",
      "text",
      "予算",
      { kinds: ["text"] },
    ],
    [
      "several kinds",
      "type:pdf type:video 予算",
      null,
      "予算",
      { kinds: ["pdf", "video"] },
    ],
  ];

  it.each(rows)(
    "sends q as the text and the filter as %s",
    async (_name, query, scopeType, text, filter) => {
      const view = await open({ query, scopeType });

      await waitFor(() => expect(searchCalls()).toHaveLength(1));

      const url = searchCalls()[0];
      expect(url.searchParams.get("q")).toBe(text);
      expect(JSON.parse(url.searchParams.get("filter") ?? "null")).toEqual(filter);
      expect(url.searchParams.has("type")).toBe(false);
      expect(url.searchParams.has("include_scene_clip")).toBe(false);
      expect(url.searchParams.has("mode")).toBe(false);
      view.unmount();
    },
  );

  it("keeps sending an unfiltered query with no filter", async () => {
    const view = await open({ query: "予算" });

    await waitFor(() => expect(searchCalls()).toHaveLength(1));

    expect(searchCalls()[0].searchParams.get("q")).toBe("予算");
    expect(searchCalls()[0].searchParams.has("filter")).toBe(false);
    view.unmount();
  });

  it("sends the listing the operators unchanged", async () => {
    const view = await open({ query: "tag:会議 type:pdf 予算", scopeType: null });

    await waitFor(() => expect(getDriveFiles).toHaveBeenCalled());

    expect(getDriveFiles.mock.calls[0][1]).toMatchObject({
      search: "予算",
      tag: ["会議"],
      type: "pdf",
    });
    view.unmount();
  });

  const silent: Array<[string, Partial<Input>]> = [
    ["an operator-only query", { query: "tag:会議" }],
    ["impossible kinds", { query: "type:video 予算", scopeType: "image" }],
    ["a scoped query", { query: "予算", scopeType: "video" }],
    ["a scoped filtered query", { query: "tag:会議 予算", scopeType: "video" }],
  ];

  it.each(silent)("runs no meaning stage for %s", async (_name, props) => {
    const view = await open(props);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    expect(searchCalls()).toHaveLength(0);
    view.unmount();
  });

  it("requests nothing when the kinds are impossible", async () => {
    const view = await open({ query: "type:video 予算", scopeType: "image" });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    expect(searchCalls()).toHaveLength(0);
    expect(getDriveFiles).not.toHaveBeenCalled();
    view.unmount();
  });
});

describe("SPEC-CORE-039 I17 a failed or aborted meaning stage", () => {
  it("caches an answered stage under the whole query text", async () => {
    server.searchBody = { available: true, results: [] };
    const view = await open({ query: "tag:会議 予算" });

    await waitFor(() => expect(writeSearchCache).toHaveBeenCalled());

    expect(writeSearchCache.mock.calls.at(-1)?.[0]).toMatchObject({
      drive: "main",
      query: "tag:会議 予算",
    });
    view.unmount();
  });

  it.each([
    ["a non-200", () => {
      server.searchStatus = 500;
    }],
    ["a network failure", () => {
      server.searchHandler = () => Promise.reject(new Error("offline"));
    }],
  ])("never writes %s to the cache", async (_name, fail) => {
    fail();
    const view = await open({ query: "予算" });

    await waitFor(() => expect(searchCalls()).toHaveLength(1));
    await waitFor(() => expect(view.result.current.semanticPending).toBe(false));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(writeSearchCache).not.toHaveBeenCalled();
    view.unmount();
  });

  it("never applies a stage the abort signal cancelled", async () => {
    let release: (response: Response) => void = () => {};
    server.searchHandler = () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      });
    const view = await open({ query: "cats" });
    await waitFor(() => expect(searchCalls()).toHaveLength(1));

    view.rerender({ ...base, query: "dogs" });
    await act(async () => {
      release(
        json({
          available: true,
          results: [
            {
              file_id: "stale",
              drive: "main",
              filename: "stale.mp4",
              file_type: "video",
              score: 0.9,
              match_types: ["transcript"],
              segments: [],
              file: null,
            },
          ],
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(view.result.current.merged.map((file) => file.id)).not.toContain("stale");
    view.unmount();
  });
});
