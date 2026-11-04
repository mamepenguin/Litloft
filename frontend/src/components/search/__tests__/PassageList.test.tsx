import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { PassageList } from "../PassageList";
import type { FileItem } from "@/types";

vi.mock("@/components/FileTypeIcon", () => ({
  FileTypeIcon: ({ fileType }: { fileType: string }) => (
    <span data-testid={`icon-${fileType}`} />
  ),
}));

/**
 * One entry of a hit's `passages` and one file's group, written here rather
 * than imported so a test can build them without depending on where core
 * declares them.
 */
interface Passage {
  kind: "utterance" | "scene" | "page" | "section" | "picture_text" | "text";
  start: number | null;
  end: number | null;
  page: number | null;
  section: number | null;
  section_title: string | null;
  chunk_index: number | null;
  text: string;
  score: number;
  keyword: boolean;
  highlight_terms: string[];
  frame_url: string | null;
}

interface PassageGroup {
  fileId: string;
  filename: string;
  fileType: string;
  file: FileItem | null;
  bestScore: number;
  passages: Passage[];
}

function file(overrides: Partial<FileItem> = {}): FileItem {
  return {
    id: "f1",
    filename: "lecture.mp4",
    title: "lecture",
    description: "",
    drive: "main",
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: "/api/files/f1/thumbnail",
    has_thumbnail: true,
    file_size: 0,
    duration: 600,
    image_width: null,
    image_height: null,
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
  };
}

function passage(overrides: Partial<Passage> = {}): Passage {
  return {
    kind: "text",
    start: null,
    end: null,
    page: null,
    section: null,
    section_title: null,
    chunk_index: null,
    text: "",
    score: 0.5,
    keyword: false,
    highlight_terms: [],
    frame_url: null,
    ...overrides,
  };
}

function group(overrides: Partial<PassageGroup> = {}): PassageGroup {
  return {
    fileId: "f1",
    filename: "lecture.mp4",
    fileType: "video",
    file: file(),
    bestScore: 0.5,
    passages: [passage({ text: "the warehouse moved", kind: "utterance", start: 120, end: 150 })],
    ...overrides,
  };
}

const listed = (groups: PassageGroup[], extra: Record<string, unknown> = {}) => (
  <PassageList state="listed" groups={groups} filesCount={1} {...extra} />
);

describe("SPEC-CORE-040 I23 the locator, excerpt and link of each kind", () => {
  const rows: Array<[string, Passage, string, string]> = [
    [
      "an utterance",
      passage({ kind: "utterance", start: 120, end: 150, text: "the warehouse moved" }),
      "/files/f1?t=120",
      "2:00",
    ],
    [
      "a page",
      passage({ kind: "page", page: 7, text: "budget appendix" }),
      "/files/f1?page=7",
      "p.7",
    ],
    [
      "a titled section",
      passage({ kind: "section", section: 3, section_title: "予算", text: "revenue grew" }),
      "/files/f1?section=3",
      "予算",
    ],
    [
      "an untitled section",
      passage({ kind: "section", section: 3, section_title: null, text: "revenue grew" }),
      "/files/f1?section=3",
      "Section 3",
    ],
    [
      "picture text",
      passage({ kind: "picture_text", text: "営業時間" }),
      "/files/f1",
      "Text in picture",
    ],
    ["plain text", passage({ kind: "text", text: "the appendix" }), "/files/f1", "Text"],
  ];

  it.each(rows)("shows the place, the file and the excerpt for %s", (_name, p, href, locator) => {
    render(listed([group({ passages: [p] })]));

    const link = screen.getByRole("link", { name: new RegExp(locator) });
    expect(link).toHaveAttribute("href", href);
    expect(link).toHaveTextContent("lecture.mp4");
    expect(link).toHaveTextContent(p.text);
  });

  it("shows an utterance's start and end as its locator", () => {
    render(listed([group({ passages: [passage({ kind: "utterance", start: 120, end: 150 })] })]));

    expect(screen.getByRole("link", { name: /2:00\D+2:30/ })).toBeInTheDocument();
  });

  it("shows a scene's start time only, with the scene label in place of an excerpt", () => {
    render(
      listed([
        group({
          passages: [passage({ kind: "scene", start: 30, end: 60, text: "" })],
        }),
      ]),
    );

    const link = screen.getByRole("link", { name: /0:30/ });
    expect(link).toHaveAttribute("href", "/files/f1?t=30");
    expect(link).toHaveTextContent("Visual");
    expect(link).not.toHaveTextContent("1:00");
  });

  it("shows the file name in one truncated line carrying the full name", () => {
    render(listed([group({ filename: "a very long lecture recording.mp4" })]));

    const name = screen.getByText("a very long lecture recording.mp4");
    expect(name).toHaveAttribute("title", "a very long lecture recording.mp4");
    expect(name.className).toContain("truncate");
  });

  it("shows the excerpt in full", () => {
    const excerpt = "倉庫の移転費用について".repeat(20);
    render(listed([group({ passages: [passage({ kind: "text", text: excerpt })] })]));

    const node = screen.getByText(excerpt);
    expect(node.className).not.toContain("line-clamp");
  });
});

