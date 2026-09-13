/**
 * The upload control finds its zone with `document.querySelector` and does
 * nothing when there is none, so a missing zone fails silently.
 * `UploadZone` is deliberately not mocked here.
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

const SCREENS: [string, () => React.ReactElement, string][] = [
  ["the drive home", () => <DriveHome driveName="main" />, ""],
  ["the Library root", () => <FolderBrowser driveName="main" folderPath="" view="library" />, ""],
  ["a folder", () => <FolderBrowser driveName="main" folderPath="recipes" />, "recipes"],
  // The screens with no folder of their own. They keep a zone on purpose:
  // the drop overlay names no destination, unlike the paste banner, and
  // once the toolbar's Add is hidden a drag is the only way left to put
  // anything on a drive from them. Removing it is the tidy-up that looks
  // obvious beside the paste gate and takes a working route away.
  ["Favourites", () => <FolderBrowser driveName="main" view="favorites" />, ""],
  ["Liked", () => <FolderBrowser driveName="main" view="liked" />, ""],
  ["Recently Viewed", () => <FolderBrowser driveName="main" view="recent" />, ""],
  ["Recently Added", () => <FolderBrowser driveName="main" view="recent-added" />, ""],
  ["All Files", () => <FolderBrowser driveName="main" view="all" />, ""],
  ["a tag at the drive root", () => <FolderBrowser driveName="main" tagFilter="soup" />, ""],
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

    zone.dispatchEvent(
      new CustomEvent("upload-files", { detail: [new File(["x"], "note.txt")] }),
    );

    await waitFor(() => expect(initUpload).toHaveBeenCalled());
    const [drive, body] = initUpload.mock.calls[0] as [string, { folder_path: string }];
    expect(drive).toBe("main");
    expect(body.folder_path).toBe(destination);
  });

  it("covers nine screens, so a deleted row is not a silent narrowing", () => {
    expect(SCREENS).toHaveLength(9);
  });
});
