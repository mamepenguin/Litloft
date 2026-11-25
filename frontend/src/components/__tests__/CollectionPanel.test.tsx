import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { CollectionPanel } from "../CollectionPanel";
import type { FileItem } from "@/types";

function makeTrackFile(id: string, type: "audio" | "video" = "audio"): FileItem {
  return {
    image_width: null,
    image_height: null,
    id,
    filename: `${id}.mp3`,
    title: `Track ${id}`,
    description: "",
    drive: "main",
    folder_path: "music",
    file_type: type,
    mime_type: type === "audio" ? "audio/mp3" : "video/mp4",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 1000,
    duration: 180,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier: "verified",
    trust_reviewed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    modified_at: null,
  };
}

vi.mock("@/lib/api", () => ({
  getCollection: vi.fn(),
  getDriveFiles: vi.fn(),
  removeCollectionItem: vi.fn().mockResolvedValue(undefined),
  reorderCollectionItems: vi.fn().mockResolvedValue({}),
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
}));

vi.mock("@/lib/format", () => ({
  formatDuration: (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`,
}));

import { getCollection, getDriveFiles } from "@/lib/api";

// jsdom does not implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

describe("CollectionPanel", () => {
  const onNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // The loop toggle persists to `localStorage["collection-loop"]`, and
    // "toggles loop state" below turns it off.
    localStorage.clear();

    vi.mocked(getCollection).mockResolvedValue({
      id: "c1",
      name: "Test Collection",
      description: null,
      drive: "main",
      items: [
        { id: 1, position: 0, file: makeTrackFile("f1") },
        { id: 2, position: 1, file: makeTrackFile("f2") },
        { id: 3, position: 2, file: makeTrackFile("f3") },
      ],
      created_at: "",
      updated_at: "",
    });

    vi.mocked(getDriveFiles).mockResolvedValue({
      data: [makeTrackFile("f1"), makeTrackFile("f2")],
      meta: { total: 2, page: 1, limit: 500 },
    });
  });

  it("loads and displays user collection tracks", async () => {
    render(
      <CollectionPanel
        collectionId="c1"
        currentFileId="f1"
        currentFileType="audio"
        drive="main"
        folderPath="music"
        onNavigate={onNavigate}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Test Collection")).toBeInTheDocument();
    });
    expect(screen.getByText("1/3 tracks")).toBeInTheDocument();
    expect(screen.getByText("Track f1")).toBeInTheDocument();
    expect(screen.getByText("Track f2")).toBeInTheDocument();
    expect(screen.getByText("Track f3")).toBeInTheDocument();
  });

  it("highlights current track index", async () => {
    render(
      <CollectionPanel
        collectionId="c1"
        currentFileId="f2"
        currentFileType="audio"
        drive="main"
        folderPath="music"
        onNavigate={onNavigate}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("2/3 tracks")).toBeInTheDocument();
    });
  });

  it("navigates to track on click", async () => {
    render(
      <CollectionPanel
        collectionId="c1"
        currentFileId="f1"
        currentFileType="audio"
        drive="main"
        folderPath="music"
        onNavigate={onNavigate}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Track f2")).toBeInTheDocument();
    });

    const trackButtons = screen.getAllByRole("button");
    const f2Button = trackButtons.find((b) => b.textContent?.includes("Track f2"));
    if (f2Button) fireEvent.click(f2Button);
    expect(onNavigate).toHaveBeenCalledWith("f2");
  });

  it("renders loop toggle button", async () => {
    render(
      <CollectionPanel
        collectionId="c1"
        currentFileId="f1"
        currentFileType="audio"
        drive="main"
        folderPath="music"
        onNavigate={onNavigate}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Loop ON")).toBeInTheDocument();
    });
  });

  it("toggles loop state", async () => {
    render(
      <CollectionPanel
        collectionId="c1"
        currentFileId="f1"
        currentFileType="audio"
        drive="main"
        folderPath="music"
        onNavigate={onNavigate}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Loop ON")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Loop ON"));
    expect(screen.getByLabelText("Loop OFF")).toBeInTheDocument();
  });

  it("shows duration for tracks", async () => {
    render(
      <CollectionPanel
        collectionId="c1"
        currentFileId="f1"
        currentFileType="audio"
        drive="main"
        folderPath="music"
        onNavigate={onNavigate}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText("3:00")).toHaveLength(3);
    });
  });

  it("loads folder queue when folderPlay is true", async () => {
    render(
      <CollectionPanel
        folderPlay={true}
        currentFileId="f1"
        currentFileType="audio"
        drive="main"
        folderPath="music"
        onNavigate={onNavigate}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("music")).toBeInTheDocument();
    });
  });

  it("returns null when no tracks", () => {
    vi.mocked(getCollection).mockResolvedValueOnce({
      id: "c1",
      name: "Empty",
      description: null,
      drive: "main",
      items: [],
      created_at: "",
      updated_at: "",
    });

    const { container } = render(
      <CollectionPanel
        collectionId="empty"
        currentFileId="f1"
        currentFileType="audio"
        drive="main"
        folderPath=""
        onNavigate={onNavigate}
      />
    );

    expect(container.innerHTML).toBe("");
  });

  describe("SPEC-CORE-179 I5 the current-track scroll under reduced motion", () => {
    const realMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");

    function reduceMotion(reduced: boolean) {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        writable: true,
        value: (query: string) => ({
          matches: reduced && query.includes("prefers-reduced-motion: reduce"),
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }),
      });
    }

    function restoreMatchMedia() {
      if (realMatchMedia) Object.defineProperty(window, "matchMedia", realMatchMedia);
      else delete (window as Partial<Window>).matchMedia;
    }

    type Props = Parameters<typeof CollectionPanel>[0];

    /** Every scroll the panel makes while it loads on f1 and then moves to f3. */
    async function scrollsFor(reduced: boolean, props: Partial<Props>, ready: string) {
      reduceMotion(reduced);
      const scroll = vi.mocked(Element.prototype.scrollIntoView);
      scroll.mockClear();
      const base: Props = {
        currentFileId: "f1",
        currentFileType: "audio",
        drive: "main",
        folderPath: "music",
        onNavigate,
        ...props,
      } as Props;
      try {
        const view = render(<CollectionPanel {...base} />);
        await waitFor(() => expect(screen.getByText(ready)).toBeInTheDocument());
        view.rerender(<CollectionPanel {...base} currentFileId="f2" />);
        await waitFor(() => expect(screen.getAllByText("Track f2").length).toBeGreaterThan(0));
        const calls = scroll.mock.calls.map((args) => args[0]);
        view.unmount();
        return calls;
      } finally {
        restoreMatchMedia();
      }
    }

    it.each<[string, Partial<Props>, string]>([
      ["a collection", { collectionId: "c1" }, "Test Collection"],
      ["a folder queue", { folderPlay: true }, "music"],
    ])(
      "SPEC-CORE-179 I5 jumps instead of gliding in %s, to the same place",
      async (_name, props, ready) => {
        const glide = await scrollsFor(false, props, ready);
        expect(glide.length).toBeGreaterThan(0);
        for (const options of glide) {
          expect(options).toMatchObject({ behavior: "smooth" });
        }

        const jump = await scrollsFor(true, props, ready);
        expect(jump).toEqual(
          glide.map((options) => ({ ...(options as object), behavior: "auto" })),
        );
      },
    );
  });
});
