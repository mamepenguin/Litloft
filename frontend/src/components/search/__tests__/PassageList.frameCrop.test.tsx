import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { PassageList } from "../PassageList";
import type { FileItem } from "@/types";

vi.mock("@/components/FileTypeIcon", () => ({
  FileTypeIcon: ({ fileType }: { fileType: string }) => (
    <span data-testid={`icon-${fileType}`} />
  ),
}));

const LINE_BOX = [0.1, 0.4, 0.7, 0.4, 0.7, 0.46, 0.1, 0.46];

interface Passage {
  kind: "screen_text" | "utterance";
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
  line_box?: unknown;
  line_match?: unknown;
  line_frame_url?: string | null;
}

function file(id: string): FileItem {
  return {
    id,
    filename: `${id}.mp4`,
    title: id,
    description: "",
    drive: "main",
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: `/api/files/${id}/thumbnail`,
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
    modified_at: null,
  };
}

const small = (id: string) => `/api/addons/intelligence/files/${id}/frame?t=12`;
const large = (id: string) => `/api/addons/intelligence/files/${id}/frame?t=12.480&size=large`;

function croppable(id: string, overrides: Partial<Passage> = {}): Passage {
  return {
    kind: "screen_text",
    start: 12.48,
    end: 20,
    page: null,
    section: null,
    section_title: null,
    chunk_index: 0,
    text: "warehouse moved to Osaka",
    score: 0.8,
    keyword: true,
    highlight_terms: ["moved"],
    frame_url: small(id),
    line_box: LINE_BOX,
    line_match: [0.4167, 0.625],
    line_frame_url: large(id),
    ...overrides,
  };
}

function groupOf(id: string, passage: Passage) {
  return {
    fileId: id,
    filename: `${id}.mp4`,
    fileType: "video",
    file: file(id),
    bestScore: 0.8,
    passages: [passage],
  };
}

function renderRows(rows: [string, Passage][]) {
  const groups = rows.map(([id, passage]) => groupOf(id, passage));
  return render(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <PassageList state="listed" groups={groups as any} filesCount={groups.length} />,
  );
}

function bySrc(container: HTMLElement, src: string): HTMLElement | null {
  return (
    Array.from(container.querySelectorAll<HTMLElement>("[src]")).find(
      (el) => el.getAttribute("src") === src,
    ) ?? null
  );
}

function loadWithSize(el: HTMLElement | null, width: number, height: number) {
  if (!el) throw new Error("the large frame is not requested");
  Object.defineProperty(el, "naturalWidth", { configurable: true, value: width });
  Object.defineProperty(el, "naturalHeight", { configurable: true, value: height });
  fireEvent.load(el);
}

function rowLink(id: string): HTMLElement {
  const link = screen
    .getAllByRole("link")
    .find((a) => a.getAttribute("href")?.startsWith(`/files/${id}?`));
  if (!link) throw new Error(`no row for ${id}`);
  return link;
}

describe("SPEC-CORE-134 I4 the slot of a croppable passage goes from the whole frame to the crop", () => {
  it("shows the small frame, asks for the large one lazily, and drops the small one once the large has a size", () => {
    const { container } = renderRows([["a", croppable("a")]]);

    expect(bySrc(container, small("a"))).not.toBeNull();
    const big = bySrc(container, large("a"));
    expect(big).not.toBeNull();
    expect(big).toHaveAttribute("loading", "lazy");
    expect(rowLink("a")).toHaveTextContent("0:12");

    loadWithSize(big, 1280, 720);

    expect(bySrc(container, small("a"))).toBeNull();
    expect(bySrc(container, "/api/files/a/thumbnail")).toBeNull();
    expect(screen.queryByTestId("icon-video")).toBeNull();
    expect(rowLink("a")).toHaveTextContent("0:12");
    expect(rowLink("a")).toHaveTextContent("warehouse moved to Osaka");
  });

  it("goes to the crop at once when the large frame loads before the small one", () => {
    const { container } = renderRows([["a", croppable("a")]]);

    loadWithSize(bySrc(container, large("a")), 1280, 720);

    expect(bySrc(container, small("a"))).toBeNull();
  });

  it("keeps the whole frame when the large frame fails or has no size, beside a row that crops", () => {
    const { container } = renderRows([
      ["ok", croppable("ok")],
      ["failed", croppable("failed")],
      ["zerow", croppable("zerow")],
      ["zeroh", croppable("zeroh")],
    ]);

    loadWithSize(bySrc(container, large("ok")), 1280, 720);
    fireEvent.error(bySrc(container, large("failed"))!);
    loadWithSize(bySrc(container, large("zerow")), 0, 720);
    loadWithSize(bySrc(container, large("zeroh")), 1280, 0);

    expect(bySrc(container, small("ok"))).toBeNull();
    for (const id of ["failed", "zerow", "zeroh"]) {
      expect(bySrc(container, small(id))).not.toBeNull();
      expect(rowLink(id)).toHaveTextContent("0:12");
    }
  });

  it("falls to the thumbnail when the small frame fails first, and never crops after", () => {
    const { container } = renderRows([["a", croppable("a")]]);
    const big = bySrc(container, large("a"));
    expect(big).not.toBeNull();

    fireEvent.error(bySrc(container, small("a"))!);
    expect(bySrc(container, "/api/files/a/thumbnail")).not.toBeNull();

    const stillLoading = bySrc(container, large("a"));
    if (stillLoading) loadWithSize(stillLoading, 1280, 720);

    expect(bySrc(container, "/api/files/a/thumbnail")).not.toBeNull();
    fireEvent.error(bySrc(container, "/api/files/a/thumbnail")!);
    expect(screen.getByTestId("icon-video")).toBeInTheDocument();
  });
});

describe("SPEC-CORE-134 step 10 only a croppable passage asks for the large frame", () => {
  it.each([
    ["a box of seven numbers", { line_box: LINE_BOX.slice(0, 7) }],
    ["a box with a non-number", { line_box: [...LINE_BOX.slice(0, 7), "0.46"] }],
    ["a match running backwards", { line_match: [0.6, 0.4] }],
    ["a match past the line's end", { line_match: [0.4, 1.2] }],
    ["a match below zero", { line_match: [-0.1, 0.4] }],
    ["a match of one number", { line_match: [0.4] }],
    ["no large frame", { line_frame_url: null }],
    ["no small frame", { frame_url: null }],
  ] as [string, Partial<Passage>][])("%s keeps the row as it is today", (_name, broken) => {
    const { container } = renderRows([
      ["good", croppable("good")],
      ["bad", croppable("bad", broken)],
    ]);

    expect(bySrc(container, large("good"))).not.toBeNull();
    expect(bySrc(container, large("bad"))).toBeNull();
  });

  it("crops at the edges of the match range, 0 and 1, and with an empty match", () => {
    const { container } = renderRows([
      ["whole", croppable("whole", { line_match: [0, 1] })],
      ["empty", croppable("empty", { line_match: [0.5, 0.5] })],
    ]);

    expect(bySrc(container, large("whole"))).not.toBeNull();
    expect(bySrc(container, large("empty"))).not.toBeNull();
  });
});
