import type React from "react";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";

let mockPathname = "/drive/work";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

import {
  CurrentDriveProvider,
  useCurrentDrive,
  useCurrentFolderPath,
} from "../CurrentDriveProvider";

function wrapper({ children }: { children: React.ReactNode }) {
  return <CurrentDriveProvider>{children}</CurrentDriveProvider>;
}

function renderCurrent() {
  return renderHook(
    () => ({ drive: useCurrentDrive(), folderPath: useCurrentFolderPath() }),
    { wrapper },
  );
}

beforeEach(() => {
  mockPathname = "/drive/work";
});

describe("CurrentDriveProvider folder path", () => {
  it("returns null folderPath at the drive root", () => {
    mockPathname = "/drive/work";
    const { result } = renderCurrent();
    expect(result.current.drive).toBe("work");
    expect(result.current.folderPath).toBeNull();
  });

  it("extracts a nested folder path", () => {
    mockPathname = "/drive/work/Q1/reports";
    const { result } = renderCurrent();
    expect(result.current.folderPath).toBe("Q1/reports");
  });

  it("decodes each path segment independently", () => {
    mockPathname = "/drive/work/%E6%97%85%E8%A1%8C/2024";
    const { result } = renderCurrent();
    expect(result.current.folderPath).toBe("旅行/2024");
  });

  it("treats the search route as having no folder context", () => {
    mockPathname = "/drive/work/search";
    const { result } = renderCurrent();
    expect(result.current.folderPath).toBeNull();
  });

  it("treats the collections route as having no folder context", () => {
    mockPathname = "/drive/work/collections/abc123";
    const { result } = renderCurrent();
    expect(result.current.folderPath).toBeNull();
  });

  it("ignores a trailing slash", () => {
    mockPathname = "/drive/work/Q1/";
    const { result } = renderCurrent();
    expect(result.current.folderPath).toBe("Q1");
  });

  it("returns null folderPath for drive-independent pages", () => {
    mockPathname = "/settings";
    const { result } = renderCurrent();
    expect(result.current.drive).toBeNull();
    expect(result.current.folderPath).toBeNull();
  });
});
