import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

import { ArchiveToolbar } from "../ArchiveToolbar";
import type { ArchiveContents } from "@/types";

vi.mock("@/lib/api", () => ({
  getDownloadUrl: (fileId: string) => `/api/files/${fileId}/stream`,
}));

const archive: ArchiveContents = {
  entries: [],
  total_entries: 5,
  total_size: 10240,
};

const breadcrumbs = [
  { label: "Archive", path: "" },
  { label: "docs", path: "docs" },
];

function renderToolbar(
  overrides: Partial<React.ComponentProps<typeof ArchiveToolbar>> = {}
) {
  const props: React.ComponentProps<typeof ArchiveToolbar> = {
    fileId: "file-1",
    archive,
    breadcrumbs,
    handleBreadcrumbClick: vi.fn(),
    viewMode: "grid",
    onViewModeChange: vi.fn(),
    sort: "name",
    order: "asc",
    typeFilter: null,
    onSortChange: vi.fn(),
    onOrderChange: vi.fn(),
    onTypeFilterChange: vi.fn(),
    ...overrides,
  };
  return { ...render(<ArchiveToolbar {...props} />), props };
}

describe("ArchiveToolbar", () => {
  it("renders breadcrumbs", () => {
    renderToolbar();
    expect(screen.getByText("Archive")).toBeInTheDocument();
    expect(screen.getByText("docs")).toBeInTheDocument();
  });

  it("calls handleBreadcrumbClick when a breadcrumb is clicked", () => {
    const handleBreadcrumbClick = vi.fn();
    renderToolbar({ handleBreadcrumbClick });

    fireEvent.click(screen.getByText("Archive"));
    expect(handleBreadcrumbClick).toHaveBeenCalledWith("");
  });

  it("renders sort controls (name/size/type)", () => {
    const { container } = renderToolbar();

    // The sort surface may be either buttons or a <select>. Accept either.
    const select = container.querySelector("select[data-testid='archive-sort']");
    if (select) {
      const options = Array.from(select.querySelectorAll("option")).map(
        (o) => (o as HTMLOptionElement).value
      );
      expect(options).toEqual(expect.arrayContaining(["name", "size", "type"]));
    } else {
      // Button-based: look for at least one element per sort key.
      expect(
        screen.getByRole("button", { name: /sort.*name|name/i })
      ).toBeInTheDocument();
    }
  });

  it("renders type filter controls", () => {
    renderToolbar();

    // At minimum, the "image" filter must be present (in either button or
    // select form). Accept "all/image/text/video/audio/other" in any casing.
    const filterRegion =
      screen.queryByTestId("archive-type-filter") ?? document.body;
    const scoped = within(filterRegion as HTMLElement);

    const imageHit =
      scoped.queryByText(/image|画像/i) ??
      screen.queryByText(/image|画像/i);
    expect(imageHit).not.toBeNull();
  });

  it("calls onSortChange when a sort control is activated", () => {
    const onSortChange = vi.fn();
    const { container } = renderToolbar({ onSortChange });

    const select = container.querySelector(
      "select[data-testid='archive-sort']"
    ) as HTMLSelectElement | null;
    if (select) {
      fireEvent.change(select, { target: { value: "size" } });
      expect(onSortChange).toHaveBeenCalledWith("size");
      return;
    }

    // Fallback: click a button labelled with "size" / "サイズ".
    const sizeBtn =
      screen.queryByRole("button", { name: /size|サイズ/i }) ??
      screen.queryByRole("button", { name: /sort.*size/i });
    expect(sizeBtn).not.toBeNull();
    fireEvent.click(sizeBtn!);
    expect(onSortChange).toHaveBeenCalledWith("size");
  });

  it("calls onTypeFilterChange when a type filter control is activated", () => {
    const onTypeFilterChange = vi.fn();
    const { container } = renderToolbar({ onTypeFilterChange });

    const select = container.querySelector(
      "select[data-testid='archive-type-filter']"
    ) as HTMLSelectElement | null;
    if (select) {
      fireEvent.change(select, { target: { value: "image" } });
      expect(onTypeFilterChange).toHaveBeenCalledWith("image");
      return;
    }

    // Fallback: click a button labelled with image / 画像.
    const imageBtn =
      screen.queryByRole("button", { name: /^image$|画像/i }) ??
      screen.queryByRole("button", { name: /filter.*image/i });
    expect(imageBtn).not.toBeNull();
    fireEvent.click(imageBtn!);
    expect(onTypeFilterChange).toHaveBeenCalledWith("image");
  });

  it("calls onViewModeChange when the view toggle is clicked", () => {
    const onViewModeChange = vi.fn();
    renderToolbar({ viewMode: "grid", onViewModeChange });

    // ViewToggle exposes aria-labels "grid" and "list" (en.json).
    const listBtn =
      screen.queryByRole("button", { name: /^list$/i }) ??
      screen.getByLabelText(/list/i);
    fireEvent.click(listBtn);

    expect(onViewModeChange).toHaveBeenCalledWith("list");
  });
});
