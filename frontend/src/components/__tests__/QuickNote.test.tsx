import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

import { ShortcutsProvider } from "../ShortcutsProvider";
import { ToastProvider } from "../ToastProvider";
import { QuickNote } from "../quick-note";
import type { FileItem } from "@/types";

const mockRouterPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
}));

const driveState = vi.hoisted(() => ({ current: null as string | null }));
vi.mock("../CurrentDriveProvider", () => ({
  useCurrentDrive: () => driveState.current,
}));

const mockGetDrives = vi.fn();
const mockCreateTextFile = vi.fn();
vi.mock("@/lib/api", () => ({
  getDrives: (...args: unknown[]) => mockGetDrives(...args),
  createTextFile: (...args: unknown[]) => mockCreateTextFile(...args),
}));

// The real picker fetches folder trees; the panel only needs it to report a
// chosen folder back.
vi.mock("../FolderPicker", () => ({
  FolderPicker: ({ onChange }: { onChange: (path: string) => void }) => (
    <button type="button" onClick={() => onChange("Captures")}>
      pick-folder
    </button>
  ),
}));

function renderQuickNote() {
  return render(
    <ShortcutsProvider>
      <ToastProvider>
        <QuickNote />
      </ToastProvider>
    </ShortcutsProvider>,
  );
}

function drivesOf(...names: string[]) {
  return names.map((name) => ({ name, protected: false, file_count: 0 }));
}

function fileResponse(overrides: Partial<FileItem> = {}): FileItem {
  return {
    id: "abc123456789",
    filename: "note.md",
    folder_path: "Inbox",
    drive: "photos",
    title: "note",
    description: "",
    file_type: "document",
    mime_type: "text/markdown",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 4,
    duration: null,
    likes: 0,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier: "verified",
    trust_reviewed_at: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  } as FileItem;
}

/** Open the panel and wait for the drive request to settle. */
async function openPanel() {
  fireEvent.click(screen.getByRole("button", { name: "Quick note" }));
  await screen.findByRole("dialog");
  await act(async () => {
    await Promise.resolve();
  });
}

function typeBody(text: string) {
  fireEvent.change(screen.getByLabelText("Note text"), { target: { value: text } });
}

/** Matches both the idle ("Save") and in-flight ("Saving...") labels. */
const saveButton = () => screen.getByRole("button", { name: /^Sav/ });

/** The panel expands the destination itself when the user has to act on it,
 *  so the toggle is only clicked when it is still collapsed. */
function openDestination() {
  const toggle = screen.getByRole("button", { name: /Destination/ });
  if (toggle.getAttribute("aria-expanded") !== "true") fireEvent.click(toggle);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  driveState.current = null;
  mockGetDrives.mockResolvedValue(drivesOf("photos"));
  mockCreateTextFile.mockResolvedValue(fileResponse());
});

