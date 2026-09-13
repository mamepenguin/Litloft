/**
 * Every screen that offers a way to upload has a zone under it.
 *
 * `dispatchUploadEvent` does not receive the zone as a prop — it resolves
 * `document.querySelector("[data-upload-zone]")` at the moment the file
 * chooser returns (`useFilePicker.tsx:19`) and does nothing when it finds
 * none. `UploadZone.tsx` is that attribute's only producer, and it also
 * supplies the `dragover` cancel without which the browser navigates away
 * from the app to a dropped file.
 *
 * So an upload control and its zone can be separated by a deletion in
 * another component, and the failure is silent in both directions: the
 * chooser opens, takes the reader's files and drops them; the drop
 * replaces the page. Measured once per screen, because a screen is the
 * unit that can lose one.
 *
 * **`UploadZone` is deliberately not mocked here**, unlike in every
 * `FolderBrowser` test. A fixture that writes `data-upload-zone` and then
 * reads it is one implementation twice, which is what detector rule 2
 * forbids — and `useFilePicker.test.tsx` already covers the consumer side
 * against exactly such a fixture. What is only here is that a real screen
 * mounts the real producer.
 *
 * **Where the files land is measured with them.** A zone that is present
 * but names the wrong folder fails in the same silent way a missing one
 * does, and from the same cause: the control that dispatches cannot see
 * the destination, so nothing it does can disagree with it. Presence and
 * destination are therefore one subject, not two.
 *
 * Not held: that a drop actually uploads. jsdom fires no user-agent
 * default action, so the navigation this prevents is not observable here
 * (`.claude/rules/review-workflow.md`, "What a test here cannot hold").
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/drive/main",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ name: "main" }),
}));
vi.mock("next/link", () => ({
  default: ({ children, ...rest }: { children?: React.ReactNode }) => <a {...rest}>{children}</a>,
}));
vi.mock("@/components/AddonSlot", () => ({ AddonSlot: () => null }));
vi.mock("@/components/AddonSlotsProvider", () => ({ useAddonSlots: () => ({ addons: {}, slots: {}, loading: false, getSlotEntries: () => [], hasSlot: () => false }) }));
vi.mock("@/components/ProfileProvider", () => ({ useProfile: () => ({ nickname: null, loading: false }) }));
vi.mock("@/components/SidebarProvider", () => ({ useSidebar: () => ({ isOpen: false, isOverlay: false, close: vi.fn() }) }));
vi.mock("@/components/ClipboardProvider", () => ({
  useClipboard: () => ({ clipboard: null, clear: vi.fn(), copy: vi.fn(), cut: vi.fn(), paste: vi.fn(), isCut: () => false }),
}));
vi.mock("@/components/FileGrid", () => ({ FileGrid: () => <div /> }));
vi.mock("@/components/FileList", () => ({ FileList: () => <div /> }));
vi.mock("@/hooks/useWebSocketRefresh", () => ({ useWebSocketRefresh: () => {} }));
const initUpload = vi.fn();

vi.mock("@/lib/api", () => ({
  initUpload: (drive: string, body: Record<string, unknown>) => initUpload(drive, body),
  uploadChunk: vi.fn().mockResolvedValue(undefined),
  completeUpload: vi.fn().mockResolvedValue(undefined),
  cancelUpload: vi.fn().mockResolvedValue(undefined),
  getDriveFiles: vi.fn().mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 12 } }),
  getFolders: vi.fn().mockResolvedValue([]),
  getPins: vi.fn().mockResolvedValue([]),
  getWatchHistory: vi.fn().mockResolvedValue([]),
  createFolder: vi.fn(),
  scanDrive: vi.fn(),
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
  getDownloadUrl: () => "",
  getStreamUrl: () => "",
  addPin: vi.fn(),
  removePin: vi.fn(),
  deleteFile: vi.fn(),
  renameFile: vi.fn(),
  moveFile: vi.fn(),
}));

import { DriveHome } from "@/components/DriveHome";
import { FolderBrowser } from "@/components/FolderBrowser";

/**
 * Declared per screen, not collected from what renders: a screen dropped
 * from this table takes its own assertion with it, which is the deletion
 * this file exists to catch (detector rule 5).
 *
 * The third column is the folder that screen's zone writes into, written
 * out per row for the same reason — read off the rendered zone it would
 * agree with whatever the component happened to pass.
 */
const SCREENS: [string, () => React.ReactElement, string][] = [
  ["the drive home", () => <DriveHome driveName="main" />, ""],
  ["the Library root", () => <FolderBrowser driveName="main" folderPath="" view="library" />, ""],
  ["a folder", () => <FolderBrowser driveName="main" folderPath="recipes" />, "recipes"],
];

describe("screens that can upload mount exactly one zone", () => {
  beforeEach(() => {
    localStorage.clear();
    initUpload.mockReset();
    initUpload.mockResolvedValue({ upload_id: "upload-1" });
  });

  it.each(SCREENS)("%s", (_name, screen) => {
    const { container } = render(screen());
    expect(container.querySelectorAll("[data-upload-zone]")).toHaveLength(1);
  });

  it.each(SCREENS)("%s sends what it takes to the folder it is showing", async (_name, screen, destination) => {
    const { container } = render(screen());
    const zone = container.querySelector("[data-upload-zone]")!;

    // The event `useFilePicker` dispatches once the chooser returns,
    // and the same one the drop handler raises. Going in this way is
    // what makes the destination observable at all: it is carried by
    // the zone's props, never by the control that started the upload.
    zone.dispatchEvent(
      new CustomEvent("upload-files", { detail: [new File(["x"], "note.txt")] }),
    );

    await waitFor(() => expect(initUpload).toHaveBeenCalled());
    const [drive, body] = initUpload.mock.calls[0] as [string, { folder_path: string }];
    expect(drive).toBe("main");
    expect(body.folder_path).toBe(destination);
  });

  it("covers three screens, so a deleted row is not a silent narrowing", () => {
    expect(SCREENS).toHaveLength(3);
  });
});
