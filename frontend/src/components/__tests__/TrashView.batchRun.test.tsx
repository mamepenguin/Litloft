import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  getTrash: vi.fn(),
  emptyTrash: vi.fn(),
  purgeFile: vi.fn(),
  restoreFile: vi.fn(),
  batchRestore: vi.fn(),
  batchPurge: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/drive/main",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  ...apiMocks,
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
}));

vi.mock("@/components/ConfirmDialog", () => ({
  ConfirmDialog: (p: any) =>
    p.open ? (
      <div data-testid="confirm-dialog" data-busy={p.busy ? "true" : "false"}>
        {p.progress ? <p>{p.progress}</p> : null}
        {p.error ? <p>{p.error}</p> : null}
        <button data-testid="confirm-button" disabled={!!p.busy} onClick={p.onConfirm}>
          Confirm
        </button>
        <button data-testid="cancel-button" disabled={!!p.busy} onClick={p.onCancel}>
          Cancel
        </button>
      </div>
    ) : null,
}));

// Exposes the props the parent hands over, so the parent's handling can be driven directly.
vi.mock("@/components/SelectionBar", () => ({
  SelectionBar: (p: any) => (
    <div data-testid="selection-bar">
      <span data-testid="selected">{Array.from(p.selectedIds as Set<string>).join(",")}</span>
      <button onClick={() => p.onSelectOnly(["a", "b"])}>call-select-two</button>
      <button onClick={() => p.onSelectOnly(["b"])}>call-select-b</button>
      <button onClick={() => p.onProcessed(["a"])}>call-processed-a</button>
    </div>
  ),
}));

vi.mock("@/components/trash/TrashToolbar", () => ({
  TrashToolbar: () => <div data-testid="trash-toolbar" />,
}));

vi.stubGlobal(
  "IntersectionObserver",
  class {
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
    constructor(_cb: IntersectionObserverCallback) {}
  },
);

import { TrashView } from "../trash/TrashView";

function trashFile(id: string) {
  return {
    id,
    filename: `${id}.mp4`,
    title: `Trash ${id}`,
    description: "",
    drive: "main",
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 1024,
    duration: 120,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: "2026-11-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function openEmptyTrash(confirmNow = true) {
  render(<TrashView driveName="main" />);
  fireEvent.click(await screen.findByRole("button", { name: /Empty Trash/i }));
  if (confirmNow) fireEvent.click(screen.getByTestId("confirm-button"));
}

describe("SPEC-CORE-121 whole-list empty trash (TrashView)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getTrash.mockResolvedValue({
      data: [trashFile("a"), trashFile("b")],
      meta: { total: 2, page: 1, limit: 30 },
    });
  });

  it("I10 [SPEC-CORE-121] while the request runs, the dialog shows Working and its controls are disabled", async () => {
    const pending = deferred<unknown>();
    apiMocks.emptyTrash.mockReturnValue(pending.promise);

    await openEmptyTrash();

    expect(screen.getByTestId("confirm-dialog")).toHaveAttribute("data-busy", "true");
    expect(screen.getByText("Working")).toBeInTheDocument();
    expect(screen.getByTestId("confirm-button")).toBeDisabled();
    expect(screen.getByTestId("cancel-button")).toBeDisabled();

    pending.resolve({ purged: 2 });
    await waitFor(() => expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument());
  });

  it("I10 [SPEC-CORE-121] one confirm sends exactly one emptyTrash request", async () => {
    const pending = deferred<unknown>();
    apiMocks.emptyTrash.mockReturnValue(pending.promise);

    await openEmptyTrash(false);
    fireEvent.click(screen.getByTestId("confirm-button"));
    fireEvent.click(screen.getByTestId("confirm-button"));

    expect(apiMocks.emptyTrash).toHaveBeenCalledTimes(1);
    expect(apiMocks.emptyTrash).toHaveBeenCalledWith("main");
    pending.resolve({ purged: 2 });
    await waitFor(() => expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument());
  });

  it("I11 [SPEC-CORE-121] a failed request keeps the dialog open with the failure text, enables its controls, and refetches the list", async () => {
    apiMocks.emptyTrash.mockRejectedValue(new Error("API error: 500 Internal Server Error"));
    const listCallsBefore = apiMocks.getTrash.mock.calls.length;

    await openEmptyTrash();

    expect(await screen.findByText("Could not complete. Please try again.")).toBeInTheDocument();
    expect(screen.getByTestId("confirm-dialog")).toHaveAttribute("data-busy", "false");
    expect(screen.getByTestId("confirm-button")).toBeEnabled();
    expect(screen.getByTestId("cancel-button")).toBeEnabled();
    expect(apiMocks.getTrash.mock.calls.length).toBeGreaterThan(listCallsBefore);
  });

  it("I22 [SPEC-CORE-121] a successful request closes the dialog and empties the list", async () => {
    apiMocks.emptyTrash.mockResolvedValue({ purged: 2 });

    await openEmptyTrash();

    await waitFor(() => expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText("Trash a")).not.toBeInTheDocument());
    expect(screen.queryByText("Trash b")).not.toBeInTheDocument();
  });
});
