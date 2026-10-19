import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { SidebarTagsSection } from "../SidebarTagsSection";
import type { ScopedTags } from "../useSidebarData";

/**
 * The rest is expanded in place because there is no tag index page to send
 * anyone to.
 */

function tagsFor(count: number, folderPath: string | null = null): ScopedTags {
  return {
    resolvedScope: { drive: "main", folderPath },
    // Descending counts so the default "by count" sort keeps this order.
    items: Array.from({ length: count }, (_, i) => ({
      name: `tag${String(i).padStart(2, "0")}`,
      count: count - i,
    })),
  };
}

function props(tags: ScopedTags, folderPath: string | null = null) {
  return {
    drive: "main",
    currentFolderPath: folderPath,
    pathname: folderPath ? `/drive/main/${folderPath}` : "/drive/main",
    activeTag: null,
    activeView: null,
    tags,
    linkClass: () => "",
    close: vi.fn(),
  };
}

// The name lives in the row's first <span>; the trailing one is the count.
const tagRows = () =>
  screen.queryAllByRole("link").map((a) => a.querySelector("span")?.textContent ?? "");

describe("SidebarTagsSection — folding the long tail", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows all of them while they still fit", () => {
    render(<SidebarTagsSection {...props(tagsFor(8))} />);
    expect(tagRows()).toHaveLength(8);
    expect(screen.queryByText(/All tags/)).not.toBeInTheDocument();
  });

  it("keeps the first eight and counts the whole set in the row that opens it", () => {
    render(<SidebarTagsSection {...props(tagsFor(30))} />);

    expect(tagRows()).toHaveLength(8);
    expect(tagRows()[0]).toBe("tag00");
    expect(screen.getByText("All tags (30)")).toBeInTheDocument();
  });

  it("opens the rest in place, and the row that opened it goes away", () => {
    render(<SidebarTagsSection {...props(tagsFor(30))} />);
    fireEvent.click(screen.getByText("All tags (30)"));

    expect(tagRows()).toHaveLength(30);
    expect(screen.queryByText(/All tags/)).not.toBeInTheDocument();
  });

  it("folds again when the folder changes, because the list did too", () => {
    const { rerender } = render(<SidebarTagsSection {...props(tagsFor(30))} />);
    fireEvent.click(screen.getByText("All tags (30)"));
    expect(tagRows()).toHaveLength(30);

    rerender(<SidebarTagsSection {...props(tagsFor(30, "notes/2026"), "notes/2026")} />);

    expect(tagRows()).toHaveLength(8);
  });

  it("keeps the applied tag on screen even when it is not in the top eight", () => {
    // The fold ranks by count, so a rare tag is never in the first eight,
    // and this section is the only place its clearing click lives.
    const tags = tagsFor(30);
    const rare = tags.items[25].name;
    render(
      <SidebarTagsSection
        {...props(tags)}
        activeTag={rare}
        pathname="/drive/main"
      />,
    );

    expect(tagRows()).toContain(rare);
    expect(screen.getByText("All tags (30)")).toBeInTheDocument();
  });

  it("does not count the pinned row twice", () => {
    const tags = tagsFor(30);
    render(
      <SidebarTagsSection
        {...props(tags)}
        activeTag={tags.items[25].name}
        pathname="/drive/main"
      />,
    );
    // Eight ranked plus the one held on screen.
    expect(tagRows()).toHaveLength(9);
  });

  it("pins nothing when the applied tag already ranks", () => {
    const tags = tagsFor(30);
    render(
      <SidebarTagsSection
        {...props(tags)}
        activeTag={tags.items[0].name}
        pathname="/drive/main"
      />,
    );
    expect(tagRows()).toHaveLength(8);
  });

  it("keeps the same hrefs it always had — the fold is display only", () => {
    render(<SidebarTagsSection {...props(tagsFor(30))} />);
    expect(screen.getAllByRole("link")[0]).toHaveAttribute("href", "/drive/main?tag=tag00");
  });
});

describe("SidebarTagsSection — the heading says what it is counting", () => {
  it("is just the word when the scope is the whole drive", () => {
    render(<SidebarTagsSection {...props(tagsFor(3))} />);
    expect(screen.getByText("Tags")).toBeInTheDocument();
  });

  it("names the folder — last segment only — when scoped to one", () => {
    render(<SidebarTagsSection {...props(tagsFor(3, "notes/2026/spring"), "notes/2026/spring")} />);
    expect(screen.getByText("Tags — under spring")).toBeInTheDocument();
  });
});