describe("QuickNote header action", () => {
  it("renders without an active drive", () => {
    driveState.current = null;
    renderQuickNote();
    expect(screen.getByRole("button", { name: "Quick note" })).toBeInTheDocument();
  });

  it("renders with an active drive", () => {
    driveState.current = "photos";
    renderQuickNote();
    expect(screen.getByRole("button", { name: "Quick note" })).toBeInTheDocument();
  });

  it("does not open the panel until the action is used", () => {
    renderQuickNote();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("QuickNote shortcut", () => {
  it("opens on N when focus is not in an editor", async () => {
    renderQuickNote();
    fireEvent.keyDown(document, { key: "n" });
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("does not open on N while typing in an input", () => {
    render(
      <ShortcutsProvider>
        <ToastProvider>
          <input aria-label="other field" />
          <QuickNote />
        </ToastProvider>
      </ShortcutsProvider>,
    );
    const input = screen.getByLabelText("other field");
    input.focus();
    fireEvent.keyDown(input, { key: "n" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("QuickNote panel", () => {
  it("focuses the textarea on open", async () => {
    renderQuickNote();
    await openPanel();
    expect(screen.getByLabelText("Note text")).toHaveFocus();
  });

  it("keeps Save disabled for empty and whitespace-only text", async () => {
    renderQuickNote();
    await openPanel();
    expect(saveButton()).toBeDisabled();
    typeBody("   \n\t ");
    expect(saveButton()).toBeDisabled();
    typeBody("real content");
    expect(saveButton()).toBeEnabled();
  });

  it("blocks a body over the 1 MiB UTF-8 backend limit", async () => {
    renderQuickNote();
    await openPanel();
    typeBody("a".repeat(1024 * 1024 + 1));
    expect(saveButton()).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("1 MB");
  });

  it("counts UTF-8 bytes, not characters, against the limit", async () => {
    renderQuickNote();
    await openPanel();
    // 400_000 three-byte characters = 1.2 MB, well under the character count.
    typeBody("あ".repeat(400_000));
    expect(saveButton()).toBeDisabled();
  });

  it("closes immediately when the body is empty", async () => {
    renderQuickNote();
    await openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("asks for confirmation before discarding a non-empty body", async () => {
    renderQuickNote();
    await openPanel();
    typeBody("unsaved thought");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByText("Discard this note?")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByText("Discard this note?")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Note text")).toHaveValue("unsaved thought");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    // Reopening starts from a blank body.
    await openPanel();
    expect(screen.getByLabelText("Note text")).toHaveValue("");
  });
});

describe("QuickNote focus containment", () => {
  it("wraps Tab inside the panel", async () => {
    driveState.current = "photos";
    renderQuickNote();
    await openPanel();

    const dialog = screen.getByRole("dialog");
    const closeButton = screen.getByRole("button", { name: "Close" });
    const cancelButton = screen.getByRole("button", { name: "Cancel" });

    cancelButton.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(cancelButton).toHaveFocus();
  });

  it("locks focus into the discard confirmation", async () => {
    driveState.current = "photos";
    renderQuickNote();
    await openPanel();
    typeBody("unsaved");

    fireEvent.keyDown(document, { key: "Escape" });
    const discardButton = await screen.findByRole("button", { name: "Discard" });
    const keepButton = screen.getByRole("button", { name: "Keep editing" });
    expect(discardButton).toHaveFocus();

    // The panel behind the confirmation is inert, so it is neither tabbable
    // nor clickable while the question is open.
    expect(screen.getByLabelText("Note text").closest("[inert]")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Cancel" }).closest("[inert]")).not.toBeNull();

    // jsdom does not implement native tab traversal, so only the wrapping
    // moves the trap makes itself are observable — which is exactly what
    // keeps focus from escaping into the inert panel behind.
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(keepButton).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(discardButton).toHaveFocus();
  });

  it("returns focus to the header action when the panel closes", async () => {
    driveState.current = "photos";
    renderQuickNote();
    const trigger = screen.getByRole("button", { name: "Quick note" });
    await openPanel();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});

describe("QuickNote destination", () => {
  it("requires a choice when several drives are accessible and none is current", async () => {
    mockGetDrives.mockResolvedValue(drivesOf("photos", "notes"));
    renderQuickNote();
    await openPanel();

    typeBody("needs a destination");
    expect(saveButton()).toBeDisabled();
    expect(screen.getByLabelText("Drive")).toHaveValue("");

    fireEvent.change(screen.getByLabelText("Drive"), { target: { value: "notes" } });
    await waitFor(() => expect(saveButton()).toBeEnabled());
  });

  it("prefers the drive of the current screen", async () => {
    driveState.current = "notes";
    mockGetDrives.mockResolvedValue(drivesOf("photos", "notes"));
    renderQuickNote();
    await openPanel();
    expect(screen.getByText("notes / Inbox")).toBeInTheDocument();
    openDestination();
    expect(screen.getByLabelText("Drive")).toHaveValue("notes");
  });

  it("loads each drive's own folder preference", async () => {
    localStorage.setItem(
      "quick-note:destination:photos",
      JSON.stringify({ folder: "Captures" }),
    );
    localStorage.setItem(
      "quick-note:destination:notes",
      JSON.stringify({ folder: "Inbox/Quick" }),
    );
    mockGetDrives.mockResolvedValue(drivesOf("photos", "notes"));
    driveState.current = "photos";

    renderQuickNote();
    await openPanel();
    expect(screen.getByText("photos / Captures")).toBeInTheDocument();

    openDestination();
    fireEvent.change(screen.getByLabelText("Drive"), { target: { value: "notes" } });
    await waitFor(() =>
      expect(screen.getByText("notes / Inbox/Quick")).toBeInTheDocument(),
    );
  });

  it("re-resolves against the current screen on every open", async () => {
    // The component is mounted in the header, so it survives navigation. A
    // note written after moving from one drive to another must not land in
    // the drive the previous note went to.
    mockGetDrives.mockResolvedValue(drivesOf("photos", "notes"));
    driveState.current = "photos";
    renderQuickNote();

    await openPanel();
    typeBody("first note");
    fireEvent.click(saveButton());
    await waitFor(() => expect(mockCreateTextFile).toHaveBeenCalledTimes(1));
    expect(mockCreateTextFile.mock.calls[0]![0]).toBe("photos");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    // Navigate to the other drive and open the same component again.
    driveState.current = "notes";
    await openPanel();
    expect(screen.getByText("notes / Inbox")).toBeInTheDocument();

    typeBody("second note");
    fireEvent.click(saveButton());
    await waitFor(() => expect(mockCreateTextFile).toHaveBeenCalledTimes(2));
    expect(mockCreateTextFile.mock.calls[1]![0]).toBe("notes");
  });

  it("keeps a manual choice when the list is refreshed mid-session", async () => {
    // A refresh that is not a fresh open (here: the post-403 re-check) must
    // not throw away the drive the user just picked by hand.
    mockGetDrives.mockResolvedValue(drivesOf("photos", "notes"));
    mockCreateTextFile.mockRejectedValue(new Error("API error: 403 Forbidden"));
    driveState.current = "photos";
    renderQuickNote();
    await openPanel();

    openDestination();
    fireEvent.change(screen.getByLabelText("Drive"), { target: { value: "notes" } });
    typeBody("manual choice");
    fireEvent.click(saveButton());

    await waitFor(() => expect(mockGetDrives).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("Drive")).toHaveValue("notes");
  });

  it("refuses to save while the accessible-drive list is unconfirmed", async () => {
    mockGetDrives.mockResolvedValue(drivesOf("photos"));
    driveState.current = "photos";
    renderQuickNote();

    // First open resolves normally and leaves "photos" selected.
    await openPanel();
    typeBody("first");
    await waitFor(() => expect(saveButton()).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    // Second open cannot reach the API: the stale selection is not authority.
    mockGetDrives.mockRejectedValue(new Error("API error: 500 boom"));
    await openPanel();
    typeBody("second");
    await waitFor(() =>
      expect(screen.getByText("Could not load drives.")).toBeInTheDocument(),
    );
    expect(saveButton()).toBeDisabled();

    fireEvent.keyDown(screen.getByLabelText("Note text"), {
      key: "Enter",
      ctrlKey: true,
      metaKey: true,
    });
    expect(mockCreateTextFile).not.toHaveBeenCalled();
  });

  it("offers a retry when the drive list cannot load", async () => {
    mockGetDrives.mockRejectedValueOnce(new Error("API error: 500 boom"));
    renderQuickNote();
    await openPanel();

    openDestination();
    expect(await screen.findByText("Could not load drives.")).toBeInTheDocument();

    typeBody("text");
    expect(saveButton()).toBeDisabled();

    mockGetDrives.mockResolvedValue(drivesOf("photos"));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(saveButton()).toBeEnabled());
  });
});

describe("QuickNote save", () => {
  it("submits the exact body, reports the returned path, and closes", async () => {
    driveState.current = "photos";
    mockCreateTextFile.mockResolvedValue(
      fileResponse({ folder_path: "Inbox", filename: "Renewal deadline (1).md" }),
    );
    renderQuickNote();
    await openPanel();

    typeBody("# Renewal deadline\n\nbank card expires in march");
    fireEvent.click(saveButton());

    await waitFor(() => expect(mockCreateTextFile).toHaveBeenCalledTimes(1));
    const [drive, payload] = mockCreateTextFile.mock.calls[0] as [
      string,
      { path: string; content: string },
    ];
    expect(drive).toBe("photos");
    expect(payload.path).toBe("Inbox/Renewal deadline.md");
    expect(payload.content).toBe("# Renewal deadline\n\nbank card expires in march");

    // The toast shows what the server actually created, not the predicted name.
    expect(
      await screen.findByText("Saved to photos/Inbox/Renewal deadline (1).md"),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mockRouterPush).not.toHaveBeenCalled();

    expect(localStorage.getItem("quick-note:last-drive")).toBe("photos");
    expect(localStorage.getItem("quick-note:destination:photos")).toBe(
      JSON.stringify({ folder: "Inbox" }),
    );

    await openPanel();
    expect(screen.getByLabelText("Note text")).toHaveValue("");
  });

  it("saves with Cmd/Ctrl+Enter exactly once", async () => {
    driveState.current = "photos";
    renderQuickNote();
    await openPanel();
    typeBody("chord save");

    fireEvent.keyDown(screen.getByLabelText("Note text"), {
      key: "Enter",
      ctrlKey: true,
      metaKey: true,
    });

    await waitFor(() => expect(mockCreateTextFile).toHaveBeenCalledTimes(1));
  });

  it("writes the chosen folder into the path", async () => {
    driveState.current = "photos";
    renderQuickNote();
    await openPanel();
    openDestination();
    fireEvent.click(screen.getByRole("button", { name: "pick-folder" }));
    typeBody("filed elsewhere");
    fireEvent.click(saveButton());

    await waitFor(() => expect(mockCreateTextFile).toHaveBeenCalledTimes(1));
    const [, payload] = mockCreateTextFile.mock.calls[0] as [
      string,
      { path: string },
    ];
    expect(payload.path).toBe("Captures/filed elsewhere.md");
  });

  it("ignores duplicate submissions while a request is in flight", async () => {
    driveState.current = "photos";
    mockCreateTextFile.mockImplementation(() => new Promise(() => {}));
    renderQuickNote();
    await openPanel();
    typeBody("only once");

    const button = saveButton();
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.keyDown(screen.getByLabelText("Note text"), {
      key: "Enter",
      ctrlKey: true,
      metaKey: true,
    });

    await waitFor(() => expect(mockCreateTextFile).toHaveBeenCalledTimes(1));
    expect(saveButton()).toBeDisabled();
  });

  it("keeps the body and the old preferences when the request fails", async () => {
    driveState.current = "photos";
    mockCreateTextFile.mockRejectedValue(new Error("API error: 500 Server Error"));
    renderQuickNote();
    await openPanel();
    typeBody("survives failure");
    fireEvent.click(saveButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not save the note.",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Note text")).toHaveValue("survives failure");
    expect(localStorage.getItem("quick-note:last-drive")).toBeNull();
    expect(localStorage.getItem("quick-note:destination:photos")).toBeNull();
  });

  it("re-resolves the destination when access changed under it", async () => {
    driveState.current = "photos";
    mockCreateTextFile.mockRejectedValue(new Error("API error: 403 Forbidden"));
    renderQuickNote();
    await openPanel();
    typeBody("locked out");

    mockGetDrives.mockResolvedValue(drivesOf("notes", "shared"));
    fireEvent.click(saveButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That drive is no longer available.",
    );
    await waitFor(() => expect(screen.getByLabelText("Drive")).toHaveValue(""));
    expect(screen.getByLabelText("Note text")).toHaveValue("locked out");
    expect(saveButton()).toBeDisabled();
  });
});
