import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
