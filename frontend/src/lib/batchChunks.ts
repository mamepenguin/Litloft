/** The server accepts at most 100 ids per batch request. */
export const CHUNK_SIZE = 100;

/**
 * Every request is bounded so a hung one cannot leave the UI waiting with no
 * way out. One value for chunks and whole-list actions: both are single
 * server requests over the same rewrite.
 */
export const REQUEST_TIMEOUT_MS = 120_000;

export interface BatchAnswer {
  deleted?: number;
  purged?: number;
  errors: { id: string; error: string }[];
}

export type BatchSend = (ids: string[], signal: AbortSignal) => Promise<BatchAnswer>;

export interface BatchRunHooks {
  onProgress?: (processed: number, total: number) => void;
  /** Aborting it stops the run: the in-flight request is aborted and no later chunk is sent. */
  signal?: AbortSignal;
}

export interface BatchRunResult {
  processed: string[];
  failed: string[];
  unconfirmed: string[];
  stopped: boolean;
}

function answeredFor(answer: BatchAnswer, chunkLength: number): boolean {
  const counted = answer.deleted ?? answer.purged;
  return counted !== undefined && counted + answer.errors.length === chunkLength;
}

export async function runChunked(
  ids: readonly string[],
  send: BatchSend,
  hooks: BatchRunHooks = {},
): Promise<BatchRunResult> {
  const processed: string[] = [];
  const failed: string[] = [];
  const unconfirmed: string[] = [];
  let stopped = false;

  for (let start = 0; start < ids.length; start += CHUNK_SIZE) {
    if (hooks.signal?.aborted) {
      unconfirmed.push(...ids.slice(start));
      stopped = true;
      break;
    }
    const chunk = ids.slice(start, start + CHUNK_SIZE);
    const controller = new AbortController();
    const abortChunk = () => controller.abort();
    hooks.signal?.addEventListener("abort", abortChunk);
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let answer: BatchAnswer | null = null;
    try {
      const received = await send([...chunk], controller.signal);
      if (answeredFor(received, chunk.length)) answer = received;
    } catch {
      // A rejection, a timeout and an abort are all "no usable answer".
    } finally {
      clearTimeout(timer);
      hooks.signal?.removeEventListener("abort", abortChunk);
    }

    if (answer === null) {
      unconfirmed.push(...ids.slice(start));
      stopped = true;
      break;
    }

    const errored = new Set(answer.errors.map((entry) => entry.id));
    for (const id of chunk) {
      if (!errored.has(id)) processed.push(id);
    }
    for (const entry of answer.errors) failed.push(entry.id);
    hooks.onProgress?.(processed.length, ids.length);
  }

  return { processed, failed, unconfirmed, stopped };
}
