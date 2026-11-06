import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
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
        () => cb([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver),
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
    (id: string, path: string) => `/api/files/${id}/archive/entry?path=${encodeURIComponent(path)}`,
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
const readme: ArchiveEntry = {
  path: "readme.txt",
  filename: "readme.txt",
  file_size: 10,
  compressed_size: 10,
  file_type: "document",
  mime_type: "text/plain",
  is_dir: false,
};
function archive(entries: ArchiveEntry[]): ArchiveContents {
  return { entries, total_entries: entries.length, total_size: 0 };
}

// Ordinals by folder path: cover=1, chapter1/001=2, chapter1/002=3,
// chapter10/a=4, chapter2/001=5. Entry order is deliberately scrambled.
const BOOK = archive([
  image("chapter2/001.jpg"),
  dir("chapter2"),
  readme,
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

async function openAt(folder: string, filename: string, byAlt = folder !== "") {
  if (folder) mockSearchParams.set("archivePath", folder);
  const view = render(ui());
  const target =
    byAlt
      ? await screen.findByAltText(filename)
      : await screen.findByText(filename);
  fireEvent.click(target);
  await screen.findByRole("dialog");
  return view;
}

async function elapse(ms = 1000) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

const resumeButton = (label: string) => screen.queryByRole("button", { name: label });

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

describe("SPEC-CORE-049 recording", () => {
  it.each([
    ["", "cover.jpg", null],
    ["chapter1", "001.jpg", 2],
    ["chapter1", "002.jpg", 3],
    ["chapter10", "a.jpg", 4],
    ["chapter2", "001.jpg", 5],
  ])(
    "showing %j/%s records ordinal %s",
    async (folder, filename, ordinal) => {
      await openAt(folder, filename);
      vi.useFakeTimers();
      await elapse(5000);

      if (ordinal === null) {
        expect(saveWatchProgress).not.toHaveBeenCalled();
      } else {
        expect(saveWatchProgress).toHaveBeenCalledTimes(1);
        expect(saveWatchProgress).toHaveBeenCalledWith(FILE, ordinal, N);
      }
    },
  );

  it("sends the save one second after the viewer shows a different image", async () => {
    await openAt("chapter1", "001.jpg");
    vi.useFakeTimers();
    await elapse(5000);
    vi.mocked(saveWatchProgress).mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    await elapse(999);
    expect(saveWatchProgress).not.toHaveBeenCalled();
    await elapse(1);

    expect(saveWatchProgress).toHaveBeenCalledTimes(1);
    expect(saveWatchProgress).toHaveBeenCalledWith(FILE, 3, N);
  });

  it("sends only the last image of a quick flip", async () => {
    await openAt("chapter1", "001.jpg");
    vi.useFakeTimers();
    await elapse(5000);
    vi.mocked(saveWatchProgress).mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    await elapse(300);
    fireEvent.click(screen.getByRole("button", { name: "Previous image" }));
    await elapse(300);
    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    await elapse(1000);

    expect(saveWatchProgress).toHaveBeenCalledTimes(1);
    expect(saveWatchProgress).toHaveBeenCalledWith(FILE, 3, N);
  });

  it("sends a pending save at once when the viewer closes", async () => {
    await openAt("chapter1", "001.jpg");
    vi.useFakeTimers();
    await elapse(5000);
    vi.mocked(saveWatchProgress).mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(saveWatchProgress).toHaveBeenCalledWith(FILE, 3, N);
  });

  it("sends a pending save at once when the page is left", async () => {
    const view = await openAt("chapter1", "001.jpg");
    vi.useFakeTimers();
    await elapse(5000);
    vi.mocked(saveWatchProgress).mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    view.unmount();

    expect(saveWatchProgress).toHaveBeenCalledWith(FILE, 3, N);
  });

  it("writes nothing for an archive with one image", async () => {
    vi.mocked(getArchiveContents).mockResolvedValue(archive([image("only.jpg")]));
    await openAt("", "only.jpg", true);
    vi.useFakeTimers();
    await elapse(5000);

    expect(saveWatchProgress).not.toHaveBeenCalled();
  });

  it("records the second of two images as 2 of 2", async () => {
    vi.mocked(getArchiveContents).mockResolvedValue(
      archive([image("a.jpg"), image("b.jpg")]),
    );
    await openAt("", "a.jpg", true);
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    await elapse(1000);

    expect(saveWatchProgress).toHaveBeenCalledWith(FILE, 2, 2);
  });

  it("ignores a failed save and leaves the viewer open", async () => {
    vi.mocked(saveWatchProgress).mockRejectedValue(new Error("down"));
    await openAt("chapter1", "001.jpg");
    vi.useFakeTimers();
    await elapse(1000);

    expect(saveWatchProgress).toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("records nothing and offers nothing when the index fails to load", async () => {
    stored(3);
    vi.mocked(getArchiveContents).mockRejectedValue(new Error("nope"));
    render(ui());
    await screen.findByText(/Failed to load archive/);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(saveWatchProgress).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Resume/ })).toBeNull();
  });
});

describe("SPEC-CORE-049 Resume button", () => {
  it("shows position / N above the listing without opening the viewer", async () => {
    stored(3);
    render(ui());

    expect(await screen.findByRole("button", { name: "Resume (3 / 5)" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each([
    [1, N, false],
    [2, N, true],
    [N - 1, N, true],
    [N, N, false],
    [3, N + 1, false],
    [3, N - 1, false],
    [0, 0, false],
  ])("stored %i of %i: shown is %s", async (position, duration, shown) => {
    stored(position, duration);
    render(ui());
    await screen.findByText("cover.jpg");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(!!resumeButton(`Resume (${position} / ${N})`)).toBe(shown);
  });

  it("shows nothing when the stored read fails", async () => {
    vi.mocked(getWatchProgress).mockRejectedValue(new Error("down"));
    render(ui());
    await screen.findByText("cover.jpg");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(screen.queryByRole("button", { name: /Resume/ })).toBeNull();
  });

  it("shows nothing for an archive with one image", async () => {
    stored(1, 1);
    vi.mocked(getArchiveContents).mockResolvedValue(archive([image("only.jpg")]));
    render(ui());
    await screen.findByText("only.jpg");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(screen.queryByRole("button", { name: /Resume/ })).toBeNull();
  });

  it.each([
    [2, "chapter1", "001.jpg"],
    [3, "chapter1", "002.jpg"],
    [4, "chapter10", "a.jpg"],
  ])(
    "pressing Resume at %i moves to %s and opens %s",
    async (position, folder, filename) => {
      stored(position);
      const view = render(ui());
      fireEvent.click(await screen.findByRole("button", { name: `Resume (${position} / ${N})` }));

      expect(mockPush).toHaveBeenCalledWith(`?archivePath=${folder}`);
      mockSearchParams.set("archivePath", folder);
      view.rerender(ui());

      const dialog = await screen.findByRole("dialog");
      expect(dialog.getAttribute("aria-label")).toContain(filename);
    },
  );

  it("is hidden while the viewer is open and returns after it closes", async () => {
    stored(3);
    render(ui());
    await screen.findByRole("button", { name: "Resume (3 / 5)" });

    fireEvent.click(screen.getByText("cover.jpg"));
    await screen.findByRole("dialog");
    expect(resumeButton("Resume (3 / 5)")).toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(await screen.findByRole("button", { name: "Resume (3 / 5)" })).toBeInTheDocument();
  });

  it("shows the ordinal saved during this visit once the viewer closes", async () => {
    stored(2);
    mockSearchParams.set("archivePath", "chapter1");
    render(ui());
    fireEvent.click(await screen.findByAltText("001.jpg"));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(await screen.findByRole("button", { name: "Resume (3 / 5)" })).toBeInTheDocument();
  });

  it("discards a stored position that is read after this visit saved one", async () => {
    let resolve!: (v: { position: number; duration: number }) => void;
    vi.mocked(getWatchProgress).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    mockSearchParams.set("archivePath", "chapter1");
    render(ui());
    fireEvent.click(await screen.findByAltText("001.jpg"));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    await act(async () => {
      resolve({ position: 2, duration: N });
    });
    fireEvent.keyDown(document, { key: "Escape" });

    expect(await screen.findByRole("button", { name: "Resume (3 / 5)" })).toBeInTheDocument();
    expect(resumeButton("Resume (2 / 5)")).toBeNull();
  });

  it("starts hidden for another file and judges it by its own position", async () => {
    vi.mocked(getWatchProgress).mockImplementation(async (id: string) =>
      id === FILE ? { position: 3, duration: N } : { position: 0, duration: 0 },
    );
    const view = render(ui());
    await screen.findByRole("button", { name: "Resume (3 / 5)" });

    view.rerender(ui("archive00002"));
    await screen.findByText("cover.jpg");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(screen.queryByRole("button", { name: /Resume/ })).toBeNull();
  });
});

describe("SPEC-CORE-049 without a nickname", () => {
  beforeEach(() => {
    profile(null);
    addRecentlyPlayed(FILE);
  });

  it("offers Resume from local storage and never asks the server", async () => {
    saveProgress(FILE, 3, N);
    render(ui());

    expect(await screen.findByRole("button", { name: "Resume (3 / 5)" })).toBeInTheDocument();
    expect(getWatchProgress).not.toHaveBeenCalled();
  });

  it("ignores a local entry whose duration is not N", async () => {
    saveProgress(FILE, 3, N + 1);
    render(ui());
    await screen.findByText("cover.jpg");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(screen.queryByRole("button", { name: /Resume/ })).toBeNull();
  });

  it("saves to local storage and sends no position request", async () => {
    await openAt("chapter1", "001.jpg");
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    await elapse(1000);

    expect(saveWatchProgress).not.toHaveBeenCalled();
    expect(getSavedPlayback(FILE)).toEqual({ position: 3, duration: N });
  });
});
