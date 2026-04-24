import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { EditableTagChips } from "@/components/EditableTagChips";

const file = {
  id: "fVid0000001A",
  mime_type: "video/mp4",
  filename: "clip.mp4",
  drive: "media",
};

vi.mock("@/lib/api", () => ({
  getDriveTags: vi.fn(),
  updateFileTags: vi.fn(),
}));

import { getDriveTags, updateFileTags } from "@/lib/api";

function clickAdd() {
  fireEvent.click(screen.getByRole("button", { name: /タグ追加/ }));
}

function typeAndEnter(text: string) {
  const input = screen.getByPlaceholderText("タグ名...") as HTMLInputElement;
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: "Enter" });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDriveTags).mockResolvedValue([
    { name: "cooking", count: 2 },
    { name: "travel", count: 1 },
  ]);
  vi.mocked(updateFileTags).mockResolvedValue({
    id: "fVid0000001A",
    tags: ["x"],
  } as any);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("EditableTagChips", () => {
  it("renders initial tags with remove buttons", () => {
    render(<EditableTagChips file={file} initialTags={["foo", "bar"]} />);
    expect(screen.getByText("foo")).toBeInTheDocument();
    expect(screen.getByText("bar")).toBeInTheDocument();
    expect(screen.getByLabelText("foo を削除")).toBeInTheDocument();
    expect(screen.getByLabelText("bar を削除")).toBeInTheDocument();
  });

  it("adds a valid tag and calls onTagsChange", async () => {
    const onChange = vi.fn();
    render(
      <EditableTagChips
        file={file}
        initialTags={[]}
        onTagsChange={onChange}
      />,
    );
    clickAdd();
    typeAndEnter("newtag");

    await waitFor(() => {
      expect(screen.getByText("newtag")).toBeInTheDocument();
    });
    expect(onChange).toHaveBeenLastCalledWith(["newtag"]);
  });

  it("rejects invalid characters with an inline error", async () => {
    render(<EditableTagChips file={file} initialTags={[]} />);
    clickAdd();
    typeAndEnter("bad name");

    await waitFor(() => {
      expect(screen.getByText(/使用できない文字/)).toBeInTheDocument();
    });
  });

  it("rejects over-length tags", async () => {
    render(<EditableTagChips file={file} initialTags={[]} />);
    clickAdd();
    typeAndEnter("x".repeat(31));

    await waitFor(() => {
      expect(screen.getByText(/30文字/)).toBeInTheDocument();
    });
  });

  it("rejects the 11th tag with maxCount", async () => {
    const seed = Array.from({ length: 10 }, (_, i) => `t${i}`);
    render(<EditableTagChips file={file} initialTags={seed} />);
    clickAdd();
    typeAndEnter("overflow");

    await waitFor(() => {
      expect(screen.getByText(/最大10個/)).toBeInTheDocument();
    });
  });

  it("removes a tag when its × button is clicked", async () => {
    const onChange = vi.fn();
    render(
      <EditableTagChips
        file={file}
        initialTags={["keep", "drop"]}
        onTagsChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText("drop を削除"));

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(["keep"]);
    });
    expect(screen.queryByText("drop")).toBeNull();
  });

  it("skips duplicates case-insensitively", async () => {
    const onChange = vi.fn();
    render(
      <EditableTagChips
        file={file}
        initialTags={["Cooking"]}
        onTagsChange={onChange}
      />,
    );
    clickAdd();
    typeAndEnter("COOKING");

    // Brief flush — the submitTag path returns early without onChange.
    await waitFor(() => {
      expect(screen.queryByPlaceholderText("タグ名...")).toBeNull();
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Backspace on empty input removes the last chip", async () => {
    const onChange = vi.fn();
    render(
      <EditableTagChips
        file={file}
        initialTags={["a", "b"]}
        onTagsChange={onChange}
      />,
    );
    clickAdd();
    const input = screen.getByPlaceholderText("タグ名...");
    fireEvent.keyDown(input, { key: "Backspace" });

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(["a"]);
    });
  });

  it("Escape closes the input without committing", () => {
    render(<EditableTagChips file={file} initialTags={[]} />);
    clickAdd();
    const input = screen.getByPlaceholderText("タグ名...");
    fireEvent.change(input, { target: { value: "typed" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByPlaceholderText("タグ名...")).toBeNull();
    expect(screen.queryByText("typed")).toBeNull();
  });

  it("accepts Unicode (CJK) tag names", async () => {
    const onChange = vi.fn();
    render(
      <EditableTagChips
        file={file}
        initialTags={[]}
        onTagsChange={onChange}
      />,
    );
    clickAdd();
    typeAndEnter("日本語");

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(["日本語"]);
    });
  });

  describe("content mode", () => {
    it("seeds tags from frontmatter when in content mode", () => {
      const content = "---\ntags:\n  - a\n  - b\n---\nbody\n";
      render(
        <EditableTagChips
          file={file}
          content={content}
          onContentChange={vi.fn()}
        />,
      );
      expect(screen.getByText("a")).toBeInTheDocument();
      expect(screen.getByText("b")).toBeInTheDocument();
    });

    it("adds a tag by rewriting source via onContentChange", async () => {
      const onContentChange = vi.fn();
      const content = "---\ntags: [a]\n---\nbody\n";
      render(
        <EditableTagChips
          file={file}
          content={content}
          onContentChange={onContentChange}
        />,
      );
      clickAdd();
      typeAndEnter("b");

      await waitFor(() => {
        expect(onContentChange).toHaveBeenCalled();
      });
      const next = onContentChange.mock.calls[onContentChange.mock.calls.length - 1][0];
      expect(next).toContain("tags:");
      expect(next).toContain("a");
      expect(next).toContain("b");
      expect(next).toContain("body");
    });

    it("removes a tag by rewriting source via onContentChange", async () => {
      const onContentChange = vi.fn();
      const content = "---\ntags:\n  - keep\n  - drop\n---\nbody\n";
      render(
        <EditableTagChips
          file={file}
          content={content}
          onContentChange={onContentChange}
        />,
      );
      fireEvent.click(screen.getByLabelText("drop を削除"));

      await waitFor(() => {
        expect(onContentChange).toHaveBeenCalled();
      });
      const next = onContentChange.mock.calls[onContentChange.mock.calls.length - 1][0];
      expect(next).toContain("keep");
      expect(next).not.toContain("drop");
    });

    it("NEVER triggers a network save in content mode", async () => {
      const onContentChange = vi.fn();
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);

      render(
        <EditableTagChips
          file={file}
          content="---\ntags: [a]\n---\nbody\n"
          onContentChange={onContentChange}
        />,
      );
      clickAdd();
      typeAndEnter("b");
      // Wait for the content-mode path; no fetch should fire.
      await waitFor(() => expect(onContentChange).toHaveBeenCalled());

      // getDriveTags is mocked at module level so never hits fetch.
      // The only possible fetch would be from a debounced save path
      // (stream + content PUT + resync) — content mode must not do
      // any of those.
      const saveCalls = fetchSpy.mock.calls.filter(([url, init]) => {
        if (typeof url !== "string") return false;
        const method =
          typeof init === "object" && (init as RequestInit | undefined)?.method;
        return (
          method === "PUT" ||
          method === "POST" && url.includes("resync-tags")
        );
      });
      expect(saveCalls).toHaveLength(0);

      vi.unstubAllGlobals();
    });

  });
});
