/**
 * Quick Note with the real FolderPicker mounted.
 *
 * FolderPicker seeds its browse path and its all-folders cache once, on first
 * open, so reusing one instance across a drive change would leave the previous
 * drive's breadcrumb and search results selectable — and a folder picked from
 * that stale list would be created in the new drive. A drive is a security
 * boundary, so the panel keys the picker by drive; this test is what keeps
 * that key in place.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

import { ShortcutsProvider } from "../ShortcutsProvider";
import { ToastProvider } from "../ToastProvider";
import { QuickNote } from "../quick-note";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
}));

const driveState = vi.hoisted(() => ({ current: "photos" as string | null }));
vi.mock("../CurrentDriveProvider", () => ({
  useCurrentDrive: () => driveState.current,
}));

/** Folders per `${drive}:${browsePath}`. The picker starts inside the stored
 *  destination folder ("Inbox"), so that level is the one that matters. */
const FOLDERS: Record<string, { name: string; path: string }[]> = {
  "photos:": [
    { name: "Inbox", path: "Inbox" },
    { name: "Archive", path: "Archive" },
  ],
  "photos:Inbox": [{ name: "Alpha", path: "Inbox/Alpha" }],
  "notes:": [
    { name: "Inbox", path: "Inbox" },
    { name: "Journal", path: "Journal" },
  ],
  "notes:Inbox": [{ name: "Beta", path: "Inbox/Beta" }],
};

const FOLDER_TREE: Record<string, string[]> = {
  photos: ["Inbox", "Inbox/Alpha", "Archive"],
  notes: ["Inbox", "Inbox/Beta", "Journal"],
};

const mockGetDrives = vi.fn();
const mockCreateTextFile = vi.fn();
const mockGetFolders = vi.fn();
const mockGetFolderTree = vi.fn();

vi.mock("@/lib/api", () => ({
  getDrives: (...args: unknown[]) => mockGetDrives(...args),
  createTextFile: (...args: unknown[]) => mockCreateTextFile(...args),
  getFolders: (...args: unknown[]) => mockGetFolders(...args),
  getFolderTree: (...args: unknown[]) => mockGetFolderTree(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  driveState.current = "photos";
  mockGetDrives.mockResolvedValue([
    { name: "photos", protected: false, file_count: 0 },
    { name: "notes", protected: false, file_count: 0 },
  ]);
  mockGetFolders.mockImplementation(
    async (drive: string, path?: string) => FOLDERS[`${drive}:${path ?? ""}`] ?? [],
  );
  mockGetFolderTree.mockImplementation(async (drive: string) =>
    (FOLDER_TREE[drive] ?? []).map((path) => ({
      name: path.split("/").pop()!,
      path,
      kind: "folder",
    })),
  );
});

async function openPanelAndDestination() {
  fireEvent.click(screen.getByRole("button", { name: "Quick note" }));
  await screen.findByRole("dialog");
  await act(async () => {
    await Promise.resolve();
  });
  const toggle = screen.getByRole("button", { name: /Destination/ });
  if (toggle.getAttribute("aria-expanded") !== "true") fireEvent.click(toggle);
}

function openPicker() {
  fireEvent.click(screen.getByRole("button", { name: /Save to/ }));
}

describe("QuickNote + FolderPicker across drives", () => {
  it("drops the previous drive's browse state and folder list", async () => {
    render(
      <ShortcutsProvider>
        <ToastProvider>
          <QuickNote />
        </ToastProvider>
      </ShortcutsProvider>,
    );

    await openPanelAndDestination();

    // Browse into a folder that only exists in "photos".
    openPicker();
    fireEvent.click(await screen.findByRole("button", { name: "Alpha" }));
    await waitFor(() =>
      expect(screen.getByText("photos / Inbox/Alpha")).toBeInTheDocument(),
    );

    // Switch drives.
    fireEvent.change(screen.getByLabelText("Drive"), { target: { value: "notes" } });
    await waitFor(() => expect(screen.getByText("notes / Inbox")).toBeInTheDocument());

    // The picker is a fresh instance: no stale breadcrumb, no stale folders.
    openPicker();
    expect(await screen.findByRole("button", { name: "Beta" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Alpha" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "notes" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "photos" })).not.toBeInTheDocument();

    // Filtering searches the new drive's tree, not the cached one.
    fireEvent.change(screen.getByPlaceholderText(/Filter folders/), {
      target: { value: "a" },
    });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Alpha" })).not.toBeInTheDocument(),
    );
    expect(mockGetFolderTree.mock.calls.map((c) => c[0])).toEqual(["photos", "notes"]);
  });

  it("saves into a folder chosen after the drive change", async () => {
    mockCreateTextFile.mockResolvedValue({
      id: "abc123456789",
      filename: "note.md",
      folder_path: "Beta",
    });

    render(
      <ShortcutsProvider>
        <ToastProvider>
          <QuickNote />
        </ToastProvider>
      </ShortcutsProvider>,
    );

    await openPanelAndDestination();
    fireEvent.change(screen.getByLabelText("Drive"), { target: { value: "notes" } });
    await waitFor(() => expect(screen.getByText("notes / Inbox")).toBeInTheDocument());

    openPicker();
    fireEvent.click(await screen.findByRole("button", { name: "Beta" }));
    fireEvent.change(screen.getByLabelText("Note text"), {
      target: { value: "filed in the new drive" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));

    await waitFor(() => expect(mockCreateTextFile).toHaveBeenCalledTimes(1));
    const [drive, payload] = mockCreateTextFile.mock.calls[0] as [
      string,
      { path: string },
    ];
    expect(drive).toBe("notes");
    expect(payload.path).toBe("Inbox/Beta/filed in the new drive.md");
  });
});
