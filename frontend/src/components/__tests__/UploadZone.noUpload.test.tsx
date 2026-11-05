/**
 * SPEC-CORE-046 I8 / step 2: a page that never uploaded stays that way. With
 * `acceptUpload` off, an upload-class drop does nothing and shows no overlay;
 * a one-image drop still starts an image query.
 */
import { act, fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { dataTransfer, imageFile } from "@/__tests__/helpers/imageQuery";
import { UploadZone } from "@/components/UploadZone";
import { resetUploadStore } from "@/hooks/useUpload";

const initUpload = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({
  initUpload: (...args: unknown[]) => initUpload(...args),
  uploadChunk: vi.fn().mockResolvedValue({}),
  completeUpload: vi.fn().mockResolvedValue({ id: "f1" }),
  cancelUpload: vi.fn().mockResolvedValue({}),
  getFilesProcessing: vi.fn().mockResolvedValue({ files: {} }),
}));

const SEARCH_OVERLAY = "Drop to search by this image";
const UPLOAD_OVERLAY = "Drop files to upload";

const text = (name = "notes.txt") => new File(["x"], name, { type: "text/plain" });

function renderZone(onImageQuery: (file: File) => void) {
  const view = render(
    <UploadZone drive="main" folderPath="" onImageQuery={onImageQuery} acceptUpload={false}>
      <div data-testid="inside" />
    </UploadZone>,
  );
  return { ...view, zone: view.container.querySelector("[data-upload-zone]")! };
}

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  initUpload.mockReset();
  initUpload.mockResolvedValue({ upload_id: "u1", total_chunks: 1 });
  resetUploadStore();
});

describe("SPEC-CORE-046 I8 without uploads on the page", () => {
  it("a non-image drop uploads nothing and shows no upload overlay", async () => {
    const onImageQuery = vi.fn();
    const { zone } = renderZone(onImageQuery);
    const drag = { dataTransfer: dataTransfer({ files: [text()] }) };

    fireEvent.dragEnter(zone, drag);
    expect(document.body.textContent).not.toContain(UPLOAD_OVERLAY);
    fireEvent.drop(zone, drag);
    await settle();

    expect(initUpload).not.toHaveBeenCalled();
    expect(onImageQuery).not.toHaveBeenCalled();
  });

  it("several images upload nothing and stay out of the image query", async () => {
    const onImageQuery = vi.fn();
    const { zone } = renderZone(onImageQuery);
    const drag = { dataTransfer: dataTransfer({ files: [imageFile("a.png"), imageFile("b.png")] }) };

    fireEvent.dragEnter(zone, drag);
    expect(document.body.textContent).not.toContain(UPLOAD_OVERLAY);
    fireEvent.drop(zone, drag);
    await settle();

    expect(initUpload).not.toHaveBeenCalled();
    expect(onImageQuery).not.toHaveBeenCalled();
  });

  it("a folder uploads nothing", async () => {
    const onImageQuery = vi.fn();
    const { zone } = renderZone(onImageQuery);
    const drag = dataTransfer({
      items: [{ kind: "file", type: "" }],
      files: [text("inside.txt")],
    });
    (drag.items[0] as unknown as { webkitGetAsEntry?: () => unknown }).webkitGetAsEntry = () => ({
      isDirectory: true,
      isFile: false,
      name: "folder",
    });

    fireEvent.dragEnter(zone, { dataTransfer: drag });
    fireEvent.drop(zone, { dataTransfer: drag });
    await settle();

    expect(initUpload).not.toHaveBeenCalled();
    expect(onImageQuery).not.toHaveBeenCalled();
  });

  it("a text-selection drag shows no overlay", () => {
    const onImageQuery = vi.fn();
    const { zone } = renderZone(onImageQuery);

    fireEvent.dragEnter(zone, {
      dataTransfer: dataTransfer({ items: [{ kind: "string", type: "text/plain" }] }),
    });

    expect(document.body.textContent).not.toContain(UPLOAD_OVERLAY);
    expect(document.body.textContent).not.toContain(SEARCH_OVERLAY);
  });

  it("still searches on a one-image drop", async () => {
    const onImageQuery = vi.fn();
    const { zone } = renderZone(onImageQuery);
    const file = imageFile();
    const drag = { dataTransfer: dataTransfer({ files: [file] }) };

    fireEvent.dragEnter(zone, drag);
    expect(document.body.textContent).toContain(SEARCH_OVERLAY);
    fireEvent.drop(zone, drag);
    await settle();

    expect(onImageQuery).toHaveBeenCalledWith(file);
    expect(initUpload).not.toHaveBeenCalled();
  });
});