describe("SPEC-CORE-040 I10 the three rows a file shows and the rest", () => {
  const five = [1, 2, 3, 4, 5].map((n) => passage({ kind: "text", text: `place ${n}` }));

  it("shows the first three passages of a file", () => {
    render(listed([group({ passages: five })]));

    const groupList = screen.getByRole("list", { name: "Passages" });
    expect(screen.getByText("place 1")).toBeInTheDocument();
    expect(screen.getByText("place 3")).toBeInTheDocument();
    expect(screen.queryByText("place 4")).toBeNull();
    expect(groupList).toBeInTheDocument();
  });

  it("links to the rest of the file with no parameter", () => {
    render(listed([group({ passages: five })]));

    const more = screen.getByRole("link", { name: "More passages in lecture.mp4" });
    expect(more).toHaveAttribute("href", "/files/f1");
    expect(more).toHaveTextContent("More in this file");
  });

  it("offers the rest only when the file has more than three", () => {
    render(listed([group({ passages: five.slice(0, 3) })]));

    expect(screen.queryByRole("link", { name: /More passages in/ })).toBeNull();
  });

  it("lists each group under the row it starts with, in the order given", () => {
    render(
      listed([
        group({ fileId: "f2", filename: "first.mp4", passages: [passage({ text: "alpha" })] }),
        group({ fileId: "f1", filename: "second.mp4", passages: [passage({ text: "beta" })] }),
      ]),
    );

    const lists = screen.getAllByRole("list");
    const top = lists[0];
    const links = Array.from(top.querySelectorAll("a"));
    expect(links[0]).toHaveTextContent("first.mp4");
    expect(links[1]).toHaveTextContent("second.mp4");
  });
});

describe("SPEC-CORE-040 I12 marks belong to keyword passages only", () => {
  it("marks the highlighted terms of a keyword passage", () => {
    const { container } = render(
      listed([
        group({
          passages: [
            passage({
              kind: "text",
              text: "the warehouse moved to the Warehouse",
              keyword: true,
              highlight_terms: ["warehouse"],
            }),
          ],
        }),
      ]),
    );

    const marks = Array.from(container.querySelectorAll("mark"));
    expect(marks.map((m) => m.textContent)).toEqual(["warehouse", "Warehouse"]);
    expect(marks[0].className).toContain("bg-highlight-bg");
  });

  it("marks nothing in a passage whose keyword is false", () => {
    const { container } = render(
      listed([
        group({
          passages: [
            passage({
              kind: "text",
              text: "the warehouse moved",
              keyword: false,
              highlight_terms: [],
            }),
          ],
        }),
      ]),
    );

    expect(container.querySelectorAll("mark")).toHaveLength(0);
  });

  it("nests no mark inside another", () => {
    const { container } = render(
      listed([
        group({
          passages: [
            passage({
              kind: "text",
              text: "倉庫の移転",
              keyword: true,
              highlight_terms: ["倉庫", "庫の"],
            }),
          ],
        }),
      ]),
    );

    const marks = Array.from(container.querySelectorAll("mark"));
    expect(marks).toHaveLength(1);
    expect(marks[0].querySelectorAll("mark")).toHaveLength(0);
  });
});

