// @vitest-environment node
/**
 * SPEC-CORE-111: GET /app-api/smart-collection-members evaluates a Smart
 * Collection on the frontend server with the caller's credentials.
 */

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FileItem } from "@/types";

const DRIVE = "main";
const SMART_ID = "sf1";
const COOKIE = "access_token=jwt-cookie; lit_viewer=viewer-1";
const AUTHORIZATION = "Bearer caller-token";
const ENDPOINT = "http://frontend.test:3000/app-api/smart-collection-members";

const file = (id: string, createdAt: string, overrides: Partial<FileItem> = {}): FileItem => ({
  image_width: null,
  image_height: null,
  id,
  filename: `${id}.mp4`,
  title: id,
  description: "",
  drive: DRIVE,
  folder_path: "",
  file_type: "video",
  mime_type: "video/mp4",
  thumbnail_url: "",
  has_thumbnail: false,
  file_size: 1000,
  duration: 60,
  liked_at: null,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: null,
  missing_since: null,
  trust_tier: "verified",
  trust_reviewed_at: null,
  created_at: createdAt,
  updated_at: createdAt,
  modified_at: null,
  ...overrides,
});

function rows(n: number, prefix = "f"): FileItem[] {
  const base = Date.UTC(2026, 0, 1);
  return Array.from({ length: n }, (_, i) =>
    file(`${prefix}${i}`, new Date(base - i * 60_000).toISOString()),
  );
}

const hit = (fileId: string, score: number, hydrated: FileItem | null) => ({
  file_id: fileId,
  drive: DRIVE,
  filename: `${fileId}.mp4`,
  file_type: "video",
  score,
  match_types: ["transcript"],
  segments: [{ time_range: [10, 20], matches: [{ type: "transcript", score }] }],
  file: hydrated,
});

