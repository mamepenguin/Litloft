/**
 * SPEC-CORE-138 list rows, I13: the list row's date is `modified_at`, and
 * `updated_at` only when `modified_at` is NULL.
 */

import { beforeAll, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

beforeAll(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
      root = null;
      rootMargin = "";
      thresholds = [];
    },
  );
});

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/ClipboardProvider", () => ({
  useClipboard: () => ({
    clipboard: null,
    copy: vi.fn(),
    cut: vi.fn(),
    paste: vi.fn(),
    clear: vi.fn(),
    isCut: () => false,
  }),
}));

vi.mock("@/lib/api", () => ({
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
}));

import { FileListRow } from "../FileListRow";
import type { FileItemWithMatch } from "@/types";

const EDITED = "2019-03-04T05:06:07Z";
const TOUCHED = "2026-09-01T00:00:00Z";

function row(modifiedAt: string | null, updatedAt: string): string {
  const file = {
    id: "f1",
    filename: "quarterly-report.pdf",
    title: "Quarterly report",
    description: "",
    drive: "work",
    folder_path: "",
    file_type: "document",
    mime_type: "application/pdf",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 1024,
    duration: null,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    created_at: "2018-01-01T00:00:00Z",
    updated_at: updatedAt,
    modified_at: modifiedAt,
  } as unknown as FileItemWithMatch;
  const { container, unmount } = render(<FileListRow file={file} onContextMenu={vi.fn()} />);
  const text = container.textContent ?? "";
  unmount();
  return text;
}

describe("SPEC-CORE-138 I13 the list row's date", () => {
  it("shows modified_at when it is set", () => {
    expect(row(null, EDITED)).not.toBe(row(null, TOUCHED));

    expect(row(EDITED, TOUCHED)).toBe(row(null, EDITED));
  });

  it("falls back to updated_at when modified_at is NULL", () => {
    expect(row(null, TOUCHED)).not.toBe(row(EDITED, EDITED));

    expect(row(null, TOUCHED)).toBe(row(TOUCHED, EDITED));
  });
});
