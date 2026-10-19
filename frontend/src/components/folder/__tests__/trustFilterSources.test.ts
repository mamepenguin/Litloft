import { describe, it, expect } from "vitest";

import { matchesTrustFilter } from "../useFolderFiles";
import type { FileItem } from "@/types";

type TrustShape = Pick<
  FileItem,
  "trust_tier" | "trust_reviewed_at" | "trust_unknown"
>;

const migrated: TrustShape = { trust_tier: "verified", trust_reviewed_at: null };
const judged: TrustShape = {
  trust_tier: "verified",
  trust_reviewed_at: "2026-08-29T00:00:00Z",
};
const freshClip: TrustShape = {
  trust_tier: "unverified",
  trust_reviewed_at: null,
};
const rejected: TrustShape = {
  trust_tier: "unverified",
  trust_reviewed_at: "2026-08-29T00:00:00Z",
};

const unhydrated: TrustShape & { trust_unknown: true } = {
  trust_tier: "verified",
  trust_reviewed_at: null,
  trust_unknown: true,
};

describe("matchesTrustFilter", () => {
  it("admits everything when no filter is set", () => {
    for (const f of [migrated, judged, freshClip, rejected]) {
      expect(matchesTrustFilter(f, null)).toBe(true);
    }
  });

  it("selects a tier for verified/unverified", () => {
    expect(matchesTrustFilter(migrated, "verified")).toBe(true);
    expect(matchesTrustFilter(judged, "verified")).toBe(true);
    expect(matchesTrustFilter(freshClip, "verified")).toBe(false);

    expect(matchesTrustFilter(freshClip, "unverified")).toBe(true);
    expect(matchesTrustFilter(judged, "unverified")).toBe(false);
  });

  it("treats 'unreviewed' as a stamp check, not a tier", () => {
    // The migrated backlog is verified but unjudged, and is exactly what
    // the review queue exists to surface.
    expect(matchesTrustFilter(migrated, "unreviewed")).toBe(true);
    expect(matchesTrustFilter(freshClip, "unreviewed")).toBe(true);
    expect(matchesTrustFilter(judged, "unreviewed")).toBe(false);
    expect(matchesTrustFilter(rejected, "unreviewed")).toBe(false);
  });

  it("drops hits core could not hydrate while a filter is active", () => {
    // Their real tier is unknown, and the placeholder values would otherwise
    // let one row satisfy both "Verified only" and "Not reviewed only".
    expect(matchesTrustFilter(unhydrated, "verified")).toBe(false);
    expect(matchesTrustFilter(unhydrated, "unreviewed")).toBe(false);
    expect(matchesTrustFilter(unhydrated, "unverified")).toBe(false);
    expect(matchesTrustFilter(unhydrated, null)).toBe(true);
  });
});
