import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCreateFile } from "../useCreateFile";

vi.mock("@/lib/api", () => ({
  createTextFile: vi.fn(),
}));

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { createTextFile } from "@/lib/api";

const mockedCreate = vi.mocked(createTextFile);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-09T14:30:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useCreateFile — target path override", () => {
  it("uses an explicit override path instead of the constructor path", async () => {
    mockedCreate.mockResolvedValueOnce({
      id: "abc",
      filename: "untitled-20260509-143000.md",
      folder_path: "Other/Place",
    } as unknown as Awaited<ReturnType<typeof createTextFile>>);

    // Hook constructed with currentPath = "Notes" but creating into "Other/Place"
    const { result } = renderHook(() => useCreateFile("main", "Notes"));

    await act(async () => {
      await result.current.createFile("Other/Place");
    });

    expect(mockedCreate).toHaveBeenCalledTimes(1);
    const [, body] = mockedCreate.mock.calls[0]!;
    expect(body.path).toMatch(/^Other\/Place\/untitled-\d{8}-\d{6}\.md$/);
  });

  it("falls back to the constructor path when no override is given", async () => {
    mockedCreate.mockResolvedValueOnce({ id: "x", filename: "u", folder_path: "Notes" } as unknown as Awaited<ReturnType<typeof createTextFile>>);
    const { result } = renderHook(() => useCreateFile("main", "Notes"));

    await act(async () => {
      await result.current.createFile();
    });

    const [, body] = mockedCreate.mock.calls[0]!;
    expect(body.path).toMatch(/^Notes\/untitled-/);
  });

  it("treats an empty override as the drive root", async () => {
    mockedCreate.mockResolvedValueOnce({ id: "y", filename: "u", folder_path: "" } as unknown as Awaited<ReturnType<typeof createTextFile>>);
    const { result } = renderHook(() => useCreateFile("main", "Notes"));

    await act(async () => {
      await result.current.createFile("");
    });

    const [, body] = mockedCreate.mock.calls[0]!;
    expect(body.path.startsWith("/")).toBe(false);
    expect(body.path).toMatch(/^untitled-/);
  });
});
