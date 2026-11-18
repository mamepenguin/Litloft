// @vitest-environment node
/**
 * SPEC-CORE-138 sending 4, I8, I15: GET /app-api/smart-collection-members
 * reads absolute `modified:` dates in the `tz` it is given, refuses to guess
 * one, and answers as before for a query without an absolute date.
 */

import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { FileItem } from "@/types";

const ORIGINAL_TZ = vi.hoisted(() => {
  const original = process.env.TZ;
  process.env.TZ = "Asia/Tokyo";
  return original;
});

const DRIVE = "main";
const SMART_ID = "sf1";
const ENDPOINT = "http://frontend.test:3000/app-api/smart-collection-members";
const NOW_MS = Date.UTC(2026, 10, 18, 3, 0, 0);
const NOW = NOW_MS / 1000;
const YEAR = 365 * 86_400;

const file = (id: string): FileItem =>
  ({
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
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
    modified_at: null,
  }) as FileItem;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let smartQuery = "modified:<2024";
let calls: URL[] = [];

function answer(url: URL): Response {
  if (/^\/api\/drives\/[^/]+\/smart-folders$/.test(url.pathname)) {
    return json([
      {
        id: SMART_ID,
        drive: DRIVE,
        name: "Old",
        query: smartQuery,
        file_type: null,
        sort_by: "created_at",
        sort_order: "desc",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: null,
        on_home: false,
      },
    ]);
  }
  if (/^\/api\/drives\/[^/]+\/files$/.test(url.pathname)) {
    const page = Number(url.searchParams.get("page") ?? "1");
    const limit = Number(url.searchParams.get("limit") ?? "30");
    return json({ data: page === 1 ? [file("f1")] : [], meta: { total: 1, page, limit } });
  }
  if (url.pathname === "/api/addons/intelligence/search") return json({ available: true, results: [] });
  if (url.pathname === "/api/addons/status") {
    return json({ addons: { intelligence: { scope: "drive", label: "Intelligence" } }, slots: {} });
  }
  return json({ detail: "unexpected path" }, 599);
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
});

afterAll(() => {
  vi.useRealTimers();
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

beforeEach(() => {
  vi.resetModules();
  vi.setSystemTime(NOW_MS);
  smartQuery = "modified:<2024";
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const raw = input instanceof Request ? input.url : String(input);
      const url = new URL(raw, "http://relative.invalid");
      calls.push(url);
      return answer(url);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function callEndpoint(query: string) {
  const { GET } = await import("@/app/app-api/smart-collection-members/route");
  const res = await GET(
    new NextRequest(`${ENDPOINT}?${query}`, { headers: { cookie: "access_token=jwt" } }),
  );
  return { status: res.status, body: await res.json() };
}

async function evaluateInBrowser(query: string) {
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
      type: null,
      sort: "created_at",
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

const listingModified = () =>
  calls
    .filter((url) => /\/files$/.test(url.pathname))
    .map((url) => url.searchParams.getAll("modified"));

describe("SPEC-CORE-138 I8 the endpoint with the page's zone answers the page's files", () => {
  it("sends the same modified comparison the browser sends in Asia/Tokyo", async () => {
    const browser = await evaluateInBrowser("modified:<2024");
    const browserSent = listingModified();
    calls = [];

    const { status, body } = await callEndpoint(`drive=${DRIVE}&id=${SMART_ID}&tz=Asia/Tokyo`);

    expect(status).toBe(200);
    expect(browserSent[0]).toEqual(["lt:1704034800"]);
    expect(listingModified()).toEqual(browserSent);
    expect(body.files.map((f: FileItem) => f.id)).toEqual(browser.files.map((f) => f.id));
  });

  it("reads the date in the zone it is given", async () => {
    const { status } = await callEndpoint(`drive=${DRIVE}&id=${SMART_ID}&tz=America/New_York`);

    expect(status).toBe(200);
    expect(listingModified()[0]).toEqual(["lt:1704085200"]);
  });
});

describe("SPEC-CORE-138 parsing 5 resolution is clamped to the wire range", () => {
  it("sends lt:253402300799 for modified:<=9999 read in UTC", async () => {
    smartQuery = "modified:<=9999";

    const { status } = await callEndpoint(`drive=${DRIVE}&id=${SMART_ID}&tz=UTC`);

    expect(status).toBe(200);
    expect(listingModified()[0]).toEqual(["lt:253402300799"]);
  });

  it("sends gte:0 for modified:>=1970 read in Asia/Tokyo", async () => {
    smartQuery = "modified:>=1970";

    const { status } = await callEndpoint(`drive=${DRIVE}&id=${SMART_ID}&tz=Asia/Tokyo`);

    expect(status).toBe(200);
    expect(listingModified()[0]).toEqual(["gte:0"]);
  });
});

describe("SPEC-CORE-138 I15 sending 4 tz is required for an absolute date only", () => {
  it("answers 400 without tz for an absolute date and lists nothing", async () => {
    const { status, body } = await callEndpoint(`drive=${DRIVE}&id=${SMART_ID}`);

    expect(status).toBe(400);
    expect(JSON.stringify(body)).toContain("tz is required for an absolute modified: date");
    expect(listingModified()).toEqual([]);
  });

  it("answers without tz for a relative amount, resolved against now", async () => {
    smartQuery = "modified:<1y";

    const { status } = await callEndpoint(`drive=${DRIVE}&id=${SMART_ID}`);

    expect(status).toBe(200);
    expect(listingModified()[0]).toEqual([`lt:${NOW - YEAR}`]);
  });

  it("answers as before for a query with no modified:, and refuses the same id once it holds a date", async () => {
    smartQuery = "tag:trip";
    const plain = await callEndpoint(`drive=${DRIVE}&id=${SMART_ID}`);
    expect(plain.status).toBe(200);
    expect(listingModified()).toEqual([[]]);

    calls = [];
    smartQuery = "tag:trip modified:>=2024-06";
    const dated = await callEndpoint(`drive=${DRIVE}&id=${SMART_ID}`);
    expect(dated.status).toBe(400);
  });

  it("answers 400 for an unknown zone", async () => {
    const { status } = await callEndpoint(`drive=${DRIVE}&id=${SMART_ID}&tz=Not/AZone`);

    expect(status).toBe(400);
    expect(listingModified()).toEqual([]);
  });

  it("answers 400 for an unknown zone even when the query has no date", async () => {
    smartQuery = "tag:trip";
    const known = await callEndpoint(`drive=${DRIVE}&id=${SMART_ID}&tz=Asia/Tokyo`);
    expect(known.status).toBe(200);

    const unknown = await callEndpoint(`drive=${DRIVE}&id=${SMART_ID}&tz=Not/AZone`);
    expect(unknown.status).toBe(400);
  });
});
