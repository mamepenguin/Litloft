/**
 * SPEC-CORE-030 I7 — **Lock** asks before it locks while an upload is
 * unfinished, and cancelling leaves the app unlocked with the upload
 * running.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentType } from "react";

vi.mock("@/lib/api", async () => (await import("@/__tests__/helpers/uploadApiMock")).apiMock());
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
vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({
    addons: {},
    slots: {},
    loading: false,
    getSlotEntries: () => [],
    hasSlot: () => false,
    catalogueDrive: "main",
  }),
}));
vi.mock("@/components/CurrentDriveProvider", () => ({
  useCurrentDrive: () => "main",
  useCurrentFolderPath: () => null,
  useSetOverrideDrive: () => vi.fn(),
}));
vi.mock("@/components/SidebarProvider", () => ({
  useSidebar: () => ({ isOpen: true, isOverlay: false, close: vi.fn(), refreshKey: 0 }),
}));
vi.mock("@/components/sidebar/useSidebarData", () => ({
  useSidebarData: () => ({
    drives: [{ name: "main", file_count: 1 }],
    tags: null,
    pins: [],
    collectionList: [],
    setCollectionList: vi.fn(),
    authStatus: {
      is_admin: false,
      has_protected_drives: true,
      unlocked_groups: ["family"],
    },
    driveSummary: { missing_count: 0 },
  }),
}));
vi.mock("@/hooks/useShortcuts", () => ({ useShortcuts: vi.fn() }));
vi.mock("@/hooks/useSmartFolders", () => ({
  useSmartFolders: () => ({ smartFolders: [], update: vi.fn(), remove: vi.fn() }),
}));

import { mockedApi, type UploadApi } from "@/__tests__/helpers/uploadApiMock";
import {
  deferred,
  dropOn,
  flush,
  initResult,
  type InitResult,
} from "@/__tests__/helpers/uploadQueue";

const LOCK_TITLE = "Uploads in progress";
const LOCK_MESSAGE = "Locking interrupts the uploads in progress.";

type Modules = {
  Sidebar: typeof import("@/components/Sidebar").Sidebar;
  UploadZone: typeof import("@/components/UploadZone").UploadZone;
  UploadProgress: typeof import("@/components/UploadProgress").UploadProgress;
};

async function loadModules(): Promise<Modules> {
  const [{ Sidebar }, { UploadZone }, { UploadProgress }] = await Promise.all([
    import("@/components/Sidebar"),
    import("@/components/UploadZone"),
    import("@/components/UploadProgress"),
  ]);
  return { Sidebar, UploadZone, UploadProgress };
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(element);
  });
}

/** The open confirmation's panel, found from the heading the spec fixes. */
function dialog(): HTMLElement {
  const heading = screen.getByRole("heading", { name: LOCK_TITLE });
  return heading.parentElement!.parentElement as HTMLElement;
}

const lockButton = () => screen.getByRole("button", { name: "Lock" });

function leavePage(): Event {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event;
}

async function renderAppWithUnfinishedUpload(api: UploadApi) {
  const held = deferred<InitResult>();
  api.initUpload.mockReturnValue(held.promise);
  const { Sidebar, UploadZone, UploadProgress } = await loadModules();
  const Drawer = UploadProgress as unknown as ComponentType;

  const view = render(
    <>
      <UploadZone drive="main" folderPath="films">
        <div />
      </UploadZone>
      <Sidebar />
      <Drawer />
    </>,
  );
  await dropOn(view.container, [new File(["x"], "a.txt")]);
  expect(screen.getByText("Uploading")).toBeInTheDocument();
  return { view, held };
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  vi.resetAllMocks();
  localStorage.clear();
  const api = await mockedApi();
  api.initUpload.mockResolvedValue({ upload_id: "upload-1", chunk_size: 5, total_chunks: 1 });
  api.uploadChunk.mockResolvedValue({});
  api.completeUpload.mockResolvedValue({});
  api.cancelUpload.mockResolvedValue(undefined);
  api.lock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SPEC-CORE-030 I7 — Lock during an upload", () => {
  it("SPEC-CORE-030 I7 asks first and calls the lock API only on confirm", async () => {
    const api = await mockedApi();
    await renderAppWithUnfinishedUpload(api);

    await click(lockButton());

    expect(screen.getByRole("heading", { name: LOCK_TITLE })).toBeInTheDocument();
    expect(screen.getByText(LOCK_MESSAGE)).toBeInTheDocument();
    expect(api.lock).not.toHaveBeenCalled();
  });

  it("SPEC-CORE-030 I7 cancelling leaves the app unlocked and the upload running", async () => {
    const api = await mockedApi();
    const { held } = await renderAppWithUnfinishedUpload(api);

    await click(lockButton());
    await click(within(dialog()).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("heading", { name: LOCK_TITLE })).toBeNull();
    expect(api.lock).not.toHaveBeenCalled();
    expect(api.cancelUpload).not.toHaveBeenCalled();
    expect(screen.getByText("Uploading")).toBeInTheDocument();

    held.resolve(initResult("upload-1"));
    await flush();

    expect(api.completeUpload).toHaveBeenCalledTimes(1);
    expect(api.lock).not.toHaveBeenCalled();
  });

  it("SPEC-CORE-030 I7 confirming locks, and the reload it starts does not ask again", async () => {
    const api = await mockedApi();
    await renderAppWithUnfinishedUpload(api);

    await click(lockButton());
    await click(within(dialog()).getByRole("button", { name: "Lock" }));

    expect(api.lock).toHaveBeenCalledTimes(1);
    expect(leavePage().defaultPrevented).toBe(false);
  });

  it("SPEC-CORE-030 I7 with no unfinished entry, Lock is unchanged and asks nothing", async () => {
    const api = await mockedApi();
    const { Sidebar, UploadProgress } = await loadModules();
    const Drawer = UploadProgress as unknown as ComponentType;

    render(
      <>
        <Sidebar />
        <Drawer />
      </>,
    );

    await click(lockButton());

    expect(screen.queryByRole("heading", { name: LOCK_TITLE })).toBeNull();
    expect(api.lock).toHaveBeenCalledTimes(1);
  });
});
