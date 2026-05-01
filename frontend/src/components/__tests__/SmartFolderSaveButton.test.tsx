import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import type { SmartFolder } from "@/types/smartFolder";
import { SmartFolderSaveButton } from "../SmartFolderSaveButton";

// Mock router
const routerReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: routerReplace }),
}));

// Mock hook so we can drive its return shape directly.
const createMock = vi.fn();
const updateMock = vi.fn();
const removeMock = vi.fn();
let mockSmartFolders: SmartFolder[] = [];
vi.mock("@/hooks/useSmartFolders", () => ({
  useSmartFolders: () => ({
    smartFolders: mockSmartFolders,
    loading: false,
    error: null,
    refetch: vi.fn(),
    create: createMock,
    update: updateMock,
    remove: removeMock,
  }),
}));

// Stub heavy dialog components so we can interrogate them by testid.
vi.mock("../SmartFolderSaveDialog", () => ({
  SmartFolderSaveDialog: ({
    open,
    mode,
    onSubmit,
  }: {
    open: boolean;
    mode?: string;
    onSubmit: (name: string) => void;
  }) =>
    open ? (
      <div data-testid={`save-dialog-${mode ?? "save"}`}>
        <button
          data-testid="dialog-submit"
          onClick={() => onSubmit("my folder")}
        >
          submit
        </button>
      </div>
    ) : null,
}));

vi.mock("../ConfirmDialog", () => ({
  ConfirmDialog: ({
    open,
    title,
    onConfirm,
  }: {
    open: boolean;
    title: string;
    onConfirm: () => void;
  }) =>
    open ? (
      <div data-testid="confirm-dialog" data-title={title}>
        <button data-testid="confirm-ok" onClick={onConfirm}>
          ok
        </button>
      </div>
    ) : null,
}));

const SAMPLE: SmartFolder = {
  id: "sf1",
  drive: "main",
  name: "My Folder",
  query: "foo",
  file_type: "video",
  sort_by: null,
  sort_order: null,
  created_at: "2026-05-01T00:00:00Z",
  updated_at: null,
};

describe("SmartFolderSaveButton", () => {
  beforeEach(() => {
    routerReplace.mockReset();
    createMock.mockReset();
    updateMock.mockReset();
    removeMock.mockReset();
    mockSmartFolders = [];
  });

  it("renders 'save' button when smartFolderId is null", () => {
    render(
      <SmartFolderSaveButton
        drive="main"
        query="foo"
        typeFilter={null}
        smartFolderId={null}
      />,
    );
    expect(screen.getByText("Smart Folder に保存")).toBeInTheDocument();
  });

  it("renders nothing visually meaningful when query is empty", () => {
    const { container } = render(
      <SmartFolderSaveButton
        drive="main"
        query="   "
        typeFilter={null}
        smartFolderId={null}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders 'saved: name' chip when smart folder is found", () => {
    mockSmartFolders = [SAMPLE];
    render(
      <SmartFolderSaveButton
        drive="main"
        query="foo"
        typeFilter="video"
        smartFolderId="sf1"
      />,
    );
    expect(screen.getByText(/保存中: My Folder/)).toBeInTheDocument();
  });

  it("falls back to 'save' mode if smartFolderId does not match any SF", () => {
    mockSmartFolders = [SAMPLE];
    render(
      <SmartFolderSaveButton
        drive="main"
        query="foo"
        typeFilter={null}
        smartFolderId="missing-id"
      />,
    );
    expect(screen.getByText("Smart Folder に保存")).toBeInTheDocument();
  });

  it("opens save dialog on save button click", () => {
    render(
      <SmartFolderSaveButton
        drive="main"
        query="foo"
        typeFilter={null}
        smartFolderId={null}
      />,
    );
    fireEvent.click(screen.getByText("Smart Folder に保存"));
    expect(screen.getByTestId("save-dialog-save")).toBeInTheDocument();
  });

  it("creates SF and replaces URL on dialog submit", async () => {
    createMock.mockResolvedValueOnce({ ...SAMPLE, id: "new-id" });
    render(
      <SmartFolderSaveButton
        drive="main"
        query="foo"
        typeFilter="video"
        smartFolderId={null}
      />,
    );
    fireEvent.click(screen.getByText("Smart Folder に保存"));
    fireEvent.click(screen.getByTestId("dialog-submit"));
    await waitFor(() => {
      expect(createMock).toHaveBeenCalledWith({
        name: "my folder",
        query: "foo",
        file_type: "video",
      });
      expect(routerReplace).toHaveBeenCalledWith(
        "/drive/main/search?q=foo&type=video&smart_folder_id=new-id",
      );
    });
  });

  it("opens dropdown menu in saved mode and shows update/rename/delete", () => {
    mockSmartFolders = [SAMPLE];
    render(
      <SmartFolderSaveButton
        drive="main"
        query="foo"
        typeFilter="video"
        smartFolderId="sf1"
      />,
    );
    fireEvent.click(screen.getByText(/保存中: My Folder/));
    expect(screen.getByText("更新")).toBeInTheDocument();
    expect(screen.getByText("名前変更")).toBeInTheDocument();
    expect(screen.getByText("削除")).toBeInTheDocument();
  });

  it("calls update with current query when 'update' is confirmed", async () => {
    mockSmartFolders = [SAMPLE];
    updateMock.mockResolvedValueOnce({ ...SAMPLE, query: "newquery" });
    render(
      <SmartFolderSaveButton
        drive="main"
        query="newquery"
        typeFilter="video"
        smartFolderId="sf1"
      />,
    );
    fireEvent.click(screen.getByText(/保存中: My Folder/));
    await act(async () => {
      fireEvent.click(screen.getByText("更新"));
    });
    fireEvent.click(screen.getByTestId("confirm-ok"));
    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith("sf1", {
        query: "newquery",
        file_type: "video",
      });
    });
  });

  it("deletes SF and removes smart_folder_id from URL on delete confirm", async () => {
    mockSmartFolders = [SAMPLE];
    removeMock.mockResolvedValueOnce(undefined);
    render(
      <SmartFolderSaveButton
        drive="main"
        query="foo"
        typeFilter={null}
        smartFolderId="sf1"
      />,
    );
    fireEvent.click(screen.getByText(/保存中: My Folder/));
    await act(async () => {
      fireEvent.click(screen.getByText("削除"));
    });
    fireEvent.click(screen.getByTestId("confirm-ok"));
    await waitFor(() => {
      expect(removeMock).toHaveBeenCalledWith("sf1");
      expect(routerReplace).toHaveBeenCalledWith("/drive/main/search?q=foo");
    });
  });

  it("opens rename dialog when 'rename' menu item clicked", async () => {
    mockSmartFolders = [SAMPLE];
    render(
      <SmartFolderSaveButton
        drive="main"
        query="foo"
        typeFilter={null}
        smartFolderId="sf1"
      />,
    );
    fireEvent.click(screen.getByText(/保存中: My Folder/));
    await act(async () => {
      fireEvent.click(screen.getByText("名前変更"));
    });
    expect(screen.getByTestId("save-dialog-rename")).toBeInTheDocument();
  });
});
