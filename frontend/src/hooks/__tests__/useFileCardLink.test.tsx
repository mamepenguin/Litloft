import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useFileCardLink } from "@/hooks/useFileCardLink";
import type { FileItem } from "@/types";

const override = vi.hoisted(() => ({ fn: null as ((id: string) => void) | null }));

vi.mock("@/lib/fileNavigationOverride", () => ({
  useFileNavigationOverride: () => override.fn,
}));

const file = { id: "f1", drive: "work", folder_path: "Q1" } as FileItem;

describe("useFileCardLink", () => {
  it("links a card to the file in its own folder, not through /files/{id}", () => {
    const { result } = renderHook(() =>
      useFileCardLink({ file, sortQuery: "?sort=name&order=asc" }),
    );
    expect(result.current.wrapperProps.href).toBe(
      "/drive/work/Q1?file=f1&sort=name&order=asc",
    );
  });
});
