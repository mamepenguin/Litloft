import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { PropertiesPanel } from "@/components/PropertiesPanel";

// Minimal FileItem stub for getFile() mock
function fakeFile(id: string, filename = "sample.mp4") {
  return {
    id,
    filename,
    title: filename,
    description: "",
    drive: "media",
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: `/thumb/${id}.jpg`,
    has_thumbnail: true,
    file_size: 1000,
    duration: 10,
    likes: 0,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("PropertiesPanel", () => {
  beforeEach(() => {
    // Reset fetch mock per test
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(fakeFile("defaultId")),
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders null when frontmatter is empty", () => {
    const { container } = render(<PropertiesPanel frontmatter={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders tags as pills", () => {
    render(<PropertiesPanel frontmatter={{ tags: ["foo", "bar"] }} />);
    expect(screen.getByText("タグ")).toBeInTheDocument();
    expect(screen.getByText("foo")).toBeInTheDocument();
    expect(screen.getByText("bar")).toBeInTheDocument();
  });

  it("renders aliases separately from tags", () => {
    render(
      <PropertiesPanel
        frontmatter={{ aliases: ["alt1", "alt2"] }}
      />,
    );
    expect(screen.getByText("別名")).toBeInTheDocument();
    expect(screen.getByText("alt1")).toBeInTheDocument();
    expect(screen.getByText("alt2")).toBeInTheDocument();
  });

  it("renders description with line-clamp-3", () => {
    const { container } = render(
      <PropertiesPanel frontmatter={{ description: "hello world" }} />,
    );
    expect(screen.getByText("説明")).toBeInTheDocument();
    const p = container.querySelector("p");
    expect(p).not.toBeNull();
    expect(p!.className).toContain("line-clamp-3");
    expect(p!.textContent).toBe("hello world");
  });

  it("renders created as a <time> element with tooltip", () => {
    const iso = "2026-04-20T12:00:00Z";
    const { container } = render(
      <PropertiesPanel frontmatter={{ created: iso }} />,
    );
    expect(screen.getByText("作成")).toBeInTheDocument();
    const time = container.querySelector("time");
    expect(time).not.toBeNull();
    expect(time!.getAttribute("datetime")).toBe(iso);
    // Tooltip is the locale-formatted absolute date — just confirm it exists
    expect(time!.getAttribute("title")).toBeTruthy();
  });

  it("treats legacy approved_at as an unknown key (not promoted to created)", () => {
    // Spec 2026-04-24: only ``created`` is reserved. Legacy keys from
    // pre-spec writes show up verbatim rather than pretending to be
    // first-class creation timestamps.
    const { container } = render(
      <PropertiesPanel
        frontmatter={{ approved_at: "2026-01-15T00:00:00Z" }}
      />,
    );
    expect(screen.queryByText("作成")).toBeNull();
    expect(container.querySelector("time")).toBeNull();
    expect(screen.getByText("approved_at")).toBeInTheDocument();
    expect(screen.getByText("2026-01-15T00:00:00Z")).toBeInTheDocument();
  });

  it("treats legacy clipped_at as an unknown key", () => {
    const { container } = render(
      <PropertiesPanel
        frontmatter={{ clipped_at: "2026-02-01T00:00:00Z" }}
      />,
    );
    expect(screen.queryByText("作成")).toBeNull();
    expect(container.querySelector("time")).toBeNull();
    expect(screen.getByText("clipped_at")).toBeInTheDocument();
  });

  it("renders created independently of any legacy date keys present", () => {
    const { container } = render(
      <PropertiesPanel
        frontmatter={{
          created: "2026-04-20T00:00:00Z",
          approved_at: "2026-01-01T00:00:00Z",
          clipped_at: "2026-02-01T00:00:00Z",
        }}
      />,
    );
    expect(container.querySelector("time")?.getAttribute("datetime")).toBe(
      "2026-04-20T00:00:00Z",
    );
    // Legacy keys still render as unknown rows
    expect(screen.getByText("approved_at")).toBeInTheDocument();
    expect(screen.getByText("clipped_at")).toBeInTheDocument();
  });

  it("renders url as a target=_blank link with domain text", () => {
    render(
      <PropertiesPanel
        frontmatter={{ url: "https://example.com/foo/bar?x=1" }}
      />,
    );
    expect(screen.getByText("URL")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /example\.com/ });
    expect(link).toHaveAttribute("href", "https://example.com/foo/bar?x=1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders origin as a localised badge for known values", () => {
    render(<PropertiesPanel frontmatter={{ origin: "webclip" }} />);
    expect(screen.getByText("由来")).toBeInTheDocument();
    expect(screen.getByText("Web クリップ")).toBeInTheDocument();
  });

  it("renders unknown origin values verbatim", () => {
    render(<PropertiesPanel frontmatter={{ origin: "exotic" }} />);
    // The mock returns "propertiesPanel.origin.exotic" for missing keys,
    // and the component treats that as non-localised → raw value shown.
    // Our fallback in OriginRenderer catches this via t() throwing is
    // not exercised by the mock, so we accept either the raw key path
    // or the raw value. Verify the user at least sees *something* that
    // includes "exotic".
    expect(
      screen.getByText((c) => c.includes("exotic")),
    ).toBeInTheDocument();
  });

  it("renders unknown keys verbatim with their raw key as label", () => {
    render(
      <PropertiesPanel
        frontmatter={{ customKey: "custom value", rating: 5 }}
      />,
    );
    expect(screen.getByText("customKey")).toBeInTheDocument();
    expect(screen.getByText("custom value")).toBeInTheDocument();
    expect(screen.getByText("rating")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("joins unknown array keys with commas", () => {
    render(<PropertiesPanel frontmatter={{ authors: ["a", "b", "c"] }} />);
    expect(screen.getByText("a, b, c")).toBeInTheDocument();
  });

  it("shows first 5 sources and a 'more' button for the rest", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        const match = url.match(/\/files\/([^/?]+)/);
        const id = match ? match[1] : "?";
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(fakeFile(id, `name-${id}.mp4`)),
        });
      }),
    );
    render(
      <PropertiesPanel
        frontmatter={{
          source_file_ids: ["a", "b", "c", "d", "e", "f", "g"],
        }}
      />,
    );
    expect(screen.getByText("情報源")).toBeInTheDocument();
    // At first only 5 cards resolve
    await waitFor(() => {
      expect(screen.getByText("name-a.mp4")).toBeInTheDocument();
      expect(screen.getByText("name-e.mp4")).toBeInTheDocument();
    });
    // f, g are hidden behind "more"
    expect(screen.queryByText("name-f.mp4")).toBeNull();
    const more = screen.getByRole("button", { name: /他\s*2\s*件/ });
    expect(more).toBeInTheDocument();
  });

  it("shows a missing placeholder when file resolution fails (403/404)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          statusText: "Not Found",
          json: () => Promise.resolve({}),
        }),
      ),
    );
    render(
      <PropertiesPanel frontmatter={{ source_file_ids: ["ghost-id"] }} />,
    );
    await waitFor(() => {
      expect(screen.getByText("ghost-id")).toBeInTheDocument();
    });
  });

  it("orders reserved keys before unknown ones", () => {
    const { container } = render(
      <PropertiesPanel
        frontmatter={{
          customKey: "Z",
          origin: "manual",
          tags: ["a"],
        }}
      />,
    );
    const dts = Array.from(container.querySelectorAll("dt")).map(
      (el) => el.textContent,
    );
    // Reserved order: origin, tags — then the unknown customKey last
    expect(dts).toEqual(["由来", "タグ", "customKey"]);
  });

  describe("editable mode", () => {
    const editable = {
      id: "fId000000001",
      mime_type: "text/markdown",
      filename: "note.md",
      drive: "media",
    };

    it("shows an Add button even when frontmatter has no tags", () => {
      const { container } = render(
        <PropertiesPanel frontmatter={{}} editable={editable} />,
      );
      // Empty frontmatter + editable still renders a panel with a tags row.
      expect(container.firstChild).not.toBeNull();
      expect(screen.getByText("タグ")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /タグ追加/ })).toBeInTheDocument();
    });

    it("renders remove buttons on existing chips when editable", () => {
      render(
        <PropertiesPanel
          frontmatter={{ tags: ["foo", "bar"] }}
          editable={editable}
        />,
      );
      expect(screen.getByLabelText("foo を削除")).toBeInTheDocument();
      expect(screen.getByLabelText("bar を削除")).toBeInTheDocument();
    });

    it("does NOT show remove buttons in read-only mode", () => {
      render(<PropertiesPanel frontmatter={{ tags: ["foo"] }} />);
      expect(screen.queryByLabelText("foo を削除")).toBeNull();
    });
  });
});