describe("SPEC-CORE-040 I18 the picture of a row", () => {
  it("shows the frame with its start time over it", () => {
    const { container } = render(
      listed([
        group({
          passages: [
            passage({
              kind: "utterance",
              start: 120,
              end: 150,
              frame_url: "/api/addons/intelligence/files/f1/frame?t=120",
            }),
          ],
        }),
      ]),
    );

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("src", "/api/addons/intelligence/files/f1/frame?t=120");
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(screen.getByText("2:00")).toBeInTheDocument();
  });

  it("shows the file's thumbnail for a passage with no frame", () => {
    const { container } = render(listed([group()]));

    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "/api/files/f1/thumbnail",
    );
  });

  it("falls back to the thumbnail route for a hit that was not hydrated", () => {
    const { container } = render(listed([group({ file: null })]));

    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "/api/files/f1/thumbnail",
    );
  });

  it("shows the file-type icon when the file has no thumbnail", () => {
    const { container } = render(
      listed([group({ file: file({ has_thumbnail: false }) })]),
    );

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByTestId("icon-video")).toBeInTheDocument();
  });

  it("falls back from a failed frame to the thumbnail, then to the icon", () => {
    const { container } = render(
      listed([
        group({
          passages: [
            passage({
              kind: "utterance",
              start: 120,
              end: 150,
              frame_url: "/api/addons/intelligence/files/f1/frame?t=120",
            }),
          ],
        }),
      ]),
    );

    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "/api/files/f1/thumbnail",
    );

    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByTestId("icon-video")).toBeInTheDocument();
    expect(screen.getByText("the warehouse moved")).toBeInTheDocument();
  });
});

describe("SPEC-CORE-040 the states of the passage list", () => {
  it("shows three skeleton rows while loading", () => {
    const { container } = render(
      <PassageList state="loading" groups={[]} filesCount={0} />,
    );

    expect(screen.getAllByTestId("passage-skeleton-row")).toHaveLength(3);
    expect(container.querySelectorAll("a")).toHaveLength(0);
  });

  it("offers a retry that runs the search again when it failed, and says so as an alert", () => {
    const onRetry = vi.fn();
    render(<PassageList state="failed" groups={[]} filesCount={3} onRetry={onRetry} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load passages");
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows the no-results empty state", () => {
    render(<PassageList state="empty" groups={[]} filesCount={0} />);

    expect(screen.getByText("No matching files found")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /More passages in/ })).toBeNull();
  });

  it("offers the Files view while Files has at least one row", () => {
    const onShowFiles = vi.fn();
    render(
      <PassageList
        state="empty"
        groups={[]}
        filesCount={2}
        onShowFiles={onShowFiles}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show files" }));
    expect(onShowFiles).toHaveBeenCalledTimes(1);
  });

  it("offers no Files view when Files has no rows", () => {
    render(
      <PassageList state="empty" groups={[]} filesCount={0} onShowFiles={vi.fn()} />,
    );

    expect(screen.queryByRole("button", { name: "Show files" })).toBeNull();
  });

  it("offers to clear the filter while one is set", () => {
    const onClearFilter = vi.fn();
    render(
      <PassageList
        state="empty"
        groups={[]}
        filesCount={2}
        onClearFilter={onClearFilter}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onClearFilter).toHaveBeenCalledTimes(1);
  });
});
