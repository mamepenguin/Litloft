import { act } from "@testing-library/react";
import { vi } from "vitest";

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

/** A request the test holds open, so "still uploading" is a state it can inspect. */
export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * The queue starts its work from a zero-delay timer, so a test on fake
 * timers has to turn the crank before anything reaches the API.
 */
export async function flush(rounds = 12): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
}

/** The route the Add menu and `useFilePicker` take: an event on the zone. */
export async function dropOn(
  container: Element,
  detail: unknown,
  zoneIndex = 0,
): Promise<void> {
  const zone = container.querySelectorAll("[data-upload-zone]")[zoneIndex];
  if (!zone) throw new Error(`no upload zone at index ${zoneIndex}`);
  await act(async () => {
    zone.dispatchEvent(new CustomEvent("upload-files", { detail }));
  });
  await flush();
}

export interface InitBody {
  filename: string;
  folder_path: string;
  relative_path?: string;
  require_folder?: boolean;
}

export function initBodies(initUpload: {
  mock: { calls: unknown[][] };
}): Array<[string, InitBody]> {
  return initUpload.mock.calls.map((call) => [
    call[0] as string,
    call[1] as InitBody,
  ]);
}

export interface InitResult {
  upload_id: string;
  chunk_size: number;
  total_chunks: number;
}

export function initResult(uploadId: string, totalChunks = 1): InitResult {
  return { upload_id: uploadId, chunk_size: 5 * 1024 * 1024, total_chunks: totalChunks };
}
