import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useInitialReveal } from "../useInitialReveal";

describe("useInitialReveal", () => {
  it("expands every ancestor (and the leaf) on first mount", () => {
    const expand = vi.fn();
    renderHook(() => useInitialReveal("Knowledge/docs/specs", expand));
    expect(expand).toHaveBeenCalledTimes(3);
    expect(expand).toHaveBeenNthCalledWith(1, "Knowledge");
    expect(expand).toHaveBeenNthCalledWith(2, "Knowledge/docs");
    expect(expand).toHaveBeenNthCalledWith(3, "Knowledge/docs/specs");
  });

  it("does NOT re-expand when currentFolderPath changes after mount", () => {
    const expand = vi.fn();
    const { rerender } = renderHook(
      ({ path }: { path: string | undefined }) => useInitialReveal(path, expand),
      { initialProps: { path: "Knowledge/docs" } },
    );
    expect(expand).toHaveBeenCalledTimes(2);

    expand.mockClear();
    rerender({ path: "Photos/2024/spring" });
    expect(expand).not.toHaveBeenCalled();
  });

  it("does nothing when currentFolderPath is undefined", () => {
    const expand = vi.fn();
    renderHook(() => useInitialReveal(undefined, expand));
    expect(expand).not.toHaveBeenCalled();
  });

  it("does nothing when currentFolderPath is empty string (drive root)", () => {
    const expand = vi.fn();
    renderHook(() => useInitialReveal("", expand));
    expect(expand).not.toHaveBeenCalled();
  });

  it("ignores empty segments from leading/trailing/duplicated slashes", () => {
    const expand = vi.fn();
    renderHook(() => useInitialReveal("/Knowledge//docs/", expand));
    expect(expand).toHaveBeenCalledTimes(2);
    expect(expand).toHaveBeenNthCalledWith(1, "Knowledge");
    expect(expand).toHaveBeenNthCalledWith(2, "Knowledge/docs");
  });
});
