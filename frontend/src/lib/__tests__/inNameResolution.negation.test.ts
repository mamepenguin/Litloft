/**
 * SPEC-CORE-172 sending 1-2 and I18: `-in:` names are classified with the
 * `in:` names, a name only a Smart Collection carries is refused, the save
 * check refuses it too, and the resolution waits for the lists and the
 * evaluation before it answers.
 */

import { describe, expect, it, vi } from "vitest";

import {
  checkInNamesForSave,
  inNamesKey,
  MEMBER_ID_LIMIT,
  resolveInNames,
  type InNameIo,
} from "../inNameResolution";
import type { PaginatedResponse } from "@/types";
import type { SmartFolder } from "@/types/smartFolder";

const DRIVE = "main";

function smartFolder(id: string, name: string, query: string): SmartFolder {
  return {
    id,
    drive: DRIVE,
    name,
    query,
    file_type: null,
    sort_by: null,
    sort_order: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: null,
  };
}

function collection(id: string, name: string) {
  return {
    id,
    name,
    description: null,
    drive: DRIVE,
    item_count: 1,
    first_file_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

const EMPTY_PAGE: PaginatedResponse = {
  data: [],
  meta: { total: 0, page: 1, limit: 500 },
};

interface Harness {
  io: InNameIo;
  getCollections: ReturnType<typeof vi.fn>;
  getSmartFolders: ReturnType<typeof vi.fn>;
  getDriveFiles: ReturnType<typeof vi.fn>;
}

function harness(overrides: Partial<InNameIo> = {}): Harness {
  const io = {
    getCollections: vi.fn(async () => [] as ReturnType<typeof collection>[]),
    getSmartFolders: vi.fn(async () => [] as SmartFolder[]),
    getDriveFiles: vi.fn(async () => EMPTY_PAGE),
    getSemanticAvailability: vi.fn(async () => "available" as const),
    fetchSemanticHits: vi.fn(async () => ({ ok: true, results: [] })),
    ...overrides,
  } as unknown as InNameIo;
  return {
    io,
    getCollections: io.getCollections as unknown as ReturnType<typeof vi.fn>,
    getSmartFolders: io.getSmartFolders as unknown as ReturnType<typeof vi.fn>,
    getDriveFiles: io.getDriveFiles as unknown as ReturnType<typeof vi.fn>,
  };
}

describe("SPEC-CORE-172 sending 1 the -in: name is classified with the in: names", () => {
  it("refuses a -in: name only a Smart Collection carries and evaluates nothing", async () => {
    const { io, getDriveFiles, getSmartFolders } = harness({
      getSmartFolders: vi.fn(async () => [smartFolder("sf-weekly", "Weekly", "dogs")]),
    });

    const outcome = await resolveInNames(
      DRIVE,
      { collections: [], excludedCollections: ["weekly"] },
      undefined,
      io,
    );

    expect(outcome).toEqual({ status: "refused" });
    expect(getSmartFolders).toHaveBeenCalledTimes(1);
    expect(getDriveFiles).not.toHaveBeenCalled();
  });

  it("sends a -in: name a regular collection carries as an excluded collection, with no Smart Collection list", async () => {
    const { io, getSmartFolders, getDriveFiles } = harness({
      getCollections: vi.fn(async () => [collection("c1", "Trip")]),
    });

    const outcome = await resolveInNames(
      DRIVE,
      { collections: [], excludedCollections: ["trip"] },
      undefined,
      io,
    );

    expect(outcome).toEqual({ status: "resolved", collections: [], fileIds: null });
    expect(getSmartFolders).not.toHaveBeenCalled();
    expect(getDriveFiles).not.toHaveBeenCalled();
  });

  it("sends a -in: name nothing carries as an excluded collection after both lists load", async () => {
    const { io, getSmartFolders, getDriveFiles } = harness();

    const outcome = await resolveInNames(
      DRIVE,
      { collections: [], excludedCollections: ["Nowhere"] },
      undefined,
      io,
    );

    expect(outcome).toEqual({ status: "resolved", collections: [], fileIds: null });
    expect(getSmartFolders).toHaveBeenCalledTimes(1);
    expect(getDriveFiles).not.toHaveBeenCalled();
  });

  it("a -in: name does not stop an in: Smart Collection from being evaluated when no name is refused", async () => {
    const { io, getDriveFiles } = harness({
      getCollections: vi.fn(async () => [collection("c1", "Trip")]),
      getSmartFolders: vi.fn(async () => [smartFolder("sf-weekly", "Weekly", "dogs")]),
      getDriveFiles: vi.fn(async () => ({
        data: [{ id: "m1" }],
        meta: { total: 1, page: 1, limit: 500 },
      })) as unknown as InNameIo["getDriveFiles"],
    });

    const outcome = await resolveInNames(
      DRIVE,
      { collections: ["Weekly"], excludedCollections: ["Trip"] },
      undefined,
      io,
    );

    expect(outcome).toEqual({
      status: "resolved",
      collections: [],
      fileIds: ["m1"],
    });
    expect(getDriveFiles).toHaveBeenCalled();
  });

  it("fails without asking for the Smart Collection list when the collection list fails", async () => {
    const { io, getSmartFolders } = harness({
      getCollections: vi.fn(async () => {
        throw new Error("boom");
      }),
    });

    const outcome = await resolveInNames(
      DRIVE,
      { collections: [], excludedCollections: ["Trip"] },
      undefined,
      io,
    );

    expect(outcome).toEqual({ status: "failed" });
    expect(getSmartFolders).not.toHaveBeenCalled();
  });
});

describe("SPEC-CORE-172 sending 1 the resolution waits for its inputs", () => {
  it("answers nothing while the collection list loads", async () => {
    let release: ((names: ReturnType<typeof collection>[]) => void) | null = null;
    const { io, getSmartFolders, getDriveFiles } = harness({
      getCollections: vi.fn(
        () =>
          new Promise<ReturnType<typeof collection>[]>((resolve) => {
            release = resolve;
          }),
      ) as unknown as InNameIo["getCollections"],
    });
    let settled = false;

    const pending = resolveInNames(
      DRIVE,
      { collections: [], excludedCollections: ["Trip"] },
      undefined,
      io,
    ).then((outcome) => {
      settled = true;
      return outcome;
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(settled).toBe(false);
    expect(getSmartFolders).not.toHaveBeenCalled();
    expect(getDriveFiles).not.toHaveBeenCalled();

    release!([]);
    await expect(pending).resolves.toEqual({
      status: "resolved",
      collections: [],
      fileIds: null,
    });
  });

  it("answers nothing while an in: Smart Collection is evaluated", async () => {
    let release: ((page: PaginatedResponse) => void) | null = null;
    const { io } = harness({
      getSmartFolders: vi.fn(async () => [smartFolder("sf-weekly", "Weekly", "dogs")]),
      getDriveFiles: vi.fn(
        () =>
          new Promise<PaginatedResponse>((resolve) => {
            release = resolve;
          }),
      ) as unknown as InNameIo["getDriveFiles"],
    });
    let settled = false;

    const pending = resolveInNames(
      DRIVE,
      { collections: ["Weekly"], excludedCollections: [] },
      undefined,
      io,
    ).then((outcome) => {
      settled = true;
      return outcome;
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(settled).toBe(false);

    release!({ data: [{ id: "m1" }], meta: { total: 1, page: 1, limit: 500 } } as PaginatedResponse);
    await expect(pending).resolves.toEqual({
      status: "resolved",
      collections: [],
      fileIds: ["m1"],
    });
  });

  it("stops an in: Smart Collection with no free text after one page over the member limit", async () => {
    const { io, getDriveFiles } = harness({
      getSmartFolders: vi.fn(async () => [smartFolder("sf-big", "Big", "-path:Work")]),
      getDriveFiles: vi.fn(async () => ({
        data: [{ id: "k0" }],
        meta: { total: MEMBER_ID_LIMIT + 1, page: 1, limit: 500 },
      })) as unknown as InNameIo["getDriveFiles"],
    });

    const outcome = await resolveInNames(
      DRIVE,
      { collections: ["Big"], excludedCollections: [] },
      undefined,
      io,
    );

    expect(outcome).toEqual({ status: "tooLarge" });
    expect(getDriveFiles).toHaveBeenCalledTimes(1);
  });
});

describe("SPEC-CORE-172 sending 2 the save check", () => {
  it("refuses a -in: name only a Smart Collection carries", async () => {
    const { io, getSmartFolders } = harness({
      getSmartFolders: vi.fn(async () => [smartFolder("sf-weekly", "Weekly", "dogs")]),
    });

    await expect(
      checkInNamesForSave(DRIVE, { collections: [], excludedCollections: ["Weekly"] }, io),
    ).resolves.toBe("refused");
    expect(getSmartFolders).toHaveBeenCalled();
  });

  it("saves a -in: name a regular collection or nothing carries", async () => {
    const trip = harness({ getCollections: vi.fn(async () => [collection("c1", "Trip")]) });
    const nowhere = harness();

    await expect(
      checkInNamesForSave(DRIVE, { collections: [], excludedCollections: ["Trip"] }, trip.io),
    ).resolves.toBe("ok");
    await expect(
      checkInNamesForSave(DRIVE, { collections: [], excludedCollections: ["Nowhere"] }, nowhere.io),
    ).resolves.toBe("ok");
  });

  it("reports a failed list load", async () => {
    const { io } = harness({
      getCollections: vi.fn(async () => {
        throw new Error("boom");
      }),
    });

    await expect(
      checkInNamesForSave(DRIVE, { collections: [], excludedCollections: ["Trip"] }, io),
    ).resolves.toBe("failed");
  });
});

describe("SPEC-CORE-116 I4 as revised the in: key covers both polarities", () => {
  it("tells the same name's polarities apart and keeps both", () => {
    const positive = inNamesKey(DRIVE, { collections: ["Trip"], excludedCollections: [] });
    const negative = inNamesKey(DRIVE, { collections: [], excludedCollections: ["Trip"] });
    const both = inNamesKey(DRIVE, { collections: ["Trip"], excludedCollections: ["trip"] });

    expect(positive).not.toBe(negative);
    expect(both).not.toBe(positive);
    expect(both).not.toBe(negative);
    expect(inNamesKey(DRIVE, { collections: ["Trip"], excludedCollections: [] })).toBe(
      inNamesKey(DRIVE, { collections: ["trip"], excludedCollections: [] }),
    );
    expect(inNamesKey(DRIVE, { collections: [], excludedCollections: [] })).toBe("");
  });
});
