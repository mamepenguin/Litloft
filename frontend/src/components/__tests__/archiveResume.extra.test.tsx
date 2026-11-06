import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { ArchiveContents, ArchiveEntry } from "@/types";
import { ArchivePreview } from "../ArchivePreview";
import { ShortcutsProvider } from "../ShortcutsProvider";
import { useProfile } from "../ProfileProvider";
import {
  getArchiveContents,
  getWatchProgress,
  saveWatchProgress,
} from "@/lib/api";
import {
  addRecentlyPlayed,
  getSavedPlayback,
  saveProgress,
} from "@/lib/recentlyPlayed";

vi.stubGlobal(
  "IntersectionObserver",
  class {
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
    constructor(cb: IntersectionObserverCallback) {
      setTimeout(
        () =>
          cb(
            [{ isIntersecting: true } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          ),
        0,
      );
    }
  },
);

const mockPush = vi.fn();
const mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));
vi.mock("../ViewToggle", () => ({ ViewToggle: () => null }));
vi.mock("../ProfileProvider", () => ({ useProfile: vi.fn() }));
vi.mock("@/lib/api", () => ({
  getArchiveContents: vi.fn(),
  getArchiveEntryUrl: vi.fn(
    (id: string, path: string) =>
      `/api/files/${id}/archive/entry?path=${encodeURIComponent(path)}`,
  ),
  getDownloadUrl: vi.fn((id: string) => `/api/files/${id}/stream?download=true`),
  getWatchProgress: vi.fn(),
  saveWatchProgress: vi.fn(),
}));

function dir(path: string): ArchiveEntry {
  return {
    path: `${path}/`,
    filename: path,
    file_size: 0,
    compressed_size: 0,
    file_type: "other",
    mime_type: "",
    is_dir: true,
  };
}
function image(path: string): ArchiveEntry {
  return {
    path,
    filename: path.split("/").pop()!,
    file_size: 1000,
    compressed_size: 900,
    file_type: "image",
    mime_type: "image/jpeg",
    is_dir: false,
  };
}
function text(path: string): ArchiveEntry {
  return {
    path,
    filename: path.split("/").pop()!,
    file_size: 10,
    compressed_size: 10,
    file_type: "document",
    mime_type: "text/plain",
    is_dir: false,
  };
}
function archive(entries: ArchiveEntry[]): ArchiveContents {
  return { entries, total_entries: entries.length, total_size: 0 };
}

// Ordinals by folder path: cover=1, chapter1/001=2, chapter1/002=3,
// chapter10/a=4, chapter2/001=5. Entry order is deliberately scrambled.
const BOOK = archive([
  image("chapter2/001.jpg"),
  dir("chapter2"),
  text("readme.txt"),
  image("chapter10/a.jpg"),
  dir("chapter10"),
  image("chapter1/002.jpg"),
  image("chapter1/001.jpg"),
  dir("chapter1"),
  image("cover.jpg"),
]);
const N = 5;

const FILE = "archive00001";

function profile(nickname: string | null) {
  vi.mocked(useProfile).mockReturnValue({
    nickname,
    setNickname: vi.fn(),
    clearNickname: vi.fn(),
  });
}
function stored(position: number, duration = N) {
  vi.mocked(getWatchProgress).mockResolvedValue({ position, duration });
}

function ui(fileId = FILE): ReactNode {
  return (
    <ShortcutsProvider>
      <ArchivePreview fileId={fileId} />
    </ShortcutsProvider>
  );
}

