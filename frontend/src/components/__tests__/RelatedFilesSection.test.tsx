import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { RelatedFilesSection } from "../RelatedFilesSection";
import { RelatedGroup } from "../FileDetail/inspector/RelatedGroup";
import type { FileRelationsResponse } from "@/lib/api";

// Test setup (src/test/setup.ts) globally mocks next-intl to return the
// Japanese messages file, so assertions check the ja strings directly.
const TITLE = "Related files";
const MISSING_BADGE = "missing";

const getFileRelations = vi.fn<(id: string) => Promise<FileRelationsResponse>>();

vi.mock("@/lib/api", () => ({
  getFileRelations: (id: string) => getFileRelations(id),
}));

// `RelatedGroup` draws its heading only when an addon has published
// somewhere to group with, so the grouped case has to claim the slot.
// Asked of the catalogue and not of the DOM: a derived source may be a
// collapsed control that has computed nothing yet.
const fileRelationEntries = vi.fn(() => [] as unknown[]);
vi.mock("../AddonSlotsProvider", () => ({
  useAddonSlots: () => ({
    getSlotEntries: (slotId: string) =>
      slotId === "file-relations" ? fileRelationEntries() : [],
  }),
}));

function renderSection(fileId: string) {
  return render(<RelatedFilesSection fileId={fileId} />);
}

function fakeRelations(): FileRelationsResponse {
  return {
    relations: [
      {
        relation_id: 1,
        kind: "related",
        created_at: "2026-04-21T00:00:00Z",
        created_by: null,
        file: {
          id: "noteAAAAAAAA",
          drive: "test-drive",
          filename: "my-summary.md",
          folder_path: "AI-Drafts",
          file_type: "document",
          mime_type: "text/markdown",
          thumbnail_url: "/api/files/noteAAAAAAAA/thumbnail",
          has_thumbnail: false,
          file_size: 1234,
          missing_since: null,
          created_at: "2026-04-21T00:00:00Z",
          updated_at: "2026-04-21T00:00:00Z",
        },
      },
      {
        relation_id: 2,
        kind: "related",
        created_at: "2026-04-21T00:00:00Z",
        created_by: null,
        file: {
          id: "vidBBBBBBBBB",
          drive: "test-drive",
          filename: "lost.mp4",
          folder_path: "",
          file_type: "video",
          mime_type: "video/mp4",
          thumbnail_url: "/api/files/vidBBBBBBBBB/thumbnail",
          has_thumbnail: true,
          file_size: 9000,
          missing_since: "2026-04-20T00:00:00Z",
          created_at: "2026-04-19T00:00:00Z",
          updated_at: "2026-04-20T00:00:00Z",
        },
      },
    ],
  };
}

describe("RelatedFilesSection", () => {
  beforeEach(() => {
    getFileRelations.mockReset();
  });

  it("renders nothing while loading", async () => {
    getFileRelations.mockReturnValue(new Promise(() => {}));
    const { container } = renderSection("src123456789");
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when no relations", async () => {
    getFileRelations.mockResolvedValue({ relations: [] });
    const { container } = renderSection("src123456789");
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it("renders nothing on fetch error", async () => {
    getFileRelations.mockRejectedValue(new Error("boom"));
    const { container } = renderSection("src123456789");
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it("renders tiles for each relation", async () => {
    getFileRelations.mockResolvedValue(fakeRelations());
    renderSection("src123456789");

    await waitFor(() => {
      expect(screen.getByText(TITLE)).toBeInTheDocument();
    });
    expect(screen.getByText("my-summary.md")).toBeInTheDocument();
    expect(screen.getByText("lost.mp4")).toBeInTheDocument();
    // count badge
    expect(screen.getByText("(2)")).toBeInTheDocument();
  });

  it("marks missing files with the missing badge", async () => {
    getFileRelations.mockResolvedValue(fakeRelations());
    renderSection("src123456789");

    await waitFor(() => {
      expect(screen.getByText("lost.mp4")).toBeInTheDocument();
    });
    expect(screen.getByText(MISSING_BADGE)).toBeInTheDocument();
  });

  it("links each tile to the related file's detail page", async () => {
    getFileRelations.mockResolvedValue(fakeRelations());
    renderSection("src123456789");

    await waitFor(() => {
      expect(screen.getByText("my-summary.md")).toBeInTheDocument();
    });
    const noteLink = screen.getByText("my-summary.md").closest("a");
    expect(noteLink).toHaveAttribute("href", "/files/noteAAAAAAAA");
    const vidLink = screen.getByText("lost.mp4").closest("a");
    expect(vidLink).toHaveAttribute("href", "/files/vidBBBBBBBBB");
  });

  it("requests relations for the provided file id", async () => {
    getFileRelations.mockResolvedValue({ relations: [] });
    renderSection("src123456789");
    await waitFor(() => {
      expect(getFileRelations).toHaveBeenCalledWith("src123456789");
    });
  });
});

describe("RelatedFilesSection under the Related heading", () => {
  it("keeps its card and its own glyph when it stands alone", async () => {
    getFileRelations.mockResolvedValue(fakeRelations());
    const { container } = renderSection("f1");
    await screen.findByText(TITLE);

    // The collection route stacks it beside other bordered sections, so
    // dropping the card there would make it the one section without one.
    const section = container.querySelector("section")!;
    expect(section.classList.contains("border")).toBe(true);
    expect(screen.getByText(TITLE).parentElement!.querySelector("svg")).not.toBeNull();
  });

  it("reads as a part of the group when something groups it", async () => {
    // Grouped, this heading sits under "Related". At the weight it has
    // standing alone it is louder than the heading above it, which reads
    // as two lists rather than one — and the card draws a second box
    // inside the group's own.
    getFileRelations.mockResolvedValue(fakeRelations());
    fileRelationEntries.mockReturnValue([{ id: "some-derived-source" }]);
    const { container } = render(
      <RelatedGroup>
        <RelatedFilesSection fileId="f1" />
      </RelatedGroup>,
    );
    await screen.findByText(TITLE);

    const heading = screen.getByText(TITLE).parentElement!;
    expect(heading.classList.contains("text-xs")).toBe(true);
    expect(heading.classList.contains("text-text-muted")).toBe(true);
    expect(heading.classList.contains("text-text-primary")).toBe(false);

    const section = screen.getByText(TITLE).closest("section")!;
    expect(section.classList.contains("border")).toBe(false);
    // The glyph goes too: the heading above already carries the concept,
    // and a second icon under it labels the same thing twice.
    expect(heading.querySelector("svg")).toBeNull();
    // And the group's own heading is still the louder one above it.
    expect(container.querySelector("h3")!.classList.contains("text-sm")).toBe(
      true,
    );
  });
});