function smartFolder(overrides: Record<string, unknown> = {}) {
  return {
    id: SMART_ID,
    drive: DRIVE,
    name: "Kyoto trips",
    query: "kyoto",
    file_type: null,
    sort_by: "created_at",
    sort_order: "asc",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: null,
    on_home: false,
    ...overrides,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface Recorded {
  url: URL;
  headers: Headers;
  signal: AbortSignal | undefined;
}

type Answer = (url: URL, call: Recorded) => Response | Promise<Response>;

type Route = "folders" | "listing" | "search" | "status";

function routeOf(url: URL): Route | "other" {
  if (/^\/api\/drives\/[^/]+\/smart-folders$/.test(url.pathname)) return "folders";
  if (/^\/api\/drives\/[^/]+\/files$/.test(url.pathname)) return "listing";
  if (url.pathname === "/api/addons/intelligence/search") return "search";
  if (url.pathname === "/api/addons/status") return "status";
  return "other";
}

function pagedListing(all: FileItem[]): Answer {
  return (url) => {
    const page = Number(url.searchParams.get("page") ?? "1");
    const limit = Number(url.searchParams.get("limit") ?? "30");
    return json({
      data: all.slice((page - 1) * limit, page * limit),
      meta: { total: all.length, page, limit },
    });
  };
}

const LISTED = rows(12);
const SEMANTIC_ONLY = file("sem-hydrated", "2025-06-01T00:00:00Z");
const HITS = [
  hit(LISTED[5].id, 0.95, LISTED[5]),
  hit("sem-hydrated", 0.9, SEMANTIC_ONLY),
  hit("sem-bare", 0.85, null),
  hit(LISTED[0].id, 0.4, LISTED[0]),
];

function defaultAnswers(): Record<Route, Answer> {
  return {
    folders: () => json([smartFolder()]),
    listing: pagedListing(LISTED),
    search: () => json({ available: true, results: HITS }),
    status: () =>
      json({ addons: { intelligence: { scope: "drive", label: "Intelligence" } }, slots: {} }),
  };
}

let answers: Record<Route, Answer>;
let calls: Recorded[];

function record(input: RequestInfo | URL, init?: RequestInit): Recorded {
  const req = input instanceof Request ? input : null;
  const url = new URL(req ? req.url : String(input), "http://relative.invalid");
  const headers = new Headers(req ? req.headers : undefined);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  const signal = init?.signal ?? req?.signal ?? undefined;
  return { url, headers, signal: signal ?? undefined };
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  answers = defaultAnswers();
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const call = record(input, init);
      calls.push(call);
      const route = routeOf(call.url);
      if (route === "other") return json({ detail: "unexpected path" }, 599);
      return answers[route](call.url, call);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function endpointRequest(query: string, init: { signal?: AbortSignal } = {}) {
  return new NextRequest(`${ENDPOINT}?${query}`, {
    headers: { cookie: COOKIE, authorization: AUTHORIZATION },
    signal: init.signal,
  });
}

async function callEndpoint(query: string) {
  const { GET } = await import("@/app/app-api/smart-collection-members/route");
  const res = await GET(endpointRequest(query));
  return { status: res.status, body: await res.json() };
}

async function evaluateInBrowser(query: string, type: string | null) {
  const [{ evaluateSmartCollection }, api, semantic, addons] = await Promise.all([
    import("@/lib/smartCollectionEval"),
    import("@/lib/api"),
    import("@/lib/semanticSearch"),
    import("@/lib/addons"),
  ]);
  addons.invalidateAddonsCache();
  return evaluateSmartCollection(
    {
      drive: DRIVE,
      query,
      type,
      sort: "relevance",
      order: "desc",
      includeSceneClip: false,
    } as Parameters<typeof evaluateSmartCollection>[0],
    {
      getDriveFiles: api.getDriveFiles,
      getSemanticAvailability: addons.getSemanticAvailability,
      fetchSemanticHits: semantic.fetchSemanticHits,
    } as unknown as Parameters<typeof evaluateSmartCollection>[1],
  );
}

const roundTrip = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

function requestShape(call: Recorded) {
  return {
    route: routeOf(call.url),
    path: call.url.pathname,
    search: [...call.url.searchParams.entries()].sort(),
    xLitDrive: call.headers.get("x-lit-drive"),
  };
}

const evaluationRequests = (list: Recorded[]) =>
  list.filter((c) => routeOf(c.url) !== "folders").map(requestShape);

describe("SPEC-CORE-111 I1 the endpoint's members equal the browser's evaluation", () => {
  const cases: Array<[string, string, string | null, Partial<Record<Route, Answer>>, boolean]> = [
    ["listing and meaning search merged, two listing pages", "kyoto", null, { listing: pagedListing(rows(600)) }, true],
    ["meaning search answering 404 is complete, listing only", "kyoto", null, { search: () => json({ detail: "Not Found" }, 404) }, true],
    ["meaning search answering 500 is incomplete", "kyoto", null, { search: () => json({ detail: "boom" }, 500) }, false],
    ["meaning search answering 503 is incomplete", "kyoto", null, { search: () => json({ detail: "down" }, 503) }, false],
    ["meaning search answering available: false is incomplete", "kyoto", null, { search: () => json({ available: false, results: [] }) }, false],
    ["the addon status failing is incomplete", "kyoto", null, { status: () => json({ detail: "boom" }, 500) }, false],
    ["the addon off for the drive is complete, listing only", "kyoto", null, { status: () => json({ addons: {}, slots: {} }) }, true],
    ["an operator-only query", "tag:trip", null, {}, true],
    ["a saved file_type", "kyoto", "video", {}, true],
  ];

  it.each(cases)("%s", async (_label, query, fileType, overrides, complete) => {
    answers = { ...defaultAnswers(), ...overrides, folders: () => json([smartFolder({ query, file_type: fileType })]) };

    const browser = await evaluateInBrowser(query, fileType);
    const browserRequests = evaluationRequests(calls);
    calls = [];

    const { status, body } = await callEndpoint(`drive=${DRIVE}&id=${SMART_ID}`);

    expect(status).toBe(200);
    expect(browser.complete).toBe(complete);
    expect(body.complete).toBe(browser.complete);
    expect(body.total).toBe(browser.files.length);
    expect(body.files).toEqual(roundTrip(browser.files));
    expect(evaluationRequests(calls)).toEqual(browserRequests);
  });

  it("answers exactly { id, name, query, file_type, complete, total, files }", async () => {
    answers.folders = () => json([smartFolder({ name: "Trips", query: "tag:trip", file_type: "video" })]);
    answers.listing = pagedListing(rows(3));

    const browser = await evaluateInBrowser("tag:trip", "video");
    const { status, body } = await callEndpoint(`drive=${DRIVE}&id=${SMART_ID}`);

    expect(status).toBe(200);
    expect(body).toEqual({
      id: SMART_ID,
      name: "Trips",
      query: "tag:trip",
      file_type: "video",
      complete: true,
      total: 3,
      files: roundTrip(browser.files),
    });
  });

  it("ignores the saved sort: the members are in relevance order", async () => {
    answers.folders = () => json([smartFolder({ sort_by: "title", sort_order: "asc" })]);

    const browser = await evaluateInBrowser("kyoto", null);
    const { body } = await callEndpoint(`drive=${DRIVE}&id=${SMART_ID}`);

    expect(body.files.map((f: FileItem) => f.id)).toEqual(browser.files.map((f) => f.id));
  });
});

describe("SPEC-CORE-111 I1 offset and limit slice the member list", () => {
  async function allIds(): Promise<string[]> {
    const browser = await evaluateInBrowser("kyoto", null);
    return browser.files.map((f) => f.id);
  }

  it.each([
    ["no offset or limit returns every member", "", (ids: string[]) => ids],
    ["offset 1 limit 2", "&offset=1&limit=2", (ids: string[]) => ids.slice(1, 3)],
    ["offset 0 limit 1", "&offset=0&limit=1", (ids: string[]) => ids.slice(0, 1)],
    ["limit 0 is empty", "&limit=0", () => []],
    ["an offset past the end is empty", "&offset=1000", () => []],
    ["offset alone runs to the end", "&offset=3", (ids: string[]) => ids.slice(3)],
  ] as const)("%s, total unchanged", async (_label, extra, expected) => {
    const ids = await allIds();
    calls = [];

    const { status, body } = await callEndpoint(`drive=${DRIVE}&id=${SMART_ID}${extra}`);

    expect(status).toBe(200);
    expect(body.total).toBe(ids.length);
    expect(body.files.map((f: FileItem) => f.id)).toEqual(expected(ids));
  });

  it.each([
    ["every member", "", (ids: string[]) => ids],
    ["a slice", "&offset=2&limit=3", (ids: string[]) => ids.slice(2, 5)],
  ] as const)("ids=1 answers ids in place of files: %s", async (_label, extra, expected) => {
    const ids = await allIds();
    calls = [];

    const { status, body } = await callEndpoint(`drive=${DRIVE}&id=${SMART_ID}&ids=1${extra}`);

    expect(status).toBe(200);
    expect(body).not.toHaveProperty("files");
    expect(body.ids).toEqual(expected(ids));
    expect(body.total).toBe(ids.length);
    expect(body.complete).toBe(true);
  });
});

describe("SPEC-CORE-111 I2 requests carry the caller's credentials to the public API", () => {
  it("every request carries Cookie and Authorization unchanged, to BACKEND_URL's /api, never /api/internal", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend-override.test:9100");
    answers.listing = pagedListing(rows(600));

    const { status } = await callEndpoint(`drive=${DRIVE}&id=${SMART_ID}`);

    expect(status).toBe(200);
    const routes = calls.map((c) => routeOf(c.url));
    expect(routes.filter((r) => r === "listing")).toHaveLength(2);
    expect(routes).toEqual(expect.arrayContaining(["folders", "listing", "search", "status"]));
    for (const call of calls) {
      expect(call.url.origin).toBe("http://backend-override.test:9100");
      expect(call.url.pathname.startsWith("/api/")).toBe(true);
      expect(call.url.pathname.startsWith("/api/internal")).toBe(false);
      expect(call.headers.get("cookie")).toBe(COOKIE);
      expect(call.headers.get("authorization")).toBe(AUTHORIZATION);
    }
  });

  it("goes to http://backend:8000 when BACKEND_URL is unset", async () => {
    vi.stubEnv("BACKEND_URL", undefined);

    await callEndpoint(`drive=${DRIVE}&id=${SMART_ID}`);

    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.url.origin).toBe("http://backend:8000");
    }
  });

  it("looks the Smart Collection up in the drive's smart-folders list", async () => {
    await callEndpoint(`drive=${DRIVE}&id=${SMART_ID}`);

    expect(calls[0].url.pathname).toBe(`/api/drives/${DRIVE}/smart-folders`);
  });

  it.each(["folders", "listing", "search", "status"] as const)(
    "aborting the incoming request aborts the %s request in flight",
    async (route) => {
      answers[route] = (_url, call) =>
        new Promise<Response>((_resolve, reject) => {
          call.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        });
      const { GET } = await import("@/app/app-api/smart-collection-members/route");
      const controller = new AbortController();

      const pending = Promise.resolve(
        GET(endpointRequest(`drive=${DRIVE}&id=${SMART_ID}`, { signal: controller.signal })),
      ).catch(() => undefined);
      await vi.waitFor(() => expect(calls.some((c) => routeOf(c.url) === route)).toBe(true));
      controller.abort();

      const inFlight = calls.find((c) => routeOf(c.url) === route)!;
      expect(inFlight.signal).toBeDefined();
      await vi.waitFor(() => expect(inFlight.signal!.aborted).toBe(true));
      await pending;
    },
  );
});

