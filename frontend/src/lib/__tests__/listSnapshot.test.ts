import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

import {
  buildListSnapshotKey,
  clearListSnapshot,
  loadListSnapshot,
  saveListSnapshot,
  type ListSnapshot,
} from "../listSnapshot";
import type { FileItem } from "@/types";

function makeFile(id: string): FileItem {
  return {
    image_width: null,
    image_height: null,
    id,
    filename: `${id}.mp4`,
    title: `File ${id}`,
    description: "",
    drive: "main",
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: "",
    has_thumbnail: true,
    file_size: 1024,
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
  };
}

const BASE_SNAPSHOT: Omit<ListSnapshot, "ts"> = {
  key: "main|photos||",
  scrollY: 840,
  pagesLoaded: 3,
  items: [makeFile("a"), makeFile("b")],
  total: 90,
  folders: [{ name: "sub", path: "photos/sub", file_count: 5, kind_counts: {}, dominant_kind: null }],
  filters: { sort: "created_at", order: "desc", typeFilter: null, viewMode: "grid" },
};

describe("listSnapshot", () => {
  beforeEach(() => {
    try {
      window.sessionStorage.clear();
    } catch {
      // ignore
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("buildListSnapshotKey", () => {
    it("joins parts with pipes and stabilizes nullish values to empty strings", () => {
      expect(buildListSnapshotKey({ driveName: "main" })).toBe("main|||");
      expect(
        buildListSnapshotKey({ driveName: "main", folderPath: "a/b", view: null, tagFilter: "x" }),
      ).toBe("main|a/b||x");
      expect(
        buildListSnapshotKey({ driveName: "main", view: "favorites" }),
      ).toBe("main||favorites|");
    });
  });

  describe("saveListSnapshot / loadListSnapshot", () => {
    it("round-trips a snapshot and injects ts", () => {
      saveListSnapshot(BASE_SNAPSHOT);
      const loaded = loadListSnapshot("main|photos||");
      expect(loaded).not.toBeNull();
      expect(loaded?.items).toHaveLength(2);
      expect(loaded?.scrollY).toBe(840);
      expect(loaded?.pagesLoaded).toBe(3);
      expect(loaded?.filters.sort).toBe("created_at");
      expect(typeof loaded?.ts).toBe("number");
    });

    it("returns null when the key does not match", () => {
      saveListSnapshot(BASE_SNAPSHOT);
      expect(loadListSnapshot("different-key")).toBeNull();
    });

    it("returns null when nothing is stored", () => {
      expect(loadListSnapshot("main|photos||")).toBeNull();
    });

    it("returns null and evicts the entry after the TTL lapses", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-22T12:00:00Z"));
      saveListSnapshot(BASE_SNAPSHOT);
      vi.setSystemTime(new Date("2026-04-22T14:00:01Z")); // 2h 1s later
      expect(loadListSnapshot("main|photos||")).toBeNull();
      expect(window.sessionStorage.getItem("hv_list_snapshot")).toBeNull();
    });

    it("returns null on malformed JSON", () => {
      window.sessionStorage.setItem("hv_list_snapshot", "not-json");
      expect(loadListSnapshot("main|photos||")).toBeNull();
    });

    it("evicts entries whose shape does not validate (e.g. schema change)", () => {
      window.sessionStorage.setItem(
        "hv_list_snapshot",
        JSON.stringify({ key: "main|photos||", items: "not-an-array", ts: Date.now() }),
      );
      expect(loadListSnapshot("main|photos||")).toBeNull();
      expect(window.sessionStorage.getItem("hv_list_snapshot")).toBeNull();
    });

    it("rejects snapshots with unknown enum values for filters", () => {
      const bad = {
        ...BASE_SNAPSHOT,
        filters: { ...BASE_SNAPSHOT.filters, sort: "totally_invalid" },
        ts: Date.now(),
      };
      window.sessionStorage.setItem("hv_list_snapshot", JSON.stringify(bad));
      expect(loadListSnapshot("main|photos||")).toBeNull();
    });

    it("evicts a snapshot holding a retired sort field", () => {
      // Same hazard as the folderPrefs fallback: "likes" outlives the
      // deploy that removed it, and replaying it would 422
      // (spec 2026-09-01-favorite-like-separation).
      const stale = {
        ...BASE_SNAPSHOT,
        filters: { ...BASE_SNAPSHOT.filters, sort: "likes" },
        ts: Date.now(),
      };
      window.sessionStorage.setItem("hv_list_snapshot", JSON.stringify(stale));
      expect(loadListSnapshot("main|photos||")).toBeNull();
      expect(window.sessionStorage.getItem("hv_list_snapshot")).toBeNull();
    });

    it("returns a random-sort snapshot (caller is responsible for discarding it)", () => {
      // "random" is a valid SortField, so loadListSnapshot returns it.
      // FolderBrowser's lazy useState initializer discards it to prevent
      // restoring a stale random-ordered list.
      saveListSnapshot({
        ...BASE_SNAPSHOT,
        filters: { ...BASE_SNAPSHOT.filters, sort: "random" },
      });
      const loaded = loadListSnapshot("main|photos||");
      expect(loaded).not.toBeNull();
      expect(loaded?.filters.sort).toBe("random");
    });

    it("accepts snapshots exactly at the TTL boundary", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-22T12:00:00Z"));
      saveListSnapshot(BASE_SNAPSHOT);
      vi.setSystemTime(new Date("2026-04-22T14:00:00Z")); // exactly 2h later
      expect(loadListSnapshot("main|photos||")).not.toBeNull();
    });

    it("does not throw when sessionStorage.setItem raises (quota exceeded)", () => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function () {
        throw new DOMException("QuotaExceededError");
      };
      try {
        expect(() => saveListSnapshot(BASE_SNAPSHOT)).not.toThrow();
      } finally {
        Storage.prototype.setItem = original;
      }
    });
  });

  describe("clearListSnapshot", () => {
    it("removes a previously saved snapshot", () => {
      saveListSnapshot(BASE_SNAPSHOT);
      clearListSnapshot();
      expect(loadListSnapshot("main|photos||")).toBeNull();
    });

    it("is a no-op when nothing is saved", () => {
      expect(() => clearListSnapshot()).not.toThrow();
    });
  });
});
