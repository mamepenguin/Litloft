import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useInitialReveal } from "../useInitialReveal";

// The tree's expansion state is whatever the user persisted; the URL location
// never re-shapes it.
describe("useInitialReveal (Craft-style no-op)", () => {
  it("does not expand on first mount even when currentFolderPath is deep", () => {
    const expand = vi.fn();
    renderHook(() => useInitialReveal("Knowledge/docs/specs", expand));
    expect(expand).not.toHaveBeenCalled();
  });

  it("does not expand when currentFolderPath changes after mount", () => {
    const expand = vi.fn();
    const { rerender } = renderHook(
      ({ path }: { path: string | undefined }) => useInitialReveal(path, expand),
      { initialProps: { path: "Knowledge/docs" } },
    );
    rerender({ path: "Photos/2024/spring" });
    expect(expand).not.toHaveBeenCalled();
  });

  it("does nothing when currentFolderPath is undefined or empty", () => {
    const expand = vi.fn();
    renderHook(() => useInitialReveal(undefined, expand));
    renderHook(() => useInitialReveal("", expand));
    expect(expand).not.toHaveBeenCalled();
  });
});
