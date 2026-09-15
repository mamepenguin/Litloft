import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

import type { FileRelationItem, RelatedFileSummary } from "@/lib/api";
import { RelatedPanel } from "../RelatedPanel";

vi.mock("../../../AddonSlot", () => ({
  AddonSlot: ({ id, props }: { id: string; props?: Record<string, unknown> }) => (
    <div data-testid={`addon-slot-${id}`} data-file-id={String(props?.fileId)} />
  ),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

let nextId = 1;

function summary(id: string, over: Partial<RelatedFileSummary> = {}): RelatedFileSummary {
  return {
    id,
    drive: "main",
    filename: `${id}.md`,
    title: `Title ${id}`,
    folder_path: "Knowledge/AI",
    file_type: "document",
    mime_type: "text/markdown",
    thumbnail_url: `/api/files/${id}/thumbnail`,
    has_thumbnail: false,
    file_size: 1,
    duration: null,
    missing_since: null,
    created_at: "2026-09-15T00:00:00Z",
    updated_at: "2026-09-15T00:00:00Z",
    ...over,
  };
}

function rel(
  file: RelatedFileSummary,
  direction: FileRelationItem["direction"],
  origin: FileRelationItem["origin"],
): FileRelationItem {
  return {
    relation_id: nextId++,
    kind: "related",
    direction,
    origin,
    created_at: "2026-09-15T00:00:00Z",
    created_by: null,
    file,
  };
}

const LINKS_FROM = "Links from this file";
const LINKS_TO = "Links to this file";
const RELATED = "Related files";

function section(label: string): HTMLElement {
  return screen.getByRole("heading", { name: new RegExp(`^${label}`) })
    .parentElement as HTMLElement;
}

function titlesIn(label: string): string[] {
  return within(section(label))
    .getAllByRole("link")
    .map((a) => a.querySelector("[data-related-title]")!.textContent!);
}

describe("RelatedPanel", () => {
  beforeEach(() => {
    nextId = 1;
  });

  it("draws the three sections in order with their counts", () => {
    render(
      <RelatedPanel
        relations={[
          rel(summary("r1"), "outgoing", "internal"),
          rel(summary("to1"), "incoming", "markdown"),
          rel(summary("from1"), "outgoing", "markdown"),
          rel(summary("from2"), "outgoing", "markdown"),
        ]}
        addonSlotProps={{ fileId: "f1" }}
      />,
    );

    const headings = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(headings).toEqual([`${LINKS_FROM}2`, `${LINKS_TO}1`, `${RELATED}1`]);
    expect(titlesIn(LINKS_FROM)).toEqual(["Title from1", "Title from2"]);
    expect(titlesIn(LINKS_TO)).toEqual(["Title to1"]);
    expect(titlesIn(RELATED)).toEqual(["Title r1"]);
  });

  it("omits a section with nothing in it", () => {
    render(
      <RelatedPanel
        relations={[rel(summary("to1"), "incoming", "markdown")]}
        addonSlotProps={{}}
      />,
    );

    expect(screen.getAllByRole("heading").map((h) => h.textContent)).toEqual([
      `${LINKS_TO}1`,
    ]);
  });

  it("draws the addon slot after the sections, with the file's slot props", () => {
    const { container } = render(
      <RelatedPanel
        relations={[rel(summary("from1"), "outgoing", "markdown")]}
        addonSlotProps={{ fileId: "f1" }}
      />,
    );

    const slot = screen.getByTestId("addon-slot-file-relations");
    expect(slot).toHaveAttribute("data-file-id", "f1");
    const order = Array.from(container.querySelectorAll("h3, [data-testid]"));
    expect(order.indexOf(slot)).toBe(order.length - 1);
  });

  it("still draws the addon slot when there are no relations", () => {
    render(<RelatedPanel relations={[]} addonSlotProps={{}} />);

    expect(screen.queryAllByRole("heading")).toEqual([]);
    expect(screen.getByTestId("addon-slot-file-relations")).toBeInTheDocument();
  });

  it("links every row to the counterpart's canonical file URL", () => {
    render(
      <RelatedPanel
        relations={[
          rel(summary("from1", { folder_path: "Knowledge/AI" }), "outgoing", "markdown"),
          rel(summary("r1", { folder_path: "" }), "incoming", null),
        ]}
        addonSlotProps={{}}
      />,
    );

    expect(within(section(LINKS_FROM)).getByRole("link")).toHaveAttribute(
      "href",
      "/drive/main/Knowledge/AI?file=from1",
    );
    expect(within(section(RELATED)).getByRole("link")).toHaveAttribute(
      "href",
      "/drive/main?file=r1",
    );
  });

  it("names the drive root when the counterpart has no folder", () => {
    render(
      <RelatedPanel
        relations={[rel(summary("r1", { folder_path: "" }), "outgoing", "internal")]}
        addonSlotProps={{}}
      />,
    );

    expect(within(section(RELATED)).getByText("Drive root")).toBeInTheDocument();
  });

  it("falls back to the filename when a counterpart has no title", () => {
    render(
      <RelatedPanel
        relations={[rel(summary("r1", { title: "" }), "outgoing", "internal")]}
        addonSlotProps={{}}
      />,
    );

    expect(titlesIn(RELATED)).toEqual(["r1.md"]);
  });

  it("marks a missing counterpart and quiets its row", () => {
    render(
      <RelatedPanel
        relations={[
          rel(summary("gone", { missing_since: "2026-09-01T00:00:00Z" }), "outgoing", "markdown"),
          rel(summary("here"), "outgoing", "markdown"),
        ]}
        addonSlotProps={{}}
      />,
    );

    const [gone, here] = within(section(LINKS_FROM)).getAllByRole("link");
    expect(within(gone).getByText("missing")).toBeInTheDocument();
    expect(gone.classList.contains("opacity-60")).toBe(true);
    expect(within(here).queryByText("missing")).toBeNull();
    expect(here.classList.contains("opacity-60")).toBe(false);
  });

  it("gives media with a thumbnail a thumbnail, and a duration only when it has a length", () => {
    render(
      <RelatedPanel
        relations={[
          rel(
            summary("vid", { file_type: "video", mime_type: "video/mp4", has_thumbnail: true, duration: 1935 }),
            "outgoing",
            "internal",
          ),
          rel(
            summary("img", { file_type: "image", mime_type: "image/jpeg", has_thumbnail: true }),
            "outgoing",
            "internal",
          ),
          rel(
            summary("vid-nothumb", { file_type: "video", mime_type: "video/mp4", duration: 60 }),
            "outgoing",
            "internal",
          ),
          rel(summary("note", { has_thumbnail: true }), "outgoing", "internal"),
        ]}
        addonSlotProps={{}}
      />,
    );

    const [vid, img, vidNoThumb, note] = within(section(RELATED)).getAllByRole("link");
    expect(vid.querySelector("img")).toHaveAttribute("src", "/api/files/vid/thumbnail");
    expect(within(vid).getByText("32:15")).toBeInTheDocument();
    expect(img.querySelector("img")).toHaveAttribute("src", "/api/files/img/thumbnail");
    expect(img.querySelector("[data-related-duration]")).toBeNull();
    expect(vidNoThumb.querySelector("img")).toBeNull();
    expect(vidNoThumb.querySelector("svg")).not.toBeNull();
    expect(note.querySelector("img")).toBeNull();
    expect(note.querySelector("svg")).not.toBeNull();
  });
});
