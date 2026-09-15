import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

import { ShortcutsProvider } from "../ShortcutsProvider";
import { ToastProvider } from "../ToastProvider";
import {
  QuickNote,
  QuickNoteProvider,
  useQuickNote,
  type QuickNoteOpenOptions,
} from "../quick-note";
import type { FileItem } from "@/types";
import { accentFills } from "@/__tests__/helpers/accentFills";

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

vi.mock("../FolderPicker", () => ({
  FolderPicker: ({ onChange }: { onChange: (path: string) => void }) => (
    <button type="button" onClick={() => onChange("Captures")}>
      pick-folder
    </button>
  ),
}));

function Opener({ options, label = "open-from-page" }: { options?: QuickNoteOpenOptions; label?: string }) {
  const quickNote = useQuickNote();
  return (
    <button type="button" onClick={() => quickNote.open(options)}>
      {label}
    </button>
  );
}

function renderWithOpener(options?: QuickNoteOpenOptions) {
  return render(
    <QuickNoteProvider>
      <ShortcutsProvider>
        <ToastProvider>
          <QuickNote />
          <Opener options={options} />
        </ToastProvider>
      </ShortcutsProvider>
    </QuickNoteProvider>,
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
    liked_at: null,
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

async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function openFromHeader() {
  fireEvent.click(screen.getByRole("button", { name: "Quick note" }));
  await screen.findByRole("dialog");
  await settle();
}

async function openFromPage() {
  fireEvent.click(screen.getByRole("button", { name: "open-from-page" }));
  await screen.findByRole("dialog");
  await settle();
}

function typeBody(text: string) {
  fireEvent.change(screen.getByLabelText("Note text"), { target: { value: text } });
}

const saveButton = () => screen.getByRole("button", { name: /^(Save|Saving\.\.\.)$/ });
const saveAndOpenButton = () =>
  screen.getByRole("button", { name: /^(Save and open|Saving\.\.\.)$/ });

function pressSaveChord() {
  fireEvent.keyDown(screen.getByLabelText("Note text"), {
    key: "Enter",
    ctrlKey: true,
    metaKey: true,
  });
}

async function discardAndClose() {
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  const discard = screen.queryByRole("button", { name: "Discard" });
  if (discard) fireEvent.click(discard);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  driveState.current = "photos";
  mockGetDrives.mockResolvedValue(drivesOf("photos"));
  mockCreateTextFile.mockResolvedValue(fileResponse());
});

describe("QuickNote footer", () => {
  it("orders Save and open, Cancel, Save", async () => {
    renderWithOpener();
    await openFromHeader();
    const labels = Array.from(
      screen.getByRole("dialog").querySelectorAll<HTMLButtonElement>("button"),
    )
      .map((b) => b.textContent)
      .filter((text) => ["Save and open", "Cancel", "Save"].includes(text ?? ""));
    expect(labels).toEqual(["Save and open", "Cancel", "Save"]);
  });

  it("has exactly one accent fill at rest, on Save", async () => {
    renderWithOpener();
    await openFromHeader();
    typeBody("resting");
    const fills = accentFills(screen.getByRole("dialog"));
    expect(fills).toHaveLength(1);
    expect(fills[0]).toBe(saveButton());
  });

  it("keeps Save and open disabled until Save could run", async () => {
    renderWithOpener();
    await openFromHeader();
    expect(saveAndOpenButton()).toBeDisabled();
    typeBody("   ");
    expect(saveAndOpenButton()).toBeDisabled();
    typeBody("text");
    expect(saveAndOpenButton()).toBeEnabled();
  });
});

describe("QuickNote Save and open", () => {
  it("sends the Save request and then opens the created file for editing", async () => {
    driveState.current = "notes";
    mockGetDrives.mockResolvedValue(drivesOf("photos", "notes"));
    mockCreateTextFile.mockResolvedValue(
      fileResponse({
        id: "zyx987654321",
        drive: "notes",
        folder_path: "Inbox",
        filename: "Idea (1).md",
      }),
    );
    renderWithOpener();
    await openFromHeader();
    typeBody("# Idea\n\nbody");

    fireEvent.click(saveAndOpenButton());

    await waitFor(() => expect(mockCreateTextFile).toHaveBeenCalledTimes(1));
    expect(mockCreateTextFile.mock.calls[0]).toEqual([
      "notes",
      { path: "Inbox/Idea.md", content: "# Idea\n\nbody" },
    ]);
    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith(
        "/drive/notes/Inbox?file=zyx987654321&edit=1",
      ),
    );
    expect(mockRouterPush).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(localStorage.getItem("quick-note:last-drive")).toBe("notes");
    expect(localStorage.getItem("quick-note:destination:notes")).toBe(
      JSON.stringify({ folder: "Inbox" }),
    );
  });

  it("opens a file saved at the drive root", async () => {
    mockCreateTextFile.mockResolvedValue(
      fileResponse({ id: "root00000001", folder_path: "", filename: "a.md" }),
    );
    renderWithOpener({ drive: "photos", folder: "" });
    await openFromPage();
    typeBody("a");
    fireEvent.click(saveAndOpenButton());
    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith("/drive/photos?file=root00000001&edit=1"),
    );
    expect(mockCreateTextFile.mock.calls[0]![1]).toEqual({ path: "a.md", content: "a" });
  });

  it("does not navigate before the request succeeds", async () => {
    let resolve: (file: FileItem) => void = () => {};
    mockCreateTextFile.mockImplementation(
      () => new Promise<FileItem>((r) => (resolve = r)),
    );
    renderWithOpener();
    await openFromHeader();
    typeBody("pending");
    fireEvent.click(saveAndOpenButton());

    await waitFor(() => expect(mockCreateTextFile).toHaveBeenCalledTimes(1));
    await settle();
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(localStorage.getItem("quick-note:last-drive")).toBeNull();

    await act(async () => {
      resolve(fileResponse());
    });
    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith("/drive/photos/Inbox?file=abc123456789&edit=1"),
    );
  });

  it("navigates nowhere and keeps the text when the request fails", async () => {
    mockCreateTextFile.mockRejectedValue(new Error("API error: 500 Server Error"));
    renderWithOpener();
    await openFromHeader();
    typeBody("survives failure");
    fireEvent.click(saveAndOpenButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save the note.");
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Note text")).toHaveValue("survives failure");
    expect(localStorage.getItem("quick-note:last-drive")).toBeNull();
    expect(localStorage.getItem("quick-note:destination:photos")).toBeNull();
  });

  it("creates one file when Save and open, Save and the chord all fire", async () => {
    mockCreateTextFile.mockImplementation(() => new Promise(() => {}));
    renderWithOpener();
    await openFromHeader();
    typeBody("only once");

    const andOpen = saveAndOpenButton();
    const save = saveButton();
    fireEvent.click(andOpen);
    fireEvent.click(andOpen);
    fireEvent.click(save);
    pressSaveChord();

    await waitFor(() => expect(mockCreateTextFile).toHaveBeenCalledTimes(1));
    expect(andOpen).toBeDisabled();
    expect(andOpen).toHaveTextContent("Saving...");
    expect(save).toBeDisabled();
    expect(save).toHaveTextContent(/^Save$/);
  });

  it("keeps the chord on Save, which does not navigate", async () => {
    renderWithOpener();
    await openFromHeader();
    typeBody("chord");
    pressSaveChord();
    await waitFor(() => expect(mockCreateTextFile).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mockRouterPush).not.toHaveBeenCalled();
  });
});

