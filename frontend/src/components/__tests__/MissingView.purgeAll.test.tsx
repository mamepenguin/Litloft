import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { FileItem } from "@/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/drive/main",
  useSearchParams: () => new URLSearchParams(),
}));

const apiMocks = vi.hoisted(() => ({
  getMissing: vi.fn(),
  purgeAllMissing: vi.fn(),
  purgeFile: vi.fn(),
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  ...apiMocks,
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

vi.stubGlobal(
  "IntersectionObserver",
  class {
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
    constructor(_cb: IntersectionObserverCallback) {}
  },
);

import { MissingView } from "../missing/MissingView";

function missingFile(id: string): FileItem {
  return {
    id,
    filename: `${id}.mp4`,
    title: `Missing ${id}`,
    description: "",
    drive: "main",
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    file_size: 100,
    duration: 10,
    tags: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  } as unknown as FileItem;
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

async function openPurgeAll(confirmNow = true) {
  render(<MissingView driveName="main" />);
  fireEvent.click(await screen.findByRole("button", { name: /Permanently Delete All/i }));
  if (confirmNow) fireEvent.click(screen.getByTestId("confirm-button"));
}

describe("SPEC-CORE-121 whole-list purge (MissingView)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getMissing.mockResolvedValue({
      data: [missingFile("a"), missingFile("b")],
      meta: { total: 2, page: 1, limit: 30 },
    });
  });

  it("I10 [SPEC-CORE-121] while the request runs, the dialog shows Working and its controls are disabled", async () => {
    const pending = deferred<unknown>();
    apiMocks.purgeAllMissing.mockReturnValue(pending.promise);

    await openPurgeAll();

    expect(screen.getByTestId("confirm-dialog")).toHaveAttribute("data-busy", "true");
    expect(screen.getByText("Working")).toBeInTheDocument();
    expect(screen.getByTestId("confirm-button")).toBeDisabled();
    expect(screen.getByTestId("cancel-button")).toBeDisabled();

    pending.resolve({ purged: 2, errors: [] });
    await waitFor(() => expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument());
  });

  it("I10 [SPEC-CORE-121] one confirm sends exactly one request", async () => {
    const pending = deferred<unknown>();
    apiMocks.purgeAllMissing.mockReturnValue(pending.promise);

    await openPurgeAll(false);
    fireEvent.click(screen.getByTestId("confirm-button"));
    fireEvent.click(screen.getByTestId("confirm-button"));

    expect(apiMocks.purgeAllMissing).toHaveBeenCalledTimes(1);
    pending.resolve({ purged: 2, errors: [] });
    await waitFor(() => expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument());
  });

  it("I11 [SPEC-CORE-121] a failed request keeps the dialog open with the failure text, enables its controls, and refetches the list", async () => {
    apiMocks.purgeAllMissing.mockRejectedValue(new Error("API error: 500 Internal Server Error"));
    const listCallsBefore = apiMocks.getMissing.mock.calls.length;

    await openPurgeAll();

    expect(await screen.findByText("Could not complete. Please try again.")).toBeInTheDocument();
    const dialog = screen.getByTestId("confirm-dialog");
    expect(dialog).toHaveAttribute("data-busy", "false");
    expect(screen.getByTestId("confirm-button")).toBeEnabled();
    expect(screen.getByTestId("cancel-button")).toBeEnabled();
    expect(apiMocks.getMissing.mock.calls.length).toBeGreaterThan(listCallsBefore);
  });

  it("I11 [SPEC-CORE-121] the failure text is fixed, not the raw fetchJSON message", async () => {
    apiMocks.purgeAllMissing.mockRejectedValue(new Error("API error: 500 Internal Server Error"));

    await openPurgeAll();

    await screen.findByText("Could not complete. Please try again.");
    expect(screen.queryByText(/API error/)).not.toBeInTheDocument();
  });

  it("I22 [SPEC-CORE-121] a successful request closes the dialog and empties the list", async () => {
    apiMocks.purgeAllMissing.mockResolvedValue({ purged: 2, errors: [] });

    await openPurgeAll();

    await waitFor(() => expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText("Missing a")).not.toBeInTheDocument());
    expect(screen.queryByText("Missing b")).not.toBeInTheDocument();
  });
});
