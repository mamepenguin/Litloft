import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CommentSection } from "../CommentSection";
import type { Comment, CommentsResponse } from "@/types";

const mockComments: Comment[] = [
  {
    id: "c1",
    nickname: "Alice",
    body: "Great video!",
    is_mine: true,
    created_at: "2026-04-03T10:00:00Z",
    updated_at: "2026-04-03T10:00:00Z",
  },
  {
    id: "c2",
    nickname: "Bob",
    body: "Nice work",
    is_mine: false,
    created_at: "2026-04-03T11:00:00Z",
    updated_at: "2026-04-03T11:00:00Z",
  },
  {
    id: "c3",
    nickname: null,
    body: "Anonymous comment",
    is_mine: false,
    created_at: "2026-04-03T12:00:00Z",
    updated_at: "2026-04-03T12:00:00Z",
  },
];

const mockGetComments = vi.fn<() => Promise<CommentsResponse>>();
const mockCreateComment = vi.fn<() => Promise<Comment>>();
const mockUpdateComment = vi.fn<() => Promise<Comment>>();
const mockDeleteComment = vi.fn<() => Promise<void>>();

vi.mock("@/lib/api", () => ({
  getComments: (...args: unknown[]) => mockGetComments(...args as []),
  createComment: (...args: unknown[]) => mockCreateComment(...args as []),
  updateComment: (...args: unknown[]) => mockUpdateComment(...args as []),
  deleteComment: (...args: unknown[]) => mockDeleteComment(...args as []),
}));

vi.mock("@/lib/format", () => ({
  formatRelativeDate: () => "3 min ago",
}));

describe("CommentSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders empty state when no comments", async () => {
    mockGetComments.mockResolvedValue({ comments: [], total: 0 });

    render(<CommentSection fileId="file-1" />);

    await waitFor(() => {
      expect(screen.getByText("コメントはまだありません")).toBeInTheDocument();
    });
  });

  it("renders comment list with nicknames", async () => {
    mockGetComments.mockResolvedValue({ comments: mockComments, total: 3 });

    render(<CommentSection fileId="file-1" />);

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();
      expect(screen.getByText("Great video!")).toBeInTheDocument();
      expect(screen.getByText("Nice work")).toBeInTheDocument();
    });
  });

  it("shows anonymous for null nickname", async () => {
    mockGetComments.mockResolvedValue({
      comments: [mockComments[2]],
      total: 1,
    });

    render(<CommentSection fileId="file-1" />);

    await waitFor(() => {
      expect(screen.getByText("匿名")).toBeInTheDocument();
      expect(screen.getByText("Anonymous comment")).toBeInTheDocument();
    });
  });

  it("shows edit/delete buttons for own comments (is_mine=true)", async () => {
    mockGetComments.mockResolvedValue({
      comments: [mockComments[0]],
      total: 1,
    });

    render(<CommentSection fileId="file-1" />);

    await waitFor(() => {
      expect(screen.getByLabelText("編集")).toBeInTheDocument();
      expect(screen.getByLabelText("削除")).toBeInTheDocument();
    });
  });

  it("hides edit/delete for others comments", async () => {
    mockGetComments.mockResolvedValue({
      comments: [mockComments[1]],
      total: 1,
    });

    render(<CommentSection fileId="file-1" />);

    await waitFor(() => {
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });

    expect(screen.queryByLabelText("編集")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("削除")).not.toBeInTheDocument();
  });

  it("calls createComment on post", async () => {
    mockGetComments.mockResolvedValue({ comments: [], total: 0 });
    mockCreateComment.mockResolvedValue({
      id: "new-1",
      nickname: "Alice",
      body: "Hello",
      is_mine: true,
      created_at: "2026-04-03T13:00:00Z",
      updated_at: "2026-04-03T13:00:00Z",
    });

    render(<CommentSection fileId="file-1" />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("コメントを入力...")).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText("コメントを入力...");
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.click(screen.getByLabelText("投稿"));

    await waitFor(() => {
      expect(mockCreateComment).toHaveBeenCalledWith("file-1", "Hello");
    });
  });

  it("calls updateComment on edit save", async () => {
    mockGetComments.mockResolvedValue({
      comments: [mockComments[0]],
      total: 1,
    });
    mockUpdateComment.mockResolvedValue({
      ...mockComments[0],
      body: "Updated!",
      updated_at: "2026-04-03T14:00:00Z",
    });

    render(<CommentSection fileId="file-1" />);

    await waitFor(() => {
      expect(screen.getByLabelText("編集")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("編集"));

    const editTextarea = screen.getByDisplayValue("Great video!");
    fireEvent.change(editTextarea, { target: { value: "Updated!" } });
    fireEvent.click(screen.getByText("保存"));

    await waitFor(() => {
      expect(mockUpdateComment).toHaveBeenCalledWith("file-1", "c1", "Updated!");
    });
  });

  it("calls deleteComment on delete confirm", async () => {
    mockGetComments.mockResolvedValue({
      comments: [mockComments[0]],
      total: 1,
    });
    mockDeleteComment.mockResolvedValue(undefined);

    render(<CommentSection fileId="file-1" />);

    await waitFor(() => {
      expect(screen.getByLabelText("削除")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("削除"));

    await waitFor(() => {
      expect(screen.getByText("このコメントを削除しますか？")).toBeInTheDocument();
    });

    // Click the confirm button in the dialog (the one with text "削除" that is inside the dialog)
    const deleteButtons = screen.getAllByText("削除");
    const confirmButton = deleteButtons[deleteButtons.length - 1];
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockDeleteComment).toHaveBeenCalledWith("file-1", "c1");
    });
  });
});
