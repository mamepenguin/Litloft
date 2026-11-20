import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { FilePreview } from "../FilePreview";
import { ShortcutsProvider } from "../ShortcutsProvider";
import { useFileNav } from "@/hooks/useFileNav";
import * as api from "@/lib/api";
import type { FileItem } from "@/types";
import {
  InertResizeObserver,
  XLSX_MIME,
  idOfBody,
  installNetwork,
  officeFile,
} from "@/__tests__/helpers/officeViewer";

vi.mock("docx-preview", () => {
  const api = {
    renderAsync: async (data: unknown, container: HTMLElement) => {
      const page = document.createElement("section");
      page.textContent = `drawn:${await idOfBody(data)}`;
      container.append(page);
    },
  };
  return { ...api, default: api };
});

const sheets = vi.hoisted(() => [] as { focusing: boolean }[]);

// Shaped like x-spreadsheet's own markup, so the click lands where a viewer's
// click would; `xs.sheet.focusing` is set by a window click the way the
// library sets it, and its window handlers act on keys only while it is true.
vi.mock("@js-preview/excel", () => {
  const api = {
    init: (container: HTMLElement) => {
      const sheet = { focusing: false };
      sheets.push(sheet);
      window.addEventListener("click", (event) => {
        sheet.focusing = container.contains(event.target as Node);
      });
      return {
        xs: { sheet },
        preview: async (data: unknown) => {
          const grid = document.createElement("div");
          grid.className = "x-spreadsheet";
          const table = document.createElement("canvas");
          table.className = "x-spreadsheet-table";
          table.setAttribute("data-testid", "grid-cells");
          const label = document.createElement("div");
          label.textContent = `drawn:${await idOfBody(data)}`;
          grid.append(table, label);
          container.append(grid);
        },
        destroy: () => {},
      };
    },
  };
  return { ...api, default: api };
});
vi.mock("@js-preview/excel/lib/index.css", () => ({ default: "" }));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getFileNeighbors: vi.fn(),
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
  getDownloadUrl: (id: string) => `/api/files/${id}/stream?download=true`,
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
  getPreviewTextUrl: (id: string) => `/api/files/${id}/preview-text`,
}));
vi.mock("../AddonSlot", () => ({ AddonSlot: () => null }));

function Page({ file, onNavigate }: { file: FileItem; onNavigate: (id: string) => void }) {
  useFileNav({
    fileId: file.id,
    fileType: file.file_type,
    mimeType: file.mime_type,
    enabled: true,
    onNavigate,
  });
  return (
    <div>
      <button type="button">outside</button>
      <input aria-label="comment" />
      <FilePreview file={file} />
    </div>
  );
}

const SHEET = officeFile({ id: "sheet-a", filename: "plan.xlsx", mime_type: XLSX_MIME });
const WORD = officeFile({ id: "doc-a" });


beforeEach(() => {
  sheets.length = 0;
  vi.stubGlobal("ResizeObserver", InertResizeObserver);
  installNetwork();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  (api.getFileNeighbors as ReturnType<typeof vi.fn>).mockReset();
  (api.getFileNeighbors as ReturnType<typeof vi.fn>).mockResolvedValue({
    prev_id: "prev1",
    next_id: "next1",
    position: 2,
    total: 3,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderPage(file: FileItem) {
  const onNavigate = vi.fn();
  const view = render(
    <ShortcutsProvider>
      <Page file={file} onNavigate={onNavigate} />
    </ShortcutsProvider>,
  );
  const rerender = (next: FileItem) =>
    view.rerender(
      <ShortcutsProvider>
        <Page file={next} onNavigate={onNavigate} />
      </ShortcutsProvider>,
    );
  return { onNavigate, rerender, unmount: view.unmount };
}

async function shown(id: string) {
  await within(screen.getByRole("region", { name: "Document" })).findByText(`drawn:${id}`);
  await waitFor(() => expect(api.getFileNeighbors).toHaveBeenCalled());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

function clickOn(el: Element) {
  fireEvent.pointerDown(el);
  fireEvent.mouseDown(el);
  if (el instanceof HTMLElement && el.tabIndex >= 0) el.focus();
  fireEvent.pointerUp(el);
  fireEvent.mouseUp(el);
  fireEvent.click(el);
}

async function press(key: "ArrowLeft" | "ArrowRight") {
  await act(async () => {});
  const target = document.activeElement ?? document.body;
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

describe("SPEC-CORE-155 I8 the arrows and an active Excel grid", () => {
  it("do not change file while the grid is active", async () => {
    const { onNavigate } = renderPage(SHEET);
    await shown("sheet-a");

    clickOn(screen.getByTestId("grid-cells"));
    await press("ArrowRight");
    await press("ArrowLeft");
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("change file again after a click outside the grid", async () => {
    const { onNavigate } = renderPage(SHEET);
    await shown("sheet-a");

    clickOn(screen.getByTestId("grid-cells"));
    await press("ArrowRight");
    expect(onNavigate).not.toHaveBeenCalled();

    clickOn(screen.getByRole("button", { name: "outside" }));
    await press("ArrowRight");
    expect(onNavigate).toHaveBeenCalledWith("next1");
  });

  it("change file on a Word file, even after a click inside its drawing", async () => {
    const { onNavigate } = renderPage(WORD);
    await shown("doc-a");

    clickOn(screen.getByText("drawn:doc-a"));
    await press("ArrowRight");
    expect(onNavigate).toHaveBeenCalledWith("next1");
  });

});

describe("SPEC-CORE-155 I9 I10 the grid lets go of the page's keys", () => {
  it("when focus moves to a field outside it, and when the viewer unmounts", async () => {
    const { unmount } = renderPage(SHEET);
    await shown("sheet-a");
    const sheet = sheets[0];

    clickOn(screen.getByTestId("grid-cells"));
    expect(sheet.focusing).toBe(true);
    act(() => {
      screen.getByRole("textbox", { name: "comment" }).focus();
    });
    expect(sheet.focusing).toBe(false);

    clickOn(screen.getByTestId("grid-cells"));
    expect(sheet.focusing).toBe(true);
    unmount();
    expect(sheet.focusing).toBe(false);
  });
});