const resumeButton = (label: string) =>
  screen.queryByRole("button", { name: label });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getArchiveContents).mockReset().mockResolvedValue(BOOK);
  vi.mocked(getWatchProgress).mockReset().mockResolvedValue({ position: 0, duration: 0 });
  vi.mocked(saveWatchProgress).mockReset().mockResolvedValue(undefined);
  mockSearchParams.delete("archivePath");
  profile("kaori");
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe("SPEC-CORE-049 Resume button inputs", () => {
  it("stays hidden while the stored position is still being read", async () => {
    let resolve!: (value: { position: number; duration: number }) => void;
    vi.mocked(getWatchProgress).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    render(ui());
    await screen.findByText("cover.jpg");

    expect(screen.queryByRole("button", { name: /Resume/ })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();

    await act(async () => {
      resolve({ position: 3, duration: N });
    });

    expect(
      await screen.findByRole("button", { name: "Resume (3 / 5)" }),
    ).toBeInTheDocument();
  });

  it("stays hidden until the index has loaded, then shows the stored position", async () => {
    let resolve!: (value: ArchiveContents) => void;
    vi.mocked(getArchiveContents).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    stored(3);
    render(ui());

    expect(screen.queryByRole("button", { name: /Resume/ })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();

    await act(async () => {
      resolve(BOOK);
    });

    expect(
      await screen.findByRole("button", { name: "Resume (3 / 5)" }),
    ).toBeInTheDocument();
  });

  it("re-reads from the profile when a nickname arrives and hides the local position meanwhile", async () => {
    profile(null);
    addRecentlyPlayed(FILE);
    saveProgress(FILE, 3, N);
    const view = render(ui());

    expect(
      await screen.findByRole("button", { name: "Resume (3 / 5)" }),
    ).toBeInTheDocument();
    expect(getWatchProgress).not.toHaveBeenCalled();

    let resolve!: (value: { position: number; duration: number }) => void;
    vi.mocked(getWatchProgress).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    profile("kaori");
    view.rerender(ui());

    expect(screen.queryByRole("button", { name: /Resume/ })).toBeNull();
    expect(getWatchProgress).toHaveBeenCalledWith(FILE);

    await act(async () => {
      resolve({ position: 4, duration: N });
    });

    expect(
      await screen.findByRole("button", { name: "Resume (4 / 5)" }),
    ).toBeInTheDocument();
    expect(resumeButton("Resume (3 / 5)")).toBeNull();
  });

  it("keeps another file's button hidden until its own position arrives", async () => {
    vi.mocked(getWatchProgress).mockImplementation(async (id: string) =>
      id === FILE ? { position: 3, duration: N } : { position: 0, duration: 0 },
    );
    const view = render(ui());
    await screen.findByRole("button", { name: "Resume (3 / 5)" });

    let resolve!: (value: { position: number; duration: number }) => void;
    vi.mocked(getWatchProgress).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    view.rerender(ui("archive00002"));
    await screen.findByText("cover.jpg");

    expect(screen.queryByRole("button", { name: /Resume/ })).toBeNull();

    await act(async () => {
      resolve({ position: 4, duration: N });
    });

    expect(
      await screen.findByRole("button", { name: "Resume (4 / 5)" }),
    ).toBeInTheDocument();
    expect(resumeButton("Resume (3 / 5)")).toBeNull();
  });
});

describe("SPEC-CORE-049 the listing does not decide the sequence", () => {
  it("opens the same image after the listing is sorted and filtered", async () => {
    stored(3);
    const view = render(ui());
    fireEvent.click(
      await screen.findByRole("button", { name: "Resume (3 / 5)" }),
    );
    expect(mockPush).toHaveBeenCalledWith("?archivePath=chapter1");

    mockSearchParams.set("archivePath", "chapter1");
    view.rerender(ui());
    const first = await screen.findByRole("dialog");
    expect(first.getAttribute("aria-label")).toContain("002.jpg");

    fireEvent.keyDown(document, { key: "Escape" });
    mockSearchParams.delete("archivePath");
    view.rerender(ui());
    await screen.findByText("readme.txt");

    fireEvent.click(screen.getByRole("button", { name: /^Sort/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Size largest" }));
    fireEvent.click(screen.getByRole("button", { name: /^File type/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Text" }));

    expect(screen.queryByText("cover.jpg")).toBeNull();
    mockPush.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Resume (3 / 5)" }));
    expect(mockPush).toHaveBeenCalledWith("?archivePath=chapter1");

    mockSearchParams.set("archivePath", "chapter1");
    view.rerender(ui());
    const second = await screen.findByRole("dialog");
    expect(second.getAttribute("aria-label")).toContain("002.jpg");
  });
});

describe("SPEC-CORE-049 a text entry is not a page", () => {
  const WITH_TEXT = archive([
    image("cover.jpg"),
    dir("chapter1"),
    image("chapter1/001.jpg"),
    text("chapter1/notes.txt"),
  ]);

  it("writes nothing for the text entry and still records the image", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(getArchiveContents).mockResolvedValue(WITH_TEXT);
    mockSearchParams.set("archivePath", "chapter1");
    render(ui());

    fireEvent.click(await screen.findByText("notes.txt"));
    await screen.findByTestId("text-viewer");
    expect(saveWatchProgress).not.toHaveBeenCalled();
    expect(getSavedPlayback(FILE)).toEqual({ position: 0, duration: 0 });

    fireEvent.click(screen.getByText("Back to list"));
    fireEvent.click(await screen.findByText("001.jpg"));
    await screen.findByRole("dialog");
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(saveWatchProgress).toHaveBeenCalledWith(FILE, 2, 2);
  });
});
