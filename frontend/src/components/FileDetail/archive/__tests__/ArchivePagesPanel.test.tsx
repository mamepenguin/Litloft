/**
 * The archive's flat index — the tab that answers "where is
 * `main.dart`" in a 2439-file zip, which the canvas cannot: the canvas
 * shows one level at a time.
 */
import { describe, it, expect, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";

import { ArchivePagesPanel, INITIAL_ROWS } from "../ArchivePagesPanel";
import { ArchiveContentsStore } from "@/lib/archiveController";
import type { ArchiveEntry } from "@/types";

vi.mock("@/components/FileTypeIcon", () => ({
  FileTypeIcon: ({ fileType }: { fileType: string }) => (
    <span data-testid={`icon-${fileType}`} />
  ),
}));

function entry(path: string, overrides: Partial<ArchiveEntry> = {}): ArchiveEntry {
  const is_dir = path.endsWith("/");
  return {
    path,
    filename: is_dir ? path.slice(0, -1).split("/").pop()! : path.split("/").pop()!,
    file_size: 10,
    compressed_size: 5,
    file_type: "other",
    mime_type: "text/plain",
    is_dir,
    ...overrides,
  };
}

function mount(entries: ArchiveEntry[]) {
  const store = new ArchiveContentsStore();
  store.set({ entries, currentPath: "" });
  const opened: ArchiveEntry[] = [];
  store.setOpener((e) => opened.push(e));
  const view = render(<ArchivePagesPanel controller={store} />);
  return { store, opened, ...view };
}

const rows = () => screen.queryAllByTestId("archive-index-row");
const filter = () => screen.getByTestId("archive-index-filter");

const project: ArchiveEntry[] = [
  entry("lib/"),
  entry("lib/main.dart"),
  entry("lib/src/"),
  entry("lib/src/widgets.dart"),
  entry("README.md"),
];

describe("ArchivePagesPanel", () => {
  it("lists the whole archive, not the level", () => {
    mount(project);
    expect(rows()).toHaveLength(5);
    expect(screen.getByText("lib/src/widgets.dart")).toBeInTheDocument();
  });

  it("narrows to a substring of the path", () => {
    mount(project);
    fireEvent.change(filter(), { target: { value: "main" } });
    expect(rows().map((r) => r.getAttribute("title"))).toEqual([
      "lib/main.dart",
    ]);
  });

  it("matches a directory segment as well as a filename", () => {
    mount(project);
    fireEvent.change(filter(), { target: { value: "src" } });
    expect(rows().map((r) => r.getAttribute("title"))).toEqual([
      "lib/src/",
      "lib/src/widgets.dart",
    ]);
  });

  it("says so when nothing matches", () => {
    mount(project);
    fireEvent.change(filter(), { target: { value: "nothing-here" } });
    expect(rows()).toHaveLength(0);
    expect(screen.getByText("Nothing matches")).toBeInTheDocument();
  });

  it("hands a pressed row to the viewer", () => {
    const { opened } = mount(project);
    fireEvent.click(screen.getByTitle("lib/src/widgets.dart"));
    expect(opened.map((e) => e.path)).toEqual(["lib/src/widgets.dart"]);
  });

  it("bounds the first render of a very large archive", () => {
    const many = Array.from({ length: INITIAL_ROWS + 40 }, (_, i) =>
      entry(`src/file-${i}.dart`),
    );
    mount(many);
    expect(rows()).toHaveLength(INITIAL_ROWS);
    expect(screen.getByTestId("archive-index-overflow")).toHaveTextContent(
      "40 more",
    );
  });

  it("reaches an entry past the bound through the filter", () => {
    const many = Array.from({ length: INITIAL_ROWS + 40 }, (_, i) =>
      entry(`src/file-${i}.dart`),
    );
    mount(many);
    fireEvent.change(filter(), {
      target: { value: `file-${INITIAL_ROWS + 39}.` },
    });
    expect(rows().map((r) => r.getAttribute("title"))).toEqual([
      `src/file-${INITIAL_ROWS + 39}.dart`,
    ]);
    expect(screen.queryByTestId("archive-index-overflow")).toBeNull();
  });

  it("follows the store when the archive finishes loading", () => {
    const { store } = mount([]);
    expect(rows()).toHaveLength(0);
    act(() => store.set({ entries: project, currentPath: "" }));
    expect(rows()).toHaveLength(5);
  });
});
