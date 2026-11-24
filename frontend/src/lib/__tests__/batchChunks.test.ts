import { describe, it, expect, vi, afterEach } from "vitest";
import { runChunked } from "../batchChunks";

// Answer shapes are the server's: `{ deleted | purged, errors: [{ id, error }] }`.
type Answer = { deleted?: number; purged?: number; errors: { id: string; error: string }[] };
type Send = (chunk: string[], signal: AbortSignal) => Promise<Answer>;

const idsOf = (n: number, prefix = "f") =>
  Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(4, "0")}`);

const allOk = (chunk: string[]): Answer => ({ deleted: chunk.length, errors: [] });

const sorted = (xs: string[]) => [...xs].sort();

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Behaves like fetch with a signal: hangs until aborted, then rejects.
function hangUntilAborted(signal: AbortSignal): Promise<never> {
  return new Promise<never>((_, reject) => {
    signal.addEventListener("abort", () =>
      reject(new DOMException("The operation was aborted.", "AbortError")),
    );
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("SPEC-CORE-120 I1: chunking into requests of at most 100 ids", () => {
  it.each([
    [1, [1]],
    [100, [100]],
    [101, [100, 1]],
    [250, [100, 100, 50]],
  ])("N=%i sends one request per chunk with sizes %j", async (n, sizes) => {
    const ids = idsOf(n);
    const send = vi.fn<Send>(async (chunk) => allOk(chunk));

    await runChunked(ids, send);

    expect(send.mock.calls.map(([chunk]) => chunk.length)).toEqual(sizes);
  });

  it("I1 [SPEC-CORE-120] concatenated chunks equal the ids in insertion order, each id sent once", async () => {
    const ids = idsOf(250);
    const send = vi.fn<Send>(async (chunk) => allOk(chunk));

    await runChunked(ids, send);

    const sent = send.mock.calls.flatMap(([chunk]) => chunk);
    expect(sent).toEqual(ids);
    expect(new Set(sent).size).toBe(sent.length);
  });

  it("I1 [SPEC-CORE-120] zero ids sends no request and reports nothing processed or unconfirmed", async () => {
    const send = vi.fn<Send>(async (chunk) => allOk(chunk));

    const result = await runChunked([], send);

    expect(send).not.toHaveBeenCalled();
    expect(result.processed).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(result.unconfirmed).toEqual([]);
    expect(result.stopped).toBe(false);
  });
});

describe("SPEC-CORE-120 I3: strictly sequential requests", () => {
  it("I3 [SPEC-CORE-120] the next chunk is not sent until the previous answer arrives", async () => {
    const ids = idsOf(250);
    const first = deferred<Answer>();
    const second = deferred<Answer>();
    const send = vi
      .fn<Send>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockImplementationOnce(async (chunk) => allOk(chunk));

    const run = runChunked(ids, send);
    await Promise.resolve();
    await Promise.resolve();
    expect(send).toHaveBeenCalledTimes(1);

    first.resolve(allOk(ids.slice(0, 100)));
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[1][0]).toEqual(ids.slice(100, 200));

    second.resolve(allOk(ids.slice(100, 200)));
    await run;
    expect(send).toHaveBeenCalledTimes(3);
  });
});

describe("SPEC-CORE-120 I2: processed count during a run", () => {
  it("I2 [SPEC-CORE-120] onProgress reports processed-so-far and the run's total, excluding per-file errors", async () => {
    const ids = idsOf(150);
    const send = vi.fn<Send>(async (chunk) => {
      if (chunk[0] === ids[0]) {
        return { deleted: 99, errors: [{ id: ids[0], error: "not found" }] };
      }
      return allOk(chunk);
    });
    const onProgress = vi.fn();

    await runChunked(ids, send, { onProgress });

    expect(onProgress.mock.calls).toEqual([
      [99, 150],
      [149, 150],
    ]);
  });

  it("I2 [SPEC-CORE-120] the processed count never exceeds the run's id count", async () => {
    const ids = idsOf(101);
    const send = vi.fn<Send>(async (chunk) => allOk(chunk));
    const onProgress = vi.fn();

    await runChunked(ids, send, { onProgress });

    for (const [processedSoFar, total] of onProgress.mock.calls) {
      expect(total).toBe(101);
      expect(processedSoFar).toBeLessThanOrEqual(total);
    }
    expect(onProgress.mock.calls.at(-1)?.[0]).toBe(101);
  });
});

describe("SPEC-CORE-120 result of a run", () => {
  it("full success: every id processed, none failed or unconfirmed, not stopped", async () => {
    const ids = idsOf(3);
    const result = await runChunked(ids, async (chunk) => allOk(chunk));

    expect(sorted(result.processed)).toEqual(sorted(ids));
    expect(result.failed).toEqual([]);
    expect(result.unconfirmed).toEqual([]);
    expect(result.stopped).toBe(false);
  });

  it("per-file errors are failed, the run is not stopped, and the next chunk is still sent", async () => {
    const ids = idsOf(150);
    const send = vi.fn<Send>(async (chunk) => {
      if (chunk[0] === ids[0]) {
        return {
          deleted: 98,
          errors: [
            { id: ids[0], error: "not found" },
            { id: ids[5], error: "locked" },
          ],
        };
      }
      return allOk(chunk);
    });

    const result = await runChunked(ids, send);

    expect(send).toHaveBeenCalledTimes(2);
    expect(sorted(result.failed)).toEqual(sorted([ids[0], ids[5]]));
    expect(result.processed).toHaveLength(148);
    expect(result.processed).not.toContain(ids[0]);
    expect(result.processed).not.toContain(ids[5]);
    expect(result.unconfirmed).toEqual([]);
    expect(result.stopped).toBe(false);
  });

  it("I6 [SPEC-CORE-120] processed, failed and unconfirmed ids partition the run's ids", async () => {
    const ids = idsOf(250);
    const send = vi.fn<Send>(async (chunk) => {
      if (chunk[0] === ids[0]) {
        return { deleted: 99, errors: [{ id: ids[0], error: "x" }] };
      }
      throw new Error("500");
    });

    const result = await runChunked(ids, send);

    const all = [...result.processed, ...result.failed, ...result.unconfirmed];
    expect(sorted(all)).toEqual(sorted(ids));
  });
});

describe("SPEC-CORE-120 I4: a failed chunk stops the run", () => {
  it.each([
    ["rejects with a network error", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["rejects with a non-2xx status", () => Promise.reject(new Error("API error: 500 Internal Server Error"))],
  ])("I4 [SPEC-CORE-120] when the second chunk %s, the third is never sent", async (_label, failSecond) => {
    const ids = idsOf(250);
    let call = 0;
    const send = vi.fn<Send>(async (chunk) => {
      call += 1;
      if (call === 2) return failSecond();
      return allOk(chunk);
    });

    const result = await runChunked(ids, send);

    expect(send).toHaveBeenCalledTimes(2);
    expect(sorted(result.processed)).toEqual(sorted(ids.slice(0, 100)));
    expect(result.failed).toEqual([]);
    expect(sorted(result.unconfirmed)).toEqual(sorted(ids.slice(100)));
    expect(result.stopped).toBe(true);
  });

  it("I4 [SPEC-CORE-120] a failed chunk's ids are unconfirmed, not failed", async () => {
    const ids = idsOf(100);
    const result = await runChunked(ids, () => Promise.reject(new Error("network")));

    expect(result.failed).toEqual([]);
    expect(sorted(result.unconfirmed)).toEqual(sorted(ids));
    expect(result.stopped).toBe(true);
  });
});

describe("SPEC-CORE-120 I5: an answer whose counts do not add up", () => {
  it.each([
    ["deleted short by one", { deleted: 99, errors: [] as Answer["errors"] }],
    ["deleted plus errors over the length", { deleted: 100, errors: [{ id: "f0000", error: "x" }] }],
    ["purged short by one", { purged: 99, errors: [] as Answer["errors"] }],
  ])("I5 [SPEC-CORE-120] %s makes the chunk unconfirmed and stops the run", async (_label, bad) => {
    const ids = idsOf(250);
    const send = vi.fn<Send>(async (chunk) => {
      if (chunk[0] === ids[0]) return allOk(chunk);
      if (chunk[0] === ids[100]) return bad as Answer;
      return allOk(chunk);
    });

    const result = await runChunked(ids, send);

    expect(send).toHaveBeenCalledTimes(2);
    expect(sorted(result.processed)).toEqual(sorted(ids.slice(0, 100)));
    expect(sorted(result.unconfirmed)).toEqual(sorted(ids.slice(100)));
    expect(result.stopped).toBe(true);
  });
});

describe("SPEC-CORE-120 I20: 120-second timeout per request", () => {
  it("I20 [SPEC-CORE-120] a chunk's signal is not aborted at 119.999 s and is aborted at 120 s, and the run stops", async () => {
    vi.useFakeTimers();
    const ids = idsOf(150);
    const signals: AbortSignal[] = [];
    const send = vi.fn<Send>((_chunk, signal) => {
      signals.push(signal);
      return hangUntilAborted(signal);
    });

    const run = runChunked(ids, send);
    await vi.advanceTimersByTimeAsync(119_999);
    expect(signals[0].aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const result = await run;

    expect(signals[0].aborted).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.processed).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(sorted(result.unconfirmed)).toEqual(sorted(ids));
    expect(result.stopped).toBe(true);
  });

  it("I20 [SPEC-CORE-120] each chunk gets its own signal and its 120 s counts from its own request", async () => {
    vi.useFakeTimers();
    const ids = idsOf(200);
    const signals: AbortSignal[] = [];
    const send = vi.fn<Send>((chunk, signal) => {
      signals.push(signal);
      if (signals.length === 1) {
        return new Promise<Answer>((resolve) => setTimeout(() => resolve(allOk(chunk)), 100_000));
      }
      return hangUntilAborted(signal);
    });

    const run = runChunked(ids, send);
    await vi.advanceTimersByTimeAsync(100_000);
    expect(signals).toHaveLength(2);
    expect(signals[0]).not.toBe(signals[1]);

    await vi.advanceTimersByTimeAsync(119_999);
    expect(signals[1].aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await run;
    expect(signals[1].aborted).toBe(true);
  });
});
