/**
 * Integration test for the Cmd+N shortcut wiring contract.
 *
 * FolderBrowser is too heavy to mount in a unit test (it pulls in the
 * full clipboard, drag-and-drop, scan, and snapshot stack). Instead we
 * exercise the contract that FolderBrowser must implement:
 *
 *   useCreateFile(drive, currentPath) + useShortcuts(..., enabled)
 *
 * - In a folder context (enabled = true), Cmd+N triggers
 *   `createTextFile`.
 * - In a special view (enabled = false), Cmd+N is a no-op.
 *
 * If FolderBrowser later gains a focused unit test, these assertions
 * can be folded in there. They live at the hook layer so they stay
 * green even as FolderBrowser is restructured.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";

import { ShortcutsProvider } from "@/components/ShortcutsProvider";
import { useShortcuts } from "@/hooks/useShortcuts";
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

interface HarnessProps {
  drive: string;
  currentPath: string;
  enabled: boolean;
}

function FolderShortcutHarness({ drive, currentPath, enabled }: HarnessProps) {
  const { createFile } = useCreateFile(drive, currentPath);
  useShortcuts(
    "file-browser",
    "File Browser",
    [{ key: "ctrl+n", label: "new file", handler: createFile }],
    enabled,
  );
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-09T14:30:00Z"));
  // The hook resolves with whatever the API returns; we don't care
  // about the exact shape here, just that the call happened.
  mockedCreate.mockResolvedValue({
    id: "abc",
    filename: "untitled.md",
    folder_path: "",
  } as unknown as Awaited<ReturnType<typeof createTextFile>>);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Cmd+N shortcut wiring (FolderBrowser contract)", () => {
  it("triggers createTextFile in folder context", () => {
    render(
      <ShortcutsProvider>
        <FolderShortcutHarness drive="main" currentPath="Notes" enabled={true} />
      </ShortcutsProvider>,
    );
    fireEvent.keyDown(document, { key: "n", ctrlKey: true });
    expect(mockedCreate).toHaveBeenCalledTimes(1);
    const [drive, body] = mockedCreate.mock.calls[0]!;
    expect(drive).toBe("main");
    expect(body.path).toMatch(/^Notes\/untitled-\d{8}-\d{6}\.md$/);
  });

  it("is a no-op in a special view (enabled=false)", () => {
    render(
      <ShortcutsProvider>
        <FolderShortcutHarness drive="main" currentPath="" enabled={false} />
      </ShortcutsProvider>,
    );
    fireEvent.keyDown(document, { key: "n", ctrlKey: true });
    expect(mockedCreate).not.toHaveBeenCalled();
  });
});
