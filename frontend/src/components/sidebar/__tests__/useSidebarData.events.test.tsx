/**
 * SPEC-CORE-188: the sidebar's drive-scoped lists follow the watched
 * WebSocket events, delivered through the real `useWebSocketRefresh` and
 * `WebSocketContext`.
 */
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WebSocketContext } from "@/components/WebSocketProvider";
import type { CollectionSummary, WebSocketEvent } from "@/types";
import { useSidebarData } from "../useSidebarData";

vi.mock("@/lib/api", () => ({
  getDrives: vi.fn(),
  getDriveTags: vi.fn(),
  getPins: vi.fn(),
  getCollections: vi.fn(),
  getAuthStatus: vi.fn(),
  getDriveSummary: vi.fn(),
}));

import {
  getAuthStatus,
  getCollections,
  getDrives,
  getDriveSummary,
  getDriveTags,
  getPins,
} from "@/lib/api";

const WATCHED = [
  "drive.structure_changed",
  "drive.file_updated",
  "inbox.updated",
  "upload:complete",
  "scan:complete",
  "drive.collections_changed",
  "drive.pins_changed",
  "drive.tags_changed",
] as const;

type Tag = { name: string; count: number };
type Pin = { path: string; on_home: boolean };
type Summary = { name: string; trash_count: number; missing_count: number };

const col = (id: string, name: string, drive = "main", count = 0): CollectionSummary => ({
  id,
  name,
  description: null,
  drive,
  item_count: count,
  first_file_id: null,
  created_at: "",
  updated_at: "",
});
const pin = (path: string): Pin => ({ path, on_home: false });
const summary = (missing: number, name = "main"): Summary => ({ name, trash_count: 0, missing_count: missing });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const ws: { lastEvent: WebSocketEvent | null; connected: boolean } = { lastEvent: null, connected: true };

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <WebSocketContext.Provider value={{ lastEvent: ws.lastEvent, connected: ws.connected }}>
      {children}
    </WebSocketContext.Provider>
  );
}

type Props = { drive: string | null; folder: string | null; key: number };

const flush = (ms = 0) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

async function mount(initial: Partial<Props> = {}) {
  let props: Props = { drive: "main", folder: null, key: 0, ...initial };
  const view = renderHook((p: Props) => useSidebarData(p.drive, p.folder, p.key), {
    initialProps: props,
    wrapper: Wrapper,
  });
  await flush();
  clearCalls();
  return {
    view,
    get result() {
      return view.result;
    },
    async rerender(next: Partial<Props>) {
      props = { ...props, ...next };
      await act(async () => {
        view.rerender(props);
      });
    },
    async send(event: string, drive: string | undefined = "main") {
      ws.lastEvent = { event, data: drive === undefined ? {} : { drive } };
      await act(async () => {
        view.rerender(props);
      });
    },
    async setConnected(connected: boolean) {
      ws.connected = connected;
      await act(async () => {
        view.rerender(props);
      });
    },
  };
}

function clearCalls() {
  for (const fn of [getDrives, getDriveTags, getPins, getCollections, getAuthStatus, getDriveSummary]) {
    vi.mocked(fn).mockClear();
  }
}

/** Number of reads each drive-scoped list has received since the last clear. */
function reads() {
  return {
    tags: vi.mocked(getDriveTags).mock.calls.length,
    pins: vi.mocked(getPins).mock.calls.length,
    collections: vi.mocked(getCollections).mock.calls.length,
    summary: vi.mocked(getDriveSummary).mock.calls.length,
  };
}
const NONE = { tags: 0, pins: 0, collections: 0, summary: 0 };
const ONE_ROUND = { tags: 1, pins: 1, collections: 1, summary: 1 };
const rounds = (n: number) => ({ tags: n, pins: n, collections: n, summary: n });

function answer(data: { tags?: Tag[]; pins?: Pin[]; collections?: CollectionSummary[]; summary?: Summary }) {
  vi.mocked(getDriveTags).mockResolvedValue(data.tags ?? []);
  vi.mocked(getPins).mockResolvedValue(data.pins ?? []);
  vi.mocked(getCollections).mockResolvedValue(data.collections ?? []);
  vi.mocked(getDriveSummary).mockResolvedValue(data.summary ?? summary(0));
}

