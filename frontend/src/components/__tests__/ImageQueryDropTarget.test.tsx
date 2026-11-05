/**
 * SPEC-CORE-046 step 2 / I8: on the results page with a text query, a drag is
 * classed once at dragenter and its drop does what the overlay said.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { dataTransfer, imageFile } from "@/__tests__/helpers/imageQuery";
import { ImageQueryDropTarget } from "@/components/search/ImageQueryDropTarget";
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

function renderZone(onImageQuery?: (file: File) => void) {
  const view = render(
    <>
      <ImageQueryDropTarget onImageQuery={onImageQuery} />
      <div data-testid="inside" />
    </>,
  );
  return { ...view, zone: document.body };
}

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

/** One drag classed one image, dropped: the zone searches and uploads nothing. */
async function searchOnce(zone: Element, onImageQuery: ReturnType<typeof vi.fn>) {
  const file = imageFile("first.png");
  fireEvent.dragEnter(zone, { dataTransfer: dataTransfer({ files: [file] }) });
  fireEvent.drop(zone, { dataTransfer: dataTransfer({ files: [file] }) });
  await settle();
  expect(onImageQuery).toHaveBeenCalledWith(file);
  expect(initUpload).not.toHaveBeenCalled();
}

beforeEach(() => {
  initUpload.mockReset();
  initUpload.mockResolvedValue({ upload_id: "u1", total_chunks: 1 });
  resetUploadStore();
});

describe("SPEC-CORE-046 I8: the results page drop target", () => {
  it("classes one image as a search: the search overlay, then onImageQuery with the file and no upload", async () => {
    const onImageQuery = vi.fn();
    const { zone } = renderZone(onImageQuery);
    const file = imageFile();

    fireEvent.dragEnter(zone, { dataTransfer: dataTransfer({ files: [file] }) });
    expect(screen.getByText(SEARCH_OVERLAY)).toBeInTheDocument();
    expect(screen.queryByText(UPLOAD_OVERLAY)).toBeNull();

    fireEvent.drop(zone, { dataTransfer: dataTransfer({ files: [file] }) });
    await settle();

    expect(onImageQuery).toHaveBeenCalledTimes(1);
    expect(onImageQuery).toHaveBeenCalledWith(file);
    expect(initUpload).not.toHaveBeenCalled();
  });

  it.each([
    ["a non-image", { files: [text()] }],
    ["several images", { files: [imageFile("a.png"), imageFile("b.png")] }],
    ["an item whose type is not reported", { items: [{ kind: "file" as const, type: "" }], files: [imageFile()] }],
    ["a string item", { items: [{ kind: "string" as const, type: "image/png" }], files: [imageFile()] }],
  ])("classes %s as an upload: no overlay, no upload, where one image searches", async (_name, drag) => {
    const onImageQuery = vi.fn();
    const { zone } = renderZone(onImageQuery);
    await searchOnce(zone, onImageQuery);

    fireEvent.dragEnter(zone, { dataTransfer: dataTransfer(drag) });
    expect(screen.queryByText(UPLOAD_OVERLAY)).toBeNull();
    expect(screen.queryByText(SEARCH_OVERLAY)).toBeNull();

    fireEvent.drop(zone, { dataTransfer: dataTransfer(drag) });
    await settle();
    expect(initUpload).not.toHaveBeenCalled();
    expect(onImageQuery).toHaveBeenCalledTimes(1);
  });

  it("never falls back to an upload: a drag classed one image that drops two files does nothing", async () => {
    const onImageQuery = vi.fn();
    const { zone } = renderZone(onImageQuery);

    fireEvent.dragEnter(zone, { dataTransfer: dataTransfer({ files: [imageFile()] }) });
    fireEvent.drop(zone, { dataTransfer: dataTransfer({ files: [imageFile("a.png"), imageFile("b.png")] }) });
    await settle();

    expect(onImageQuery).not.toHaveBeenCalled();
    expect(initUpload).not.toHaveBeenCalled();
  });

  it("does not re-derive the class on drop: a drag classed upload that drops one image starts nothing", async () => {
    const onImageQuery = vi.fn();
    const { zone } = renderZone(onImageQuery);
    await searchOnce(zone, onImageQuery);
    const file = imageFile();

    fireEvent.dragEnter(zone, { dataTransfer: dataTransfer({ items: [{ kind: "file", type: "" }], files: [file] }) });
    fireEvent.drop(zone, { dataTransfer: dataTransfer({ files: [file] }) });
    await settle();

    expect(initUpload).not.toHaveBeenCalled();
    expect(onImageQuery).toHaveBeenCalledTimes(1);
  });

  it("keeps the class through the drag: later dragenters inside do not change it", async () => {
    const onImageQuery = vi.fn();
    const { zone, getByTestId } = renderZone(onImageQuery);

    fireEvent.dragEnter(zone, { dataTransfer: dataTransfer({ files: [imageFile()] }) });
    fireEvent.dragEnter(getByTestId("inside"), { dataTransfer: dataTransfer({ files: [text()] }) });

    expect(screen.getByText(SEARCH_OVERLAY)).toBeInTheDocument();
  });

  it("classes again after the drag leaves", async () => {
    const onImageQuery = vi.fn();
    const { zone } = renderZone(onImageQuery);

    fireEvent.dragEnter(zone, { dataTransfer: dataTransfer({ files: [imageFile()] }) });
    expect(screen.getByText(SEARCH_OVERLAY)).toBeInTheDocument();
    fireEvent.dragLeave(zone, { dataTransfer: dataTransfer({ files: [imageFile()] }) });
    fireEvent.dragEnter(zone, { dataTransfer: dataTransfer({ files: [text()] }) });

    expect(screen.queryByText(UPLOAD_OVERLAY)).toBeNull();
    expect(screen.queryByText(SEARCH_OVERLAY)).toBeNull();
  });
});
