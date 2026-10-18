import { act, render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ImageCanvas } from "../ImageCanvas";
import type { FileItem } from "@/types";

vi.mock("@/lib/api", () => ({
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
}));

function makeFile(overrides: Partial<FileItem> = {}): FileItem {
  return {
    id: "f1",
    title: "photo",
    file_type: "image",
    mime_type: "image/heic",
    has_thumbnail: true,
    image_width: 3024,
    image_height: 4032,
    ...overrides,
  } as FileItem;
}

const canvas = () => document.querySelector("[data-image-canvas]") as HTMLElement;

describe("ImageCanvas", () => {
  it("reserves the box from the file's own dimensions", () => {
    render(<ImageCanvas file={makeFile()} />);

    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("width", "3024");
    expect(img).toHaveAttribute("height", "4032");
  });

  it("holds the thumbnail under the picture, not behind it", () => {
    render(<ImageCanvas file={makeFile()} />);

    expect(canvas().style.backgroundImage).toContain("/api/files/f1/thumbnail");
    expect(screen.getByRole("img").style.backgroundImage).toBe("");
  });

  it("keeps the picture out of sight until it has decoded", () => {
    render(<ImageCanvas file={makeFile()} />);
    const img = screen.getByRole("img");

    expect(img.style.opacity).toBe("0");

    fireEvent.load(img);

    expect(img.style.opacity).toBe("1");
  });

  it("hides the next picture again when the file changes", () => {
    const view = render(<ImageCanvas file={makeFile()} />);
    fireEvent.load(screen.getByRole("img"));
    expect(screen.getByRole("img").style.opacity).toBe("1");

    view.rerender(<ImageCanvas file={makeFile({ id: "f2" })} />);

    expect(screen.getByRole("img").style.opacity).toBe("0");
  });

  it("holds nothing under a picture that has no thumbnail", () => {
    render(<ImageCanvas file={makeFile({ has_thumbnail: false })} />);

    expect(canvas().style.backgroundImage).toBe("");
  });

  it("reserves nothing when the dimensions are unknown", () => {
    render(
      <ImageCanvas file={makeFile({ image_width: null, image_height: null })} />,
    );

    const img = screen.getByRole("img");
    expect(img).not.toHaveAttribute("width");
    expect(img).not.toHaveAttribute("height");
  });
});

type Pending = { resolve: () => void; reject: (e: Error) => void };

describe("ImageCanvas once the picture has decoded (SPEC-CORE-007)", () => {
  let pending: Pending[];
  const original = Object.getOwnPropertyDescriptor(
    HTMLImageElement.prototype,
    "decode",
  );

  beforeEach(() => {
    pending = [];
    Object.defineProperty(HTMLImageElement.prototype, "decode", {
      configurable: true,
      value: () =>
        new Promise<void>((resolve, reject) => {
          pending.push({ resolve, reject });
        }),
    });
  });

  afterEach(() => {
    if (original) {
      Object.defineProperty(HTMLImageElement.prototype, "decode", original);
    } else {
      delete (HTMLImageElement.prototype as { decode?: unknown }).decode;
    }
  });

  const settle = async (each: (p: Pending) => void) => {
    const batch = pending.splice(0);
    await act(async () => {
      batch.forEach(each);
    });
  };

  const paintedBackgrounds = (root: HTMLElement) =>
    [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))]
      .map((el) => el.style.backgroundImage)
      .filter((value) => value !== "" && value !== "none");

  it("SPEC-CORE-007: keeps the thumbnail through load until decode resolves, then drops it", async () => {
    const view = render(<ImageCanvas file={makeFile()} />);

    fireEvent.load(screen.getByRole("img"));
    expect(canvas().style.backgroundImage).toContain("/api/files/f1/thumbnail");
    expect(pending.length).toBeGreaterThan(0);

    await settle((p) => p.resolve());

    expect(paintedBackgrounds(view.container)).toEqual([]);
    expect(screen.getByRole("img").style.opacity).toBe("1");
  });

  it("SPEC-CORE-007: a new file paints its own thumbnail again until its picture decodes", async () => {
    const view = render(<ImageCanvas file={makeFile()} />);
    fireEvent.load(screen.getByRole("img"));
    await settle((p) => p.resolve());
    expect(paintedBackgrounds(view.container)).toEqual([]);

    view.rerender(<ImageCanvas file={makeFile({ id: "f2" })} />);

    expect(canvas().style.backgroundImage).toContain("/api/files/f2/thumbnail");

    fireEvent.load(screen.getByRole("img"));
    await settle((p) => p.resolve());

    expect(paintedBackgrounds(view.container)).toEqual([]);
  });

  it("SPEC-CORE-007: a rejected decode keeps the thumbnail; the next file still drops its own", async () => {
    const view = render(<ImageCanvas file={makeFile()} />);
    fireEvent.load(screen.getByRole("img"));
    await settle((p) => p.reject(new Error("EncodingError")));

    expect(canvas().style.backgroundImage).toContain("/api/files/f1/thumbnail");

    view.rerender(<ImageCanvas file={makeFile({ id: "f2" })} />);
    fireEvent.load(screen.getByRole("img"));
    await settle((p) => p.resolve());

    expect(paintedBackgrounds(view.container)).toEqual([]);
  });

  it("SPEC-CORE-007: a decode that resolves after the file changed is ignored", async () => {
    const view = render(<ImageCanvas file={makeFile()} />);
    fireEvent.load(screen.getByRole("img"));
    const stale = pending.splice(0);
    expect(stale.length).toBeGreaterThan(0);

    view.rerender(<ImageCanvas file={makeFile({ id: "f2" })} />);
    const current = pending.splice(0);
    await act(async () => {
      stale.forEach((p) => p.resolve());
    });

    expect(canvas().style.backgroundImage).toContain("/api/files/f2/thumbnail");

    pending.push(...current);
    fireEvent.load(screen.getByRole("img"));
    await settle((p) => p.resolve());

    expect(paintedBackgrounds(view.container)).toEqual([]);
  });
});
