import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TagEditor } from "../TagEditor";
import type { FileItem } from "@/types";

const mockRequestRefresh = vi.fn();
vi.mock("../SidebarProvider", () => ({
  useSidebar: () => ({ requestRefresh: mockRequestRefresh }),
}));

vi.mock("@/lib/api", () => ({
  getDriveTags: vi.fn().mockResolvedValue([
    { name: "nature", count: 5 },
    { name: "travel", count: 3 },
  ]),
  updateFileTags: vi.fn().mockResolvedValue({
    id: "file-1",
    tags: ["nature"],
  }),
}));

import { updateFileTags } from "@/lib/api";

describe("TagEditor", () => {
  const onUpdate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders existing tags", () => {
    render(<TagEditor fileId="file-1" drive="main" tags={["rock", "jazz"]} onUpdate={onUpdate} />);
    expect(screen.getByText("rock")).toBeInTheDocument();
    expect(screen.getByText("jazz")).toBeInTheDocument();
  });

  it("renders add tag button", () => {
    render(<TagEditor fileId="file-1" drive="main" tags={[]} onUpdate={onUpdate} />);
    expect(screen.getByText("タグ追加")).toBeInTheDocument();
  });

  it("shows input on add button click", () => {
    render(<TagEditor fileId="file-1" drive="main" tags={[]} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByText("タグ追加"));
    expect(screen.getByPlaceholderText("タグ名...")).toBeInTheDocument();
  });

  it("renders remove button for each tag", () => {
    render(<TagEditor fileId="file-1" drive="main" tags={["rock"]} onUpdate={onUpdate} />);
    expect(screen.getByLabelText("rock を削除")).toBeInTheDocument();
  });

  it("calls updateFileTags on tag removal", async () => {
    render(<TagEditor fileId="file-1" drive="main" tags={["rock", "jazz"]} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByLabelText("rock を削除"));

    await waitFor(() => {
      expect(updateFileTags).toHaveBeenCalledWith("file-1", ["jazz"]);
    });
  });
});