describe("useQuickNote().open", () => {
  it("preselects the given drive and folder and creates nothing", async () => {
    mockGetDrives.mockResolvedValue(drivesOf("photos", "notes"));
    renderWithOpener({ drive: "notes", folder: "Projects/Alpha" });
    await openFromPage();

    expect(screen.getByText("notes / Projects/Alpha")).toBeInTheDocument();
    expect(mockCreateTextFile).not.toHaveBeenCalled();

    typeBody("filed by the caller");
    fireEvent.click(saveButton());
    await waitFor(() => expect(mockCreateTextFile).toHaveBeenCalledTimes(1));
    expect(mockCreateTextFile.mock.calls[0]).toEqual([
      "notes",
      { path: "Projects/Alpha/filed by the caller.md", content: "filed by the caller" },
    ]);
  });

  it("applies the preselection to that opening only", async () => {
    mockGetDrives.mockResolvedValue(drivesOf("photos", "notes"));
    renderWithOpener({ drive: "notes", folder: "Projects/Alpha" });
    await openFromPage();
    expect(screen.getByText("notes / Projects/Alpha")).toBeInTheDocument();
    await discardAndClose();

    await openFromHeader();
    expect(screen.getByText("photos / Inbox")).toBeInTheDocument();
  });

  it("does not remember the preselection until a save succeeds", async () => {
    mockGetDrives.mockResolvedValue(drivesOf("photos", "notes"));
    renderWithOpener({ drive: "notes", folder: "Projects/Alpha" });
    await openFromPage();
    typeBody("not yet");
    await discardAndClose();
    expect(localStorage.getItem("quick-note:last-drive")).toBeNull();
    expect(localStorage.getItem("quick-note:destination:notes")).toBeNull();

    mockCreateTextFile.mockRejectedValueOnce(new Error("API error: 500 boom"));
    await openFromPage();
    typeBody("fails");
    fireEvent.click(saveButton());
    await screen.findByRole("alert");
    expect(localStorage.getItem("quick-note:destination:notes")).toBeNull();

    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(localStorage.getItem("quick-note:last-drive")).toBe("notes");
    expect(localStorage.getItem("quick-note:destination:notes")).toBe(
      JSON.stringify({ folder: "Projects/Alpha" }),
    );
  });

  it("never preselects a drive the viewer cannot reach", async () => {
    mockGetDrives.mockResolvedValue(drivesOf("photos", "notes"));
    renderWithOpener({ drive: "locked", folder: "Secret" });
    await openFromPage();
    expect(screen.getByText("photos / Inbox")).toBeInTheDocument();
    expect(screen.queryByText(/locked/)).not.toBeInTheDocument();
  });

  it("falls back to asking when the given drive is unreachable and nothing else resolves", async () => {
    driveState.current = null;
    mockGetDrives.mockResolvedValue(drivesOf("photos", "notes"));
    renderWithOpener({ drive: "locked" });
    await openFromPage();
    expect(screen.getByLabelText("Drive")).toHaveValue("");
    typeBody("needs a drive");
    expect(saveButton()).toBeDisabled();
  });

  it("uses the drive's remembered folder when no folder is given", async () => {
    localStorage.setItem("quick-note:destination:notes", JSON.stringify({ folder: "Scratch" }));
    mockGetDrives.mockResolvedValue(drivesOf("photos", "notes"));
    renderWithOpener({ drive: "notes" });
    await openFromPage();
    expect(screen.getByText("notes / Scratch")).toBeInTheDocument();
  });

  it("uses the drive's remembered folder when the given folder is not a valid path", async () => {
    mockGetDrives.mockResolvedValue(drivesOf("photos", "notes"));
    renderWithOpener({ drive: "notes", folder: "../outside" });
    await openFromPage();
    expect(screen.getByText("notes / Inbox")).toBeInTheDocument();
  });

  it("ignores a folder given without a drive", async () => {
    renderWithOpener({ folder: "Projects" });
    await openFromPage();
    expect(screen.getByText("photos / Inbox")).toBeInTheDocument();
  });

  it("resolves the requested drive once a retry confirms the list", async () => {
    mockGetDrives.mockResolvedValue(drivesOf("photos", "notes"));
    renderWithOpener({ drive: "notes", folder: "Projects" });
    // An earlier opening leaves another accessible drive selected.
    await openFromHeader();
    expect(screen.getByText("photos / Inbox")).toBeInTheDocument();
    await discardAndClose();

    mockGetDrives.mockRejectedValueOnce(new Error("API error: 500 boom"));
    await openFromPage();
    expect(await screen.findByText("Could not load drives.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByText("notes / Projects")).toBeInTheDocument());
  });

  describe("a drive list that arrives after its opening closed", () => {
    function deferredDriveLists() {
      const pending: Array<(names: string[]) => void> = [];
      mockGetDrives.mockImplementation(
        () =>
          new Promise((resolve) => {
            pending.push((names) => resolve(drivesOf(...names)));
          }),
      );
      return pending;
    }

    async function closeEmpty() {
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    }

    it("does not decide the next header opening's drive", async () => {
      const pending = deferredDriveLists();
      renderWithOpener();
      await openFromHeader();
      await closeEmpty();
      driveState.current = "notes";
      await openFromHeader();

      await act(async () => pending[0]!(["photos"]));
      await act(async () => pending[1]!(["photos", "notes"]));
      expect(screen.getByRole("button", { name: /Destination/ })).toHaveTextContent(
        "notes / Inbox",
      );
    });

    it("does not stop the next opening preselecting its requested drive", async () => {
      const pending = deferredDriveLists();
      renderWithOpener({ drive: "notes", folder: "Projects" });
      await openFromHeader();
      await closeEmpty();
      await openFromPage();

      await act(async () => pending[0]!(["photos"]));
      await act(async () => pending[1]!(["photos", "notes"]));
      expect(screen.getByRole("button", { name: /Destination/ })).toHaveTextContent(
        "notes / Projects",
      );
    });

    it("does not replace the next opening's destination when it lands last", async () => {
      const pending = deferredDriveLists();
      renderWithOpener({ drive: "notes", folder: "Projects" });
      await openFromHeader();
      await closeEmpty();
      await openFromPage();

      await act(async () => pending[1]!(["photos", "notes"]));
      await act(async () => pending[0]!(["photos"]));
      expect(screen.getByRole("button", { name: /Destination/ })).toHaveTextContent(
        "notes / Projects",
      );
    });

    it("does not mark the next opening's list as failed or loaded", async () => {
      const pending: Array<{ resolve: (v: unknown) => void; reject: (e: unknown) => void }> = [];
      mockGetDrives.mockImplementation(
        () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
      );
      renderWithOpener();
      await openFromHeader();
      await closeEmpty();
      await openFromHeader();
      typeBody("waiting for the list");

      await act(async () => pending[0]!.reject(new Error("API error: 500 boom")));
      expect(screen.queryByText("Could not load drives.")).not.toBeInTheDocument();
      expect(saveButton()).toBeDisabled();

      await act(async () => pending[1]!.resolve(drivesOf("photos")));
      expect(saveButton()).toBeEnabled();
    });
  });

  it("returns focus to the control that opened it", async () => {
    renderWithOpener({ drive: "photos" });
    const opener = screen.getByRole("button", { name: "open-from-page" });
    opener.focus();
    await openFromPage();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("does nothing outside a provider", () => {
    render(<Opener />);
    expect(() =>
      fireEvent.click(screen.getByRole("button", { name: "open-from-page" })),
    ).not.toThrow();
  });
});
