import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import type { FileRelationsResponse } from "@/lib/api";
import { useFileRelations } from "../useFileRelations";

const getFileRelations = vi.fn<(id: string) => Promise<FileRelationsResponse>>();

vi.mock("@/lib/api", () => ({
  getFileRelations: (id: string) => getFileRelations(id),
}));

const response = (fileId: string): FileRelationsResponse => ({
  relations: [
    {
      relation_id: 1,
      kind: "related",
      direction: "outgoing",
      origin: "markdown",
      created_at: "2026-09-15T00:00:00Z",
      created_by: null,
      file: {
        id: `to-${fileId}`,
        drive: "main",
        filename: "x.md",
        title: "x",
        folder_path: "",
        file_type: "document",
        mime_type: "text/markdown",
        thumbnail_url: "",
        has_thumbnail: false,
        file_size: 1,
        duration: null,
        missing_since: null,
        created_at: "2026-09-15T00:00:00Z",
        updated_at: "2026-09-15T00:00:00Z",
      },
    },
  ],
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useFileRelations", () => {
  beforeEach(() => {
    getFileRelations.mockReset();
  });

  it("is null until the relations arrive", async () => {
    const pending = deferred<FileRelationsResponse>();
    getFileRelations.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useFileRelations("f1"));

    expect(result.current).toBeNull();
    expect(getFileRelations).toHaveBeenCalledWith("f1");

    await act(async () => pending.resolve(response("f1")));
    expect(result.current?.map((r) => r.file.id)).toEqual(["to-f1"]);
  });

  it("is empty when the fetch fails", async () => {
    getFileRelations.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useFileRelations("f1"));

    await waitFor(() => expect(result.current).toEqual([]));
  });

  it("is empty when the request cannot even be made", async () => {
    getFileRelations.mockImplementation(() => {
      throw new Error("no fetch");
    });
    const { result } = renderHook(() => useFileRelations("f1"));

    await waitFor(() => expect(result.current).toEqual([]));
  });

  it("drops the previous file's rows as soon as the file changes", async () => {
    getFileRelations.mockResolvedValueOnce(response("f1"));
    const { result, rerender } = renderHook(({ id }) => useFileRelations(id), {
      initialProps: { id: "f1" },
    });
    await waitFor(() => expect(result.current).not.toBeNull());

    const second = deferred<FileRelationsResponse>();
    getFileRelations.mockReturnValueOnce(second.promise);
    rerender({ id: "f2" });

    expect(result.current).toBeNull();
    await act(async () => second.reject(new Error("boom")));
    expect(result.current).toEqual([]);
  });

  it("ignores a response for a file it has moved away from", async () => {
    const first = deferred<FileRelationsResponse>();
    const second = deferred<FileRelationsResponse>();
    getFileRelations
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(({ id }) => useFileRelations(id), {
      initialProps: { id: "f1" },
    });
    rerender({ id: "f2" });

    await act(async () => second.resolve(response("f2")));
    await act(async () => first.resolve(response("f1")));

    expect(result.current?.map((r) => r.file.id)).toEqual(["to-f2"]);
  });
});
