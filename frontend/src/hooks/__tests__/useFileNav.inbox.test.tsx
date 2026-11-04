/**
 * SPEC-CORE-032 I15 — with `nav=inbox` the arrows walk the inbox, not the
 * folder, and the readout is the inbox's own place.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { resolveFileNavOrdering } from "@/lib/fileNavOrdering";

const getFileNeighbors = vi.fn();
const getInboxNeighbors = vi.fn();

vi.mock("@/lib/api", () => ({
  getFileNeighbors: (...args: unknown[]) => getFileNeighbors(...args),
  getInboxNeighbors: (...args: unknown[]) => getInboxNeighbors(...args),
}));

vi.mock("@/hooks/useShortcuts", () => ({ useShortcuts: vi.fn() }));

import { useFileNav } from "../useFileNav";

beforeEach(() => {
  getFileNeighbors.mockReset();
  getInboxNeighbors.mockReset();
  getFileNeighbors.mockResolvedValue({ prev_id: null, next_id: null, position: null, total: null });
  getInboxNeighbors.mockResolvedValue({
    prev_id: "f1",
    next_id: "f3",
    position: 2,
    total: 4,
  });
});

describe("SPEC-CORE-032 I15 the inbox neighbours endpoint", () => {
  it("SPEC-CORE-032 I15 asks the inbox for the file when nav=inbox", async () => {
    renderHook(() =>
      useFileNav({
        fileId: "f2",
        nav: "inbox",
        drive: "main",
        onNavigate: vi.fn(),
      }),
    );

    await waitFor(() => expect(getInboxNeighbors).toHaveBeenCalledWith("main", "f2"));
    expect(getFileNeighbors).not.toHaveBeenCalled();
  });

  it("SPEC-CORE-032 I15 walks the arrivals in inbox order", async () => {
    const { result } = renderHook(() =>
      useFileNav({
        fileId: "f2",
        nav: "inbox",
        drive: "main",
        onNavigate: vi.fn(),
      }),
    );

    await waitFor(() => expect(result.current.nextId).toBe("f3"));
    expect(result.current.prevId).toBe("f1");
    expect(result.current.position).toBe(2);
    expect(result.current.total).toBe(4);
  });

  it("SPEC-CORE-032 I15 moves to the arrival the answer names", async () => {
    const onNavigate = vi.fn();
    const { result } = renderHook(() =>
      useFileNav({
        fileId: "f2",
        nav: "inbox",
        drive: "main",
        onNavigate,
      }),
    );

    await waitFor(() => expect(result.current.nextId).toBe("f3"));
    result.current.navigateNext();
    result.current.navigatePrev();
    expect(onNavigate.mock.calls).toEqual([["f3"], ["f1"]]);
  });

  it("SPEC-CORE-032 I15 keeps the endpoint's nulls when the file has no row", async () => {
    getInboxNeighbors.mockResolvedValue({
      prev_id: null,
      next_id: null,
      position: null,
      total: null,
    });
    const { result } = renderHook(() =>
      useFileNav({
        fileId: "absent",
        nav: "inbox",
        drive: "main",
        onNavigate: vi.fn(),
      }),
    );

    await waitFor(() => expect(getInboxNeighbors).toHaveBeenCalled());
    expect(result.current.prevId).toBeNull();
    expect(result.current.nextId).toBeNull();
    expect(result.current.position).toBeNull();
    expect(result.current.total).toBeNull();
  });

  it("SPEC-CORE-032 I15 leaves the folder walk alone without nav=inbox", async () => {
    const { result } = renderHook(() =>
      useFileNav({
        fileId: "f2",
        nav: "folder",
        drive: "main",
        sort: "created_at",
        onNavigate: vi.fn(),
      }),
    );

    await waitFor(() => expect(getFileNeighbors).toHaveBeenCalledWith("f2", "created_at", undefined));
    expect(getInboxNeighbors).not.toHaveBeenCalled();
    expect(result.current.nextId).toBeNull();
  });
});

describe("SPEC-CORE-032 I15 the readout under nav=inbox", () => {
  it("SPEC-CORE-032 I15 counts an inbox walk even with no sort key", () => {
    const ordering = resolveFileNavOrdering({
      params: new URLSearchParams("nav=inbox"),
    });
    expect(ordering.countable).toBe(true);
  });

  it("SPEC-CORE-032 I15 sends no folder sort to the inbox walk", () => {
    const ordering = resolveFileNavOrdering({
      params: new URLSearchParams("nav=inbox&sort=title&order=asc"),
    });
    expect(ordering.sort).toBeUndefined();
    expect(ordering.order).toBeUndefined();
  });

  it.each([
    ["a plain folder with a sort", "nav=folder&sort=title", true],
    ["a plain folder without one", "nav=folder", false],
    ["a view", "nav=favorites&sort=title", false],
    ["no nav at all", "sort=title", false],
  ])("SPEC-CORE-032 I15 keeps %s as before", (_case, query, countable) => {
    expect(resolveFileNavOrdering({ params: new URLSearchParams(query) }).countable).toBe(
      countable,
    );
  });
});
