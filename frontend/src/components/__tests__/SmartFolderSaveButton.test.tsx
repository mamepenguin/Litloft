import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

import type { SmartFolder } from "@/types/smartFolder";
import {
  SmartFolderController,
  SmartFolderMenuItems,
} from "../SmartFolderSaveButton";

const routerReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: routerReplace }),
}));

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

interface Props {
  query?: string;
  typeFilter?: "video" | "image" | null;
  smartFolderId?: string | null;
  show?: string | null;
  includeSceneClip?: boolean;
}

function menu(props: Props = {}) {
  const closeMenu = vi.fn();
  const view = render(
    <SmartFolderController
      drive="main"
      query={props.query ?? "foo"}
      typeFilter={props.typeFilter ?? null}
      smartFolderId={props.smartFolderId ?? null}
      show={props.show}
      includeSceneClip={props.includeSceneClip}
    >
      <div role="menu">
        <SmartFolderMenuItems closeMenu={closeMenu} />
      </div>
    </SmartFolderController>,
  );
  return { closeMenu, view };
}

const replaced = () => {
  const raw = routerReplace.mock.calls.at(-1)?.[0] as string | undefined;
  if (!raw) return null;
  const url = new URL(raw, "http://localhost");
  return { pathname: url.pathname, params: url.searchParams };
};

describe("SPEC-CORE-106 I1 the Smart Collection rows in the … menu", () => {
  beforeEach(() => {
    routerReplace.mockReset();
    createMock.mockReset();
    updateMock.mockReset();
    removeMock.mockReset();
    mockSmartFolders = [];
  });

  it("offers Save when no smart folder is resolved", () => {
    menu();
    expect(screen.getByRole("menuitem", { name: "Save as Smart Collection" })).toBeInTheDocument();
  });

  it("offers nothing for a blank query", () => {
    menu({ query: "   " });
    expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
  });

  it("SPEC-CORE-103 I8: shows the saved name as a non-item row, then Overwrite, Rename and Delete", () => {
    mockSmartFolders = [SAMPLE];
    menu({ smartFolderId: "sf1", typeFilter: "video" });

    const label = screen.getByText("Saved: My Folder");
    expect(label.closest("[role]")?.getAttribute("role")).toBe("presentation");
    expect(label.classList).toContain("truncate");
    expect(screen.queryByRole("menuitem", { name: /Saved:/ })).toBeNull();
    for (const name of ["Overwrite", "Rename", "Delete"]) {
      expect(screen.getByRole("menuitem", { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole("menuitem", { name: "Save as Smart Collection" })).toBeNull();
  });

  it("falls back to Save for an unresolved smart_folder_id", () => {
    mockSmartFolders = [SAMPLE];
    menu({ smartFolderId: "missing-id" });

    expect(screen.getByRole("menuitem", { name: "Save as Smart Collection" })).toBeInTheDocument();
    expect(screen.queryByText(/Saved:/)).toBeNull();
  });

  it("closes the menu before opening Save", () => {
    const { closeMenu } = menu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Save as Smart Collection" }));

    expect(closeMenu).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("save-dialog-save")).toBeInTheDocument();
  });

  it("keeps the dialog alive when the menu goes away", () => {
    const props = { drive: "main", query: "foo", typeFilter: null, smartFolderId: null };
    const { rerender } = render(
      <SmartFolderController {...props}>
        <div role="menu">
          <SmartFolderMenuItems closeMenu={vi.fn()} />
        </div>
      </SmartFolderController>,
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Save as Smart Collection" }));

    rerender(
      <SmartFolderController {...props}>
        <div role="menu" />
      </SmartFolderController>,
    );

    expect(screen.getByTestId("save-dialog-save")).toBeInTheDocument();
  });

  it("saves the URL's q and keeps the view and the scene flag", async () => {
    createMock.mockResolvedValueOnce({ ...SAMPLE, id: "new-id" });
    menu({ query: "foo", typeFilter: "video", show: "passages", includeSceneClip: true });

    fireEvent.click(screen.getByRole("menuitem", { name: "Save as Smart Collection" }));
    fireEvent.click(screen.getByTestId("dialog-submit"));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock).toHaveBeenCalledWith({
      name: "my folder",
      query: "foo",
      file_type: "video",
    });
    await waitFor(() => expect(routerReplace).toHaveBeenCalled());
    const { pathname, params } = replaced()!;
    expect(pathname).toBe("/drive/main/search");
    expect(params.get("q")).toBe("foo");
    expect(params.get("type")).toBe("video");
    expect(params.get("smart_folder_id")).toBe("new-id");
    expect(params.get("show")).toBe("passages");
    expect(params.get("include_scene_clip")).toBe("true");
  });

  it("SPEC-CORE-103 I3: overwrites with the URL's query after closing the menu, without a confirmation", async () => {
    mockSmartFolders = [SAMPLE];
    updateMock.mockResolvedValueOnce({ ...SAMPLE, query: "newquery" });
    const { closeMenu } = menu({ query: "  newquery ", typeFilter: "video", smartFolderId: "sf1" });

    fireEvent.click(screen.getByRole("menuitem", { name: "Overwrite" }));
    expect(closeMenu).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    expect(updateMock.mock.calls[0]).toEqual(["sf1", { query: "newquery", file_type: "video" }]);
  });

  it("SPEC-CORE-103 I1: disables Overwrite while the URL's conditions equal the folder's", () => {
    mockSmartFolders = [SAMPLE];
    menu({ query: " foo ", typeFilter: "video", smartFolderId: "sf1" });

    const row = screen.getByRole("menuitem", { name: "Overwrite" });
    expect(row).toBeDisabled();
    fireEvent.click(row);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("deletes and keeps show and include_scene_clip", async () => {
    mockSmartFolders = [SAMPLE];
    removeMock.mockResolvedValueOnce(undefined);
    const { closeMenu } = menu({
      typeFilter: "video",
      smartFolderId: "sf1",
      show: "passages",
      includeSceneClip: true,
    });

    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(closeMenu).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("confirm-ok"));

    await waitFor(() => expect(removeMock).toHaveBeenCalledWith("sf1"));
    await waitFor(() => expect(routerReplace).toHaveBeenCalled());
    const { params } = replaced()!;
    expect(params.has("smart_folder_id")).toBe(false);
    expect(params.get("q")).toBe("foo");
    expect(params.get("type")).toBe("video");
    expect(params.get("show")).toBe("passages");
    expect(params.get("include_scene_clip")).toBe("true");
  });

  it("opens the rename dialog after closing the menu", () => {
    mockSmartFolders = [SAMPLE];
    const { closeMenu } = menu({ smartFolderId: "sf1" });

    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));

    expect(closeMenu).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("save-dialog-rename")).toBeInTheDocument();
  });

  it("shows a failed save as a toast outside the menu", async () => {
    createMock.mockRejectedValueOnce(new Error("offline"));
    menu();

    fireEvent.click(screen.getByRole("menuitem", { name: "Save as Smart Collection" }));
    await act(async () => {
      fireEvent.click(screen.getByTestId("dialog-submit"));
    });

    expect(await screen.findByText("Failed to save Smart Collection")).toBeInTheDocument();
  });
});
