import { act, renderHook, waitFor } from "@testing-library/react";
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

function makeFile(overrides: Partial<{ id: string; filename: string; folder_path: string }> = {}) {
  // Only the fields the hook reads need to be real; cast through unknown
  // for the rest so we don't pin the entire FileItem shape here.
  const base = {
    id: "abc",
    filename: "untitled-20260509-143000.md",
    folder_path: "Notes",
    ...overrides,
  };
  return base as unknown as Awaited<ReturnType<typeof createTextFile>>;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Freeze time so the generated `untitled-{ts}` filename is deterministic.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-09T14:30:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useCreateFile", () => {
  it("creates a file at the current path and navigates to /files/{id}?edit=1", async () => {
    mockedCreate.mockResolvedValueOnce(
      makeFile({ id: "abc", filename: "untitled-20260509-143000.md", folder_path: "Notes" }),
    );
    const { result } = renderHook(() => useCreateFile("main", "Notes"));

    await act(async () => {
      await result.current.createFile();
    });

    expect(mockedCreate).toHaveBeenCalledTimes(1);
    const [drive, body] = mockedCreate.mock.calls[0]!;
    expect(drive).toBe("main");
    expect(body.path).toMatch(/^Notes\/untitled-\d{8}-\d{6}\.md$/);
    expect(body.content).toBe("");
    expect(pushMock).toHaveBeenCalledWith("/files/abc?edit=1");
  });

  it("places the file at drive root when currentPath is empty (no leading slash)", async () => {
    mockedCreate.mockResolvedValueOnce(
      makeFile({ id: "root1", filename: "untitled-20260509-143000.md", folder_path: "" }),
    );
    const { result } = renderHook(() => useCreateFile("main", ""));

    await act(async () => {
      await result.current.createFile();
    });

    const [, body] = mockedCreate.mock.calls[0]!;
    // No leading slash and no "Notes/" prefix.
    expect(body.path.startsWith("/")).toBe(false);
    expect(body.path).toMatch(/^untitled-\d{8}-\d{6}\.md$/);
    expect(pushMock).toHaveBeenCalledWith("/files/root1?edit=1");
  });

  it("concatenates nested currentPath correctly", async () => {
    mockedCreate.mockResolvedValueOnce(
      makeFile({ id: "nested", folder_path: "Notes/sub" }),
    );
    const { result } = renderHook(() => useCreateFile("main", "Notes/sub"));

    await act(async () => {
      await result.current.createFile();
    });

    const [, body] = mockedCreate.mock.calls[0]!;
    expect(body.path).toMatch(/^Notes\/sub\/untitled-\d{8}-\d{6}\.md$/);
  });

  it("does not double-fire while a request is in flight", async () => {
    let resolveCreate: ((v: Awaited<ReturnType<typeof createTextFile>>) => void) | null = null;
    mockedCreate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );

    const { result } = renderHook(() => useCreateFile("main", ""));

    // Two synchronous invocations: only the first should reach the API.
    let firstPromise: Promise<void>;
    let secondPromise: Promise<void>;
    act(() => {
      firstPromise = result.current.createFile();
      secondPromise = result.current.createFile();
    });

    expect(mockedCreate).toHaveBeenCalledTimes(1);
    expect(result.current.isCreating).toBe(true);

    await act(async () => {
      resolveCreate!(makeFile({ id: "x" }));
      await firstPromise!;
      await secondPromise!;
    });

    expect(result.current.isCreating).toBe(false);
  });

  it("surfaces errors via window.alert and resets isCreating", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    mockedCreate.mockRejectedValueOnce(new Error("network down"));
    const { result } = renderHook(() => useCreateFile("main", ""));

    await act(async () => {
      await result.current.createFile();
    });

    // The hook must not navigate on failure.
    expect(pushMock).not.toHaveBeenCalled();
    // User-visible feedback was raised (i18n key surfaced via mock).
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith("createFileFailed");
    // After failure isCreating must reset so the user can retry.
    await waitFor(() => {
      expect(result.current.isCreating).toBe(false);
    });
    alertSpy.mockRestore();
  });

  it("surfaces a clearer message when the drive is readonly (403)", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    mockedCreate.mockRejectedValueOnce(new Error("API error: 403 Forbidden"));
    const { result } = renderHook(() => useCreateFile("main", ""));

    await act(async () => {
      await result.current.createFile();
    });

    expect(alertSpy).toHaveBeenCalledWith("createFileForbidden");
    alertSpy.mockRestore();
  });
});
