import type React from "react";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";

let mockPathname = "/drive/work";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

import {
  CurrentDriveProvider,
  useCurrentDrive,
  useCurrentFolderPath,
  useSetOverrideFolderPath,
} from "../CurrentDriveProvider";

function wrapper({ children }: { children: React.ReactNode }) {
  return <CurrentDriveProvider>{children}</CurrentDriveProvider>;
}

function renderCurrent() {
  return renderHook(
    () => ({
      drive: useCurrentDrive(),
      folderPath: useCurrentFolderPath(),
      setFolderPath: useSetOverrideFolderPath(),
    }),
    { wrapper },
  );
}

beforeEach(() => {
  mockPathname = "/drive/work";
});

describe("CurrentDriveProvider — drive from URL", () => {
  it("extracts the drive name from the path", () => {
    mockPathname = "/drive/work/Q1/reports";
    const { result } = renderCurrent();
    expect(result.current.drive).toBe("work");
  });

  it("returns null for drive-independent pages", () => {
    mockPathname = "/settings";
    const { result } = renderCurrent();
    expect(result.current.drive).toBeNull();
  });
});

describe("CurrentDriveProvider — folder path is published, not parsed from the URL", () => {
  // hako review finding M1 (2026-08-02): a denylist of non-folder sibling
  // routes under /drive/[name]/ (search, collections, addons/...) is
  // structurally fragile — every new route must remember to update it, and
  // nothing enforces that. Instead, only the folder page itself
  // (app/drive/[name]/[...path]/page.tsx) calls setOverrideFolderPath; any
  // other route simply never calls it, so it's null there for free.

  it("starts null before anything publishes a folder path", () => {
    const { result } = renderCurrent();
    expect(result.current.folderPath).toBeNull();
  });

  it("reflects whatever is published via setOverrideFolderPath", () => {
    const { result } = renderCurrent();
    act(() => result.current.setFolderPath("Q1/reports"));
    expect(result.current.folderPath).toBe("Q1/reports");
  });

  it("clears back to null once unpublished", () => {
    const { result } = renderCurrent();
    act(() => result.current.setFolderPath("Q1"));
    expect(result.current.folderPath).toBe("Q1");
    act(() => result.current.setFolderPath(null));
    expect(result.current.folderPath).toBeNull();
  });
});
