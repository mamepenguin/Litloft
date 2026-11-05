import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchSemanticHits, fetchSemanticImages } from "../semanticSearch";

const calls: URL[] = [];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      calls.push(new URL(String(input), "http://localhost"));
      return json({ available: true, results: [] });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-040 I22 passages are asked for by the results page only", () => {
  it("sends no passages parameter by default", async () => {
    await fetchSemanticHits("cats", "main");

    expect(calls[0].searchParams.has("passages")).toBe(false);
  });

  it("sends passages=true when asked", async () => {
    await fetchSemanticHits("cats", "main", { passages: true, limit: 1000 });

    expect(calls[0].searchParams.get("passages")).toBe("true");
    expect(calls[0].searchParams.get("q")).toBe("cats");
    expect(calls[0].searchParams.get("limit")).toBe("1000");
  });

  it("keeps passages alongside a filtered query", async () => {
    await fetchSemanticHits("予算", "main", {
      passages: true,
      filter: {
        tags: ["会議"],
        kinds: ["pdf"],
        favorite: false,
        liked: false,
        folders: [],
        collections: [],
        sizes: [],
        durations: [],
      },
    });

    expect(calls[0].searchParams.get("passages")).toBe("true");
    expect(JSON.parse(calls[0].searchParams.get("filter") ?? "null")).toEqual({
      tags: ["会議"],
      kinds: ["pdf"],
    });
  });

  it("sends no passages parameter for the Show more by similarity search", async () => {
    await fetchSemanticImages("cats", "main");

    expect(calls[0].pathname).toBe("/api/addons/intelligence/search/images");
    expect(calls[0].searchParams.has("passages")).toBe(false);
  });
});
