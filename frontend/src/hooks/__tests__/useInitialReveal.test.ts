import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useInitialReveal } from "../useInitialReveal";

// Craft-style strict-separation mode: the hook is a no-op. The tree's
// expansion state is whatever the user has persisted in localStorage —
// the URL location never re-shapes the tree. These tests pin the
// no-op contract so a future revival of auto-expansion has to delete
// them on purpose.
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
