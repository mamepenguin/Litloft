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
});