describe("SPEC-CORE-111 I2 the failure table", () => {
  const listingFailsOn = (page: number, status: number, total = 600): Answer => {
    const good = pagedListing(rows(total));
    return (url, call) =>
      Number(url.searchParams.get("page") ?? "1") === page ? json({ detail: "x" }, status) : good(url, call);
  };
  const networkError: Answer = () => {
    throw new TypeError("fetch failed");
  };

  const cases: Array<[string, string, Partial<Record<Route, Answer>>, number, unknown]> = [
    ["drive missing", `id=${SMART_ID}`, {}, 400, { detail: "drive and id are required" }],
    ["id missing", `drive=${DRIVE}`, {}, 400, { detail: "drive and id are required" }],
    ["both missing", "", {}, 400, { detail: "drive and id are required" }],
    ["offset negative", `drive=${DRIVE}&id=${SMART_ID}&offset=-1`, {}, 400, { detail: "offset and limit must be non-negative integers" }],
    ["offset fractional", `drive=${DRIVE}&id=${SMART_ID}&offset=1.5`, {}, 400, { detail: "offset and limit must be non-negative integers" }],
    ["offset not a number", `drive=${DRIVE}&id=${SMART_ID}&offset=abc`, {}, 400, { detail: "offset and limit must be non-negative integers" }],
    ["limit negative", `drive=${DRIVE}&id=${SMART_ID}&limit=-1`, {}, 400, { detail: "offset and limit must be non-negative integers" }],
    ["limit fractional", `drive=${DRIVE}&id=${SMART_ID}&limit=1.5`, {}, 400, { detail: "offset and limit must be non-negative integers" }],
    ["limit not a number", `drive=${DRIVE}&id=${SMART_ID}&limit=abc`, {}, 400, { detail: "offset and limit must be non-negative integers" }],
    ["smart-folders 404 (locked or unknown drive)", `drive=${DRIVE}&id=${SMART_ID}`, { folders: () => json({ detail: "Drive not found" }, 404) }, 404, { detail: "Drive not found" }],
    ["smart-folders 401 (expired token)", `drive=${DRIVE}&id=${SMART_ID}`, { folders: () => json({ detail: "Token expired" }, 401) }, 401, { detail: "Token expired" }],
    ["smart-folders 503", `drive=${DRIVE}&id=${SMART_ID}`, { folders: () => json({ detail: "busy", retry: 3 }, 503) }, 503, { detail: "busy", retry: 3 }],
    ["an id not among the drive's Smart Collections", `drive=${DRIVE}&id=nope`, {}, 404, { detail: "Smart collection not found" }],
    ["the first listing page answering 404", `drive=${DRIVE}&id=${SMART_ID}`, { listing: listingFailsOn(1, 404) }, 404, { detail: "Smart collection listing failed" }],
    ["a later listing page answering 404 (locked between pages)", `drive=${DRIVE}&id=${SMART_ID}`, { listing: listingFailsOn(2, 404) }, 404, { detail: "Smart collection listing failed" }],
    ["a listing page answering 500", `drive=${DRIVE}&id=${SMART_ID}`, { listing: listingFailsOn(1, 500) }, 502, { detail: "Smart collection listing failed" }],
    ["a later listing page answering 403", `drive=${DRIVE}&id=${SMART_ID}`, { listing: listingFailsOn(2, 403) }, 502, { detail: "Smart collection listing failed" }],
    ["the backend unreachable at the lookup", `drive=${DRIVE}&id=${SMART_ID}`, { folders: networkError }, 502, { detail: "Backend unreachable" }],
    ["the backend unreachable at the listing", `drive=${DRIVE}&id=${SMART_ID}`, { listing: networkError }, 502, { detail: "Backend unreachable" }],
    ["a non-JSON 200 listing", `drive=${DRIVE}&id=${SMART_ID}`, { listing: () => new Response("<html>oops</html>", { status: 200, headers: { "content-type": "text/html" } }) }, 500, { detail: "Smart collection evaluation failed" }],
  ];

  it.each(cases)("%s", async (_label, query, overrides, status, body) => {
    answers = { ...answers, ...overrides };

    const res = await callEndpoint(query);

    expect(res.status).toBe(status);
    expect(res.body).toEqual(body);
  });

  it.each([
    ["the addon status unreachable", { status: networkError }],
    ["meaning search unreachable", { search: networkError }],
    ["the addon status answering 500", { status: () => json({ detail: "x" }, 500) }],
    ["meaning search answering 502", { search: () => json({ detail: "x" }, 502) }],
  ] as const)("%s answers 200 with complete: false", async (_label, overrides) => {
    answers = { ...answers, ...overrides };

    const res = await callEndpoint(`drive=${DRIVE}&id=${SMART_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.complete).toBe(false);
    expect(Array.isArray(res.body.files)).toBe(true);
  });
});

describe("SPEC-CORE-111 I3 the endpoint shares the browser's requests but not its caches", () => {
  it("two consecutive endpoint requests each send their own addon-status request", async () => {
    const { GET } = await import("@/app/app-api/smart-collection-members/route");

    await GET(endpointRequest(`drive=${DRIVE}&id=${SMART_ID}`));
    await GET(endpointRequest(`drive=${DRIVE}&id=${SMART_ID}`));

    expect(calls.filter((c) => routeOf(c.url) === "status")).toHaveLength(2);
  });

  it("does not reuse the browser's cached addon status", async () => {
    const addons = await import("@/lib/addons");
    addons.invalidateAddonsCache();
    await addons.getAddonsStatus(DRIVE);
    calls = [];

    await callEndpoint(`drive=${DRIVE}&id=${SMART_ID}`);

    expect(calls.filter((c) => routeOf(c.url) === "status")).toHaveLength(1);
  });

  it("does not seed the browser's file cache", async () => {
    const { peekFileSeed } = await import("@/lib/fileSeed");

    const { body } = await callEndpoint(`drive=${DRIVE}&id=${SMART_ID}`);

    expect(body.files.length).toBeGreaterThan(0);
    for (const f of body.files as FileItem[]) {
      expect(peekFileSeed(f.id) ?? null).toBeNull();
    }
  });
});