function failAll() {
  vi.mocked(getDriveTags).mockRejectedValue(new Error("tags down"));
  vi.mocked(getPins).mockRejectedValue(new Error("pins down"));
  vi.mocked(getCollections).mockRejectedValue(new Error("collections down"));
  vi.mocked(getDriveSummary).mockRejectedValue(new Error("summary down"));
}

const FIRST = {
  tags: [{ name: "old-tag", count: 1 }],
  pins: [pin("old/pin")],
  collections: [col("c1", "Old")],
  summary: summary(1),
};
const SECOND = {
  tags: [{ name: "new-tag", count: 2 }],
  pins: [pin("new/pin")],
  collections: [col("c1", "Renamed", "main", 4), col("c2", "Added")],
  summary: summary(0),
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  ws.lastEvent = null;
  ws.connected = true;
  vi.mocked(getDrives).mockResolvedValue([]);
  vi.mocked(getAuthStatus).mockResolvedValue({
    unlocked_groups: [],
    has_protected_drives: false,
    is_admin: false,
  } as never);
  answer(FIRST);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("SPEC-CORE-188 I1 a watched event for the shown drive re-reads its lists", () => {
  it.each(WATCHED)("SPEC-CORE-188 I1 %s reads tags, pins, collections and summary and shows the answers", async (event) => {
    const h = await mount();
    expect(h.result.current.collectionList.map((c) => c.name)).toEqual(["Old"]);

    answer(SECOND);
    await h.send(event);
    await flush(500);

    expect(reads()).toEqual(ONE_ROUND);
    expect(getDriveTags).toHaveBeenCalledWith("main", null);
    expect(getPins).toHaveBeenCalledWith("main");
    expect(getCollections).toHaveBeenCalledWith("main");
    expect(getDriveSummary).toHaveBeenCalledWith("main");
    expect(getDrives).not.toHaveBeenCalled();
    expect(getAuthStatus).not.toHaveBeenCalled();

    expect(h.result.current.tags).toEqual({
      resolvedScope: { drive: "main", folderPath: null },
      items: SECOND.tags,
    });
    expect(h.result.current.pins).toEqual(SECOND.pins);
    expect(h.result.current.collectionList).toEqual(SECOND.collections);
    expect(h.result.current.driveSummary).toEqual(SECOND.summary);
  });

  it("SPEC-CORE-188 I4 a round reads tags with the folder current when it starts, not when the event came", async () => {
    const h = await mount();
    await h.send("drive.tags_changed");
    await flush(200);
    await h.rerender({ folder: "recipes" });
    await flush();
    clearCalls();
    await flush(300);
    expect(reads()).toEqual(ONE_ROUND);
    expect(getDriveTags).toHaveBeenCalledWith("main", "recipes");
  });
});

describe("SPEC-CORE-188 I2 events that cause no read", () => {
  it("SPEC-CORE-188 I2 ignores every watched event naming another drive, then follows one for the shown drive", async () => {
    const h = await mount();
    for (const event of WATCHED) {
      await h.send(event, "other");
      await flush(0);
    }
    await flush(2500);
    expect(reads()).toEqual(NONE);

    await h.send("drive.pins_changed");
    await flush(500);
    expect(reads()).toEqual(ONE_ROUND);
  });

  it("SPEC-CORE-188 I2 a scan of another drive does not re-read this drive's summary", async () => {
    const h = await mount();
    await h.send("scan:complete", "other");
    await flush(2500);
    expect(getDriveSummary).not.toHaveBeenCalled();
  });

  it("SPEC-CORE-188 I2 ignores events that are not watched, then follows a watched one", async () => {
    const h = await mount();
    for (const event of ["scan:progress", "files.updated", "drive.smart_folders_changed", "clip:saved"]) {
      await h.send(event);
      await flush(0);
    }
    await flush(2500);
    expect(reads()).toEqual(NONE);

    await h.send("drive.collections_changed");
    await flush(500);
    expect(reads()).toEqual(ONE_ROUND);
  });

  it("SPEC-CORE-188 I2 with no drive shown, neither events nor a reconnect read anything", async () => {
    const h = await mount({ drive: null });
    await h.send("drive.structure_changed", "main");
    await h.send("scan:complete", "main");
    await h.setConnected(false);
    await h.setConnected(true);
    await flush(2500);
    expect(reads()).toEqual(NONE);

    await h.rerender({ drive: "main" });
    await flush();
    clearCalls();
    await h.send("drive.structure_changed");
    await flush(500);
    expect(reads()).toEqual(ONE_ROUND);
  });
});

describe("SPEC-CORE-188 I3 gathering", () => {
  it("SPEC-CORE-188 I3 a single event starts the round 500 ms later, not before", async () => {
    const h = await mount();
    await h.send("drive.file_updated");
    await flush(499);
    expect(reads()).toEqual(NONE);
    await flush(1);
    expect(reads()).toEqual(ONE_ROUND);
    await flush(3000);
    expect(reads()).toEqual(ONE_ROUND);
  });

  it("SPEC-CORE-188 I3 two events 300 ms apart make one round, 500 ms after the second", async () => {
    const h = await mount();
    await h.send("drive.file_updated");
    await flush(300);
    await h.send("inbox.updated");
    await flush(499);
    expect(reads()).toEqual(NONE);
    await flush(1);
    expect(reads()).toEqual(ONE_ROUND);
    await flush(3000);
    expect(reads()).toEqual(ONE_ROUND);
  });

  it("SPEC-CORE-188 I3 a stream every 400 ms starts a round 2 s after its first event; a later event opens a new gathering", async () => {
    const h = await mount();
    await h.send("drive.file_updated");
    for (let t = 400; t <= 1600; t += 400) {
      await flush(400);
      await h.send("drive.file_updated");
    }
    // 1600 ms elapsed since the first event.
    await flush(399);
    expect(reads()).toEqual(NONE);
    await flush(1);
    expect(reads()).toEqual(ONE_ROUND);

    await flush(100);
    await h.send("drive.file_updated");
    await flush(499);
    expect(reads()).toEqual(ONE_ROUND);
    await flush(1);
    expect(reads()).toEqual(rounds(2));
  });
});

describe("SPEC-CORE-188 I9 reconnect", () => {
  it("SPEC-CORE-188 I9 a reconnect with a drive shown runs one gathered round", async () => {
    const h = await mount();
    await h.setConnected(false);
    await flush(1000);
    answer(SECOND);
    await h.setConnected(true);
    await flush(499);
    expect(reads()).toEqual(NONE);
    await flush(1);
    expect(reads()).toEqual(ONE_ROUND);
    await flush(3000);
    expect(reads()).toEqual(ONE_ROUND);
    expect(h.result.current.collectionList).toEqual(SECOND.collections);
  });
});

describe("SPEC-CORE-188 states: drive change, folder change, unmount", () => {
  it("SPEC-CORE-188 a drive change cancels a pending gathering; an event for the new drive then starts a round", async () => {
    const h = await mount();
    await h.send("drive.structure_changed");
    await flush(200);
    await h.rerender({ drive: "work" });
    await flush();
    clearCalls();
    await flush(3000);
    expect(reads()).toEqual(NONE);

    await h.send("drive.structure_changed", "work");
    await flush(500);
    expect(reads()).toEqual(ONE_ROUND);
    expect(getPins).toHaveBeenCalledWith("work");
  });

  it("SPEC-CORE-188 I4 answers of a round started for the previous drive are discarded", async () => {
    const h = await mount();
    const tags = deferred<Tag[]>();
    const pins = deferred<Pin[]>();
    const cols = deferred<CollectionSummary[]>();
    const sum = deferred<Summary>();
    vi.mocked(getDriveTags).mockReturnValueOnce(tags.promise);
    vi.mocked(getPins).mockReturnValueOnce(pins.promise);
    vi.mocked(getCollections).mockReturnValueOnce(cols.promise);
    vi.mocked(getDriveSummary).mockReturnValueOnce(sum.promise as never);
    await h.send("drive.structure_changed");
    await flush(500);
    expect(reads()).toEqual(ONE_ROUND);

    const WORK = {
      tags: [{ name: "work-tag", count: 1 }],
      pins: [pin("work/pin")],
      collections: [col("w1", "Work", "work")],
      summary: summary(7, "work"),
    };
    answer(WORK);
    await h.rerender({ drive: "work" });
    await flush();
    expect(h.result.current.collectionList).toEqual(WORK.collections);

    await act(async () => {
      tags.resolve([{ name: "main-late", count: 1 }]);
      pins.resolve([pin("main/late")]);
      cols.resolve([col("m9", "Main late")]);
      sum.resolve(summary(9));
    });
    await flush();

    expect(h.result.current.tags).toEqual({ resolvedScope: { drive: "work", folderPath: null }, items: WORK.tags });
    expect(h.result.current.pins).toEqual(WORK.pins);
    expect(h.result.current.collectionList).toEqual(WORK.collections);
    expect(h.result.current.driveSummary).toEqual(WORK.summary);
  });

  it("SPEC-CORE-188 I5 a failure of a round started for the previous drive leaves the new drive's rows", async () => {
    const h = await mount();
    const tags = deferred<Tag[]>();
    const pins = deferred<Pin[]>();
    const cols = deferred<CollectionSummary[]>();
    const sum = deferred<Summary>();
    vi.mocked(getDriveTags).mockReturnValueOnce(tags.promise);
    vi.mocked(getPins).mockReturnValueOnce(pins.promise);
    vi.mocked(getCollections).mockReturnValueOnce(cols.promise);
    vi.mocked(getDriveSummary).mockReturnValueOnce(sum.promise as never);
    await h.send("drive.structure_changed");
    await flush(500);
    expect(reads()).toEqual(ONE_ROUND);

    const WORK = {
      tags: [{ name: "work-tag", count: 1 }],
      pins: [pin("work/pin")],
      collections: [col("w1", "Work", "work")],
      summary: summary(7, "work"),
    };
    answer(WORK);
    await h.rerender({ drive: "work" });
    await flush();

    await act(async () => {
      tags.reject(new Error("late"));
      pins.reject(new Error("late"));
      cols.reject(new Error("late"));
      sum.reject(new Error("late"));
    });
    await flush();

    expect(h.result.current.tags).toEqual({ resolvedScope: { drive: "work", folderPath: null }, items: WORK.tags });
    expect(h.result.current.pins).toEqual(WORK.pins);
    expect(h.result.current.collectionList).toEqual(WORK.collections);
    expect(h.result.current.driveSummary).toEqual(WORK.summary);
  });

  it("SPEC-CORE-188 a folder change discards the round's tag answer but applies its pins, collections and summary", async () => {
    const h = await mount();
    const tags = deferred<Tag[]>();
    const pins = deferred<Pin[]>();
    const cols = deferred<CollectionSummary[]>();
    const sum = deferred<Summary>();
    vi.mocked(getDriveTags).mockReturnValueOnce(tags.promise);
    vi.mocked(getPins).mockReturnValueOnce(pins.promise);
    vi.mocked(getCollections).mockReturnValueOnce(cols.promise);
    vi.mocked(getDriveSummary).mockReturnValueOnce(sum.promise as never);
    await h.send("drive.structure_changed");
    await flush(500);
    expect(getDriveTags).toHaveBeenCalledWith("main", null);

    const scoped = [{ name: "soup", count: 3 }];
    vi.mocked(getDriveTags).mockResolvedValue(scoped);
    await h.rerender({ folder: "recipes" });
    await flush();
    expect(getDriveTags).toHaveBeenLastCalledWith("main", "recipes");

    await act(async () => {
      tags.resolve([{ name: "drive-wide", count: 9 }]);
      pins.resolve(SECOND.pins);
      cols.resolve(SECOND.collections);
      sum.resolve(SECOND.summary);
    });
    await flush();

    expect(h.result.current.tags).toEqual({ resolvedScope: { drive: "main", folderPath: "recipes" }, items: scoped });
    expect(h.result.current.pins).toEqual(SECOND.pins);
    expect(h.result.current.collectionList).toEqual(SECOND.collections);
    expect(h.result.current.driveSummary).toEqual(SECOND.summary);
  });

  it("SPEC-CORE-188 unmount cancels a pending gathering", async () => {
    const h = await mount();
    await h.send("drive.structure_changed");
    await flush(500);
    expect(reads()).toEqual(ONE_ROUND);
    clearCalls();

    await h.send("drive.structure_changed");
    await flush(100);
    h.view.unmount();
    await flush(3000);
    expect(reads()).toEqual(NONE);
  });
});

describe("SPEC-CORE-188 I4 sequence: an older success never replaces a newer one", () => {
  it("SPEC-CORE-188 I4 overlapping rounds: the second round's answers stand when the first answers last", async () => {
    const h = await mount();
    const tags = deferred<Tag[]>();
    const pins = deferred<Pin[]>();
    const cols = deferred<CollectionSummary[]>();
    const sum = deferred<Summary>();
    vi.mocked(getDriveTags).mockReturnValueOnce(tags.promise);
    vi.mocked(getPins).mockReturnValueOnce(pins.promise);
    vi.mocked(getCollections).mockReturnValueOnce(cols.promise);
    vi.mocked(getDriveSummary).mockReturnValueOnce(sum.promise as never);
    await h.send("drive.structure_changed");
    await flush(500);
    expect(reads()).toEqual(ONE_ROUND);

    answer(SECOND);
    await h.send("drive.collections_changed");
    await flush(500);
    expect(reads()).toEqual(rounds(2));
    expect(h.result.current.collectionList).toEqual(SECOND.collections);

    await act(async () => {
      tags.resolve([{ name: "stale", count: 1 }]);
      pins.resolve([pin("stale")]);
      cols.resolve([col("s", "Stale")]);
      sum.resolve(summary(99));
    });
    await flush();

    expect(h.result.current.tags?.items).toEqual(SECOND.tags);
    expect(h.result.current.pins).toEqual(SECOND.pins);
    expect(h.result.current.collectionList).toEqual(SECOND.collections);
    expect(h.result.current.driveSummary).toEqual(SECOND.summary);
  });

  it("SPEC-CORE-188 I4 a refreshKey read answering after a later round does not replace the round's answers", async () => {
    const h = await mount();
    const cols = deferred<CollectionSummary[]>();
    const sum = deferred<Summary>();
    vi.mocked(getCollections).mockReturnValueOnce(cols.promise);
    vi.mocked(getDriveSummary).mockReturnValueOnce(sum.promise as never);
    await h.rerender({ key: 1 });
    await flush();

    answer(SECOND);
    await h.send("drive.collections_changed");
    await flush(500);
    expect(h.result.current.collectionList).toEqual(SECOND.collections);

    await act(async () => {
      cols.resolve([col("s", "Stale")]);
      sum.resolve(summary(99));
    });
    await flush();
    expect(h.result.current.collectionList).toEqual(SECOND.collections);
    expect(h.result.current.driveSummary).toEqual(SECOND.summary);
  });
});

describe("SPEC-CORE-188 I5 a failed read never removes rows of its own scope", () => {
  it("SPEC-CORE-188 I5 a failed round keeps every list as shown", async () => {
    const h = await mount();
    const before = h.result.current;
    expect(before.collectionList).toEqual(FIRST.collections);

    failAll();
    await h.send("drive.structure_changed");
    await flush(500);
    expect(reads()).toEqual(ONE_ROUND);

    expect(h.result.current.tags).toEqual({ resolvedScope: { drive: "main", folderPath: null }, items: FIRST.tags });
    expect(h.result.current.pins).toEqual(FIRST.pins);
    expect(h.result.current.collectionList).toEqual(FIRST.collections);
    expect(h.result.current.driveSummary).toEqual(FIRST.summary);
  });

  it("SPEC-CORE-188 I5 a failed refreshKey read keeps every list as shown", async () => {
    const h = await mount();
    failAll();
    await h.rerender({ key: 1 });
    await flush();
    expect(getCollections).toHaveBeenCalled();

    expect(h.result.current.tags).toEqual({ resolvedScope: { drive: "main", folderPath: null }, items: FIRST.tags });
    expect(h.result.current.pins).toEqual(FIRST.pins);
    expect(h.result.current.collectionList).toEqual(FIRST.collections);
    expect(h.result.current.driveSummary).toEqual(FIRST.summary);
  });

  it("SPEC-CORE-188 I5 with nothing shown yet, a newer failure leaves the list empty and the older success is then shown", async () => {
    const tags = deferred<Tag[]>();
    const pins = deferred<Pin[]>();
    const cols = deferred<CollectionSummary[]>();
    const sum = deferred<Summary>();
    vi.mocked(getDriveTags).mockReturnValueOnce(tags.promise);
    vi.mocked(getPins).mockReturnValueOnce(pins.promise);
    vi.mocked(getCollections).mockReturnValueOnce(cols.promise);
    vi.mocked(getDriveSummary).mockReturnValueOnce(sum.promise as never);
    const h = await mount();
    expect(reads()).toEqual(NONE);

    failAll();
    await h.send("drive.structure_changed");
    await flush(500);
    expect(reads()).toEqual(ONE_ROUND);
    expect(h.result.current.tags).toEqual({ resolvedScope: { drive: "main", folderPath: null }, items: [] });
    expect(h.result.current.pins).toEqual([]);
    expect(h.result.current.collectionList).toEqual([]);
    expect(h.result.current.driveSummary).toBeNull();

    await act(async () => {
      tags.resolve(FIRST.tags);
      pins.resolve(FIRST.pins);
      cols.resolve(FIRST.collections);
      sum.resolve(FIRST.summary);
    });
    await flush();

    expect(h.result.current.tags).toEqual({ resolvedScope: { drive: "main", folderPath: null }, items: FIRST.tags });
    expect(h.result.current.pins).toEqual(FIRST.pins);
    expect(h.result.current.collectionList).toEqual(FIRST.collections);
    expect(h.result.current.driveSummary).toEqual(FIRST.summary);
  });
});

describe("SPEC-CORE-188 reloadCollections", () => {
  it("SPEC-CORE-188 reloadCollections shows the new list on success", async () => {
    const h = await mount();
    vi.mocked(getCollections).mockResolvedValue(SECOND.collections);
    await act(async () => {
      await h.result.current.reloadCollections();
    });
    expect(getCollections).toHaveBeenCalledWith("main");
    expect(h.result.current.collectionList).toEqual(SECOND.collections);
  });

  it("SPEC-CORE-188 I5 reloadCollections resolves on a failed read and keeps the list", async () => {
    const h = await mount();
    vi.mocked(getCollections).mockRejectedValue(new Error("down"));
    let outcome: "resolved" | "rejected" = "rejected";
    await act(async () => {
      await h.result.current.reloadCollections().then(
        () => {
          outcome = "resolved";
        },
        () => {
          outcome = "rejected";
        },
      );
    });
    expect(outcome).toBe("resolved");
    expect(h.result.current.collectionList).toEqual(FIRST.collections);
  });

  it("SPEC-CORE-188 I4 reloadCollections answering after a later round is discarded, and still resolves", async () => {
    const h = await mount();
    const cols = deferred<CollectionSummary[]>();
    vi.mocked(getCollections).mockReturnValueOnce(cols.promise);
    let settled: "pending" | "resolved" | "rejected" = "pending";
    let reload!: Promise<void>;
    await act(async () => {
      reload = h.result.current.reloadCollections().then(
        () => {
          settled = "resolved";
        },
        () => {
          settled = "rejected";
        },
      );
    });

    answer(SECOND);
    await h.send("drive.collections_changed");
    await flush(500);
    expect(h.result.current.collectionList).toEqual(SECOND.collections);

    await act(async () => {
      cols.resolve([col("s", "Stale")]);
      await reload;
    });
    expect(settled).toBe("resolved");
    expect(h.result.current.collectionList).toEqual(SECOND.collections);
  });
});
