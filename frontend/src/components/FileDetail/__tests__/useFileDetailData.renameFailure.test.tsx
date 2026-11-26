import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useFileDetailData } from "../hooks/useFileDetailData";
import { _resetFileSeedForTests } from "@/lib/fileSeed";
import { ApiStatusError } from "@/lib/apiError";
import type { FileItem } from "@/types";

const apiMocks = vi.hoisted(() => ({
  getFile: vi.fn(),
  getFileShared: vi.fn(),
  recordFileView: vi.fn(),
  renameFile: vi.fn(),
  updateFile: vi.fn(),
}));
vi.mock("@/lib/api", () => apiMocks);
vi.mock("@/lib/recentlyPlayed", () => ({ addRecentlyPlayed: vi.fn() }));
vi.mock("@/lib/listSnapshot", () => ({ clearListSnapshot: vi.fn() }));
vi.mock("@/components/SidebarProvider", () => ({
  useSidebar: () => ({ requestRefresh: vi.fn() }),
}));

const toast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
}));
vi.mock("@/components/ToastProvider", () => ({ useToast: () => toast }));

function file(overrides: Partial<FileItem> = {}): FileItem {
  return {
    id: "f1",
    title: "seed title",
    description: "seed desc",
    filename: "a.mp4",
    tags: [],
    ...overrides,
  } as FileItem;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  _resetFileSeedForTests();
});

describe("useFileDetailData title rename refusals", () => {
  it.each([
    [
      new ApiStatusError(409, "conflict", undefined, "subtitle_name_taken", [
        "a/film.ja.srt",
      ]),
      "A subtitle with that name is already in the destination. a/film.ja.srt",
    ],
    [
      new ApiStatusError(409, "conflict", undefined, "subtitle_owner_change", [
        "a/film.ja.srt",
      ]),
      "This would change which video owns a subtitle, so it can't be done. a/film.ja.srt",
    ],
    [
      new ApiStatusError(400, "invalid", undefined, "subtitle_extension_reserved", []),
      ".srt and .vtt names are only for subtitle uploads.",
    ],
  ])("shows the translated refusal for %#", async (cause, message) => {
    apiMocks.getFileShared.mockResolvedValue(file());
    apiMocks.renameFile.mockRejectedValueOnce(cause);
    const { result } = renderHook(() => useFileDetailData("f1"));
    await waitFor(() => expect(result.current.fresh).toBe(true));

    await act(async () => {
      await result.current.rename("film.ja.srt");
    });

    expect(toast.error).toHaveBeenCalledWith(message);
  });

  it("keeps another failure out of the subtitle toast", async () => {
    apiMocks.getFileShared.mockResolvedValue(file());
    apiMocks.renameFile.mockRejectedValueOnce(
      new ApiStatusError(500, "server error"),
    );
    const { result } = renderHook(() => useFileDetailData("f1"));
    await waitFor(() => expect(result.current.fresh).toBe(true));

    await act(async () => {
      await result.current.rename("film.mp4");
    });

    expect(toast.error).not.toHaveBeenCalled();
  });
});
