import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDragAndDrop } from "../useDragAndDrop";

const api = vi.hoisted(() => ({
  moveFile: vi.fn(),
  moveFolder: vi.fn(),
  batchMove: vi.fn(),
}));
vi.mock("@/lib/api", () => api);

const toast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
}));
vi.mock("@/components/ToastProvider", () => ({ useToast: () => toast }));

function createDragEvent(): React.DragEvent {
  const dataStore = new Map<string, string>();
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: {
      setData: (key: string, value: string) => dataStore.set(key, value),
      getData: (key: string) => dataStore.get(key) ?? "",
      effectAllowed: "uninitialized",
      dropEffect: "none",
    },
  } as unknown as React.DragEvent;
}

const onComplete = vi.fn();

async function dropTwoFiles() {
  const { result } = renderHook(() =>
    useDragAndDrop({
      drive: "main",
      selectedIds: new Set(["f1", "f2"]),
      onComplete,
    }),
  );
  act(() => {
    result.current.handleDragStart(createDragEvent(), "f1");
  });
  await act(async () => {
    await result.current.getDropTargetProps("dest").onDrop(createDragEvent());
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useDragAndDrop subtitle carries", () => {
  it("names the subtitles a multi-file drop could not carry", async () => {
    api.batchMove.mockResolvedValue({
      moved: 1,
      errors: [],
      sidecar_errors: ["a/movie.srt"],
    });

    await dropTwoFiles();

    expect(toast.error).toHaveBeenCalledWith(
      "Some subtitles could not be moved. a/movie.srt",
    );
  });

  it("says nothing about subtitles when every track was carried", async () => {
    api.batchMove.mockResolvedValue({
      moved: 2,
      errors: [],
      sidecar_errors: [],
    });

    await dropTwoFiles();

    expect(toast.error).not.toHaveBeenCalled();
  });
});
