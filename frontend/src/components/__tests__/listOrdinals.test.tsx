import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";

import { FileList } from "../FileList";
import type { FileItem } from "@/types";

vi.mock("next/link", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));
vi.mock("@/components/AddonSlot", () => ({ AddonSlot: () => null }));
vi.mock("@/components/ClipboardProvider", () => ({
  useClipboard: () => ({ isCut: () => false }),
}));

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const CORE_SRC = resolve(REPO_ROOT, "frontend/src");

/** Every file that renders a `<FileList>`, tests excluded. */
function fileListCallers(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      if (entry.name === "__tests__" || entry.name === "addons") continue;
      if (!existsSync(full)) continue;
      if (statSync(full).isDirectory()) walk(full);
      else if (
        /\.tsx$/.test(entry.name) &&
        /<FileList\b/.test(readFileSync(full, "utf-8"))
      ) {
        out.push(relative(REPO_ROOT, full));
      }
    }
  };
  walk(CORE_SRC);
  return out;
}

const track = (n: number): FileItem => ({
  image_width: null,
  image_height: null,
  id: `track-${n}`,
  filename: `${n}.mp3`,
  title: `Track ${n}`,
  description: "",
  drive: "main",
  folder_path: "album",
  file_type: "audio",
  mime_type: "audio/mpeg",
  thumbnail_url: "",
  has_thumbnail: false,
  file_size: 1000,
  duration: 200,
  liked_at: null,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: null,
  missing_since: null,
  trust_tier: "verified",
  trust_reviewed_at: null,
  created_at: "2026-01-01T00:00:00",
  updated_at: "2026-01-01T00:00:00",
});

const tracks = [track(1), track(2), track(3)];

describe("numbering a list", () => {
  it("numbers the rows from one when asked", () => {
    // Unpadded, matching `CollectionItemsPane`, which numbers the same
    // items on the same screen.
    render(<FileList files={tracks} showOrdinals />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("numbers by position in the list, not by the file's own id", () => {
    // A collection stores a `position` per item, and reordering leaves
    // gaps in it. Numbering from the array is what makes the column
    // read 1, 2, 3 rather than 1, 2, 4.
    render(<FileList files={[track(9), track(4)]} showOrdinals />);
    const rows = screen.getAllByText(/^Track \d$/);
    expect(rows.map((r) => r.textContent)).toEqual(["Track 9", "Track 4"]);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.queryByText("9")).toBeNull();
    expect(screen.queryByText("4")).toBeNull();
  });

  it("draws no numbers when not asked", () => {
    // The folder listing's order is a sort the reader chose and can
    // change, so a fixed number beside each row would name a position
    // that means nothing. Asserted as an absence on the same rows that
    // carry numbers above, so "no numbers" cannot pass by rendering
    // nothing at all.
    render(<FileList files={tracks} />);
    expect(screen.getAllByText(/^Track \d$/)).toHaveLength(3);
    for (const n of ["1", "2", "3"]) {
      expect(screen.queryByText(n)).toBeNull();
    }
  });
});

describe("who asks for numbers", () => {
  it("is the collection view, and nothing else", () => {
    // A number beside a row is a claim that the order means something.
    // It does in a collection, which is an ordered thing; it does not in
    // a folder, where the order is a sort the reader can change from the
    // toolbar. Scanned over the callers rather than asserted per screen,
    // so a fifth caller cannot pick it up unnoticed.
    const callers = [
      "frontend/src/components/CollectionDetail.tsx",
      "frontend/src/components/RootFileListing.tsx",
      "frontend/src/components/folder/FolderContent.tsx",
      "frontend/src/components/folder/RightPaneFolder.tsx",
    ];
    const asking = callers.filter((rel) =>
      /showOrdinals/.test(
        readFileSync(resolve(REPO_ROOT, rel), "utf-8"),
      ),
    );
    expect(asking).toEqual(["frontend/src/components/CollectionDetail.tsx"]);

    // And that the population is the real one: every file that renders a
    // `<FileList>`, found rather than listed.
    expect(new Set(fileListCallers())).toEqual(new Set(callers));
  });
});
