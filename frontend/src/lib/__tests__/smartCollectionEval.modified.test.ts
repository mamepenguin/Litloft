/**
 * SPEC-CORE-138 parsing 5, I11: a Smart Collection evaluated on its own takes
 * one `now` per evaluation, and a later evaluation resolves relative amounts
 * again.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { FileItem } from "@/types";

import { evaluateSmartCollection } from "../smartCollectionEval";

const ORIGINAL_TZ = vi.hoisted(() => {
  const original = process.env.TZ;
  process.env.TZ = "Asia/Tokyo";
  return original;
});

type EvalInput = Parameters<typeof evaluateSmartCollection>[0];
type EvalIo = Parameters<typeof evaluateSmartCollection>[1];

const NOW_MS = Date.UTC(2026, 10, 18, 3, 0, 0);
const NOW = NOW_MS / 1000;
const DAY = 86_400;
const YEAR = 365 * DAY;

const file = (id: string): FileItem =>
  ({
  image_width: null,
  image_height: null,
  id,
  filename: `${id}.mp4`,
  title: id,
  description: "",
  drive: "main",
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

type ListingParams = { page?: number; limit?: number; modified?: string[] } & Record<string, unknown>;

function clockMovingListing(total: number) {
  return vi.fn(async (_drive: string, params: ListingParams) => {
    const page = params.page ?? 1;
    const limit = params.limit ?? 30;
    vi.setSystemTime(Date.now() + DAY * 1000);
    const count = Math.max(0, Math.min(limit, total - (page - 1) * limit));
    return {
      data: Array.from({ length: count }, (_, i) => file(`p${page}-${i}`)),
      meta: { total, page, limit },
    };
  });
}

function io(getDriveFiles: ReturnType<typeof clockMovingListing>): EvalIo {
  return {
    getDriveFiles,
    getSemanticAvailability: vi.fn(async () => "available"),
    fetchSemanticHits: vi.fn(async () => ({ ok: true, results: [] })),
  } as unknown as EvalIo;
}

function input(query: string): EvalInput {
  return {
    drive: "main",
    query,
    type: null,
    sort: "created_at",
    order: "desc",
    includeSceneClip: false,
  } as EvalInput;
}

const sentModified = (listing: ReturnType<typeof clockMovingListing>) =>
  listing.mock.calls.map((call) => call[1].modified);

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
});

afterAll(() => {
  vi.useRealTimers();
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

beforeEach(() => {
  vi.setSystemTime(NOW_MS);
});

describe("SPEC-CORE-138 I11 one now per evaluation", () => {
  it("sends the same wire form on every page while the clock moves", async () => {
    const listing = clockMovingListing(700);

    await evaluateSmartCollection(input("modified:<1y"), io(listing));

    expect(listing.mock.calls.length).toBeGreaterThan(1);
    for (const wire of sentModified(listing)) {
      expect(wire).toEqual([`lt:${NOW - YEAR}`]);
    }
  });

  it("resolves the relative amount again on a later evaluation", async () => {
    const first = clockMovingListing(1);
    await evaluateSmartCollection(input("modified:<1y"), io(first));
    expect(sentModified(first)[0]).toEqual([`lt:${NOW - YEAR}`]);

    vi.setSystemTime(NOW_MS + DAY * 1000);
    const second = clockMovingListing(1);
    await evaluateSmartCollection(input("modified:<1y"), io(second));

    expect(sentModified(second)[0]).toEqual([`lt:${NOW + DAY - YEAR}`]);
  });
});

describe("SPEC-CORE-138 sending 4 a page evaluates absolute dates in the browser's zone", () => {
  it("reads modified:<2024 at Tokyo midnight", async () => {
    expect(new Date(2024, 0, 1).getTime() / 1000).toBe(1704034800);
    const listing = clockMovingListing(1);

    await evaluateSmartCollection(input("modified:<2024"), io(listing));

    expect(sentModified(listing)[0]).toEqual(["lt:1704034800"]);
  });
});

describe("SPEC-CORE-138 parsing 5 an impossible range lists nothing", () => {
  it("requests no listing and answers no files", async () => {
    const listing = clockMovingListing(5);

    const result = await evaluateSmartCollection(input("modified:>2024 modified:<2023"), io(listing));

    expect(listing).not.toHaveBeenCalled();
    expect(result.files).toEqual([]);
  });
});
