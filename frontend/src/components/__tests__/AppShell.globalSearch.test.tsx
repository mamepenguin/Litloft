import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { AppShell } from "../AppShell";
import { useGlobalSearch, useSearchScope } from "../search/GlobalSearchProvider";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
}));

vi.mock("../CurrentDriveProvider", () => ({
  useCurrentDrive: () => "main",
}));

vi.mock("../ProfileProvider", () => ({
  useProfile: () => ({ nickname: null }),
}));

vi.mock("../Sidebar", () => ({ Sidebar: () => null }));
vi.mock("../quick-note/QuickNoteContainer", () => ({ QuickNoteContainer: () => null }));
vi.mock("../AddonSlot", () => ({ AddonSlot: () => null }));

vi.mock("@/lib/api", () => ({
  getDriveFiles: vi.fn().mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 8 } }),
  getWatchHistory: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/semanticSearch", () => ({
  fetchSemanticHits: vi.fn().mockResolvedValue([]),
  isSemanticSearchAvailable: vi.fn().mockResolvedValue(false),
}));

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

const NOTES = { label: "Notes", type: "text" } as const;

function PageButton() {
  useSearchScope(NOTES);
  const search = useGlobalSearch();
  return (
    <button type="button" onClick={() => search.open()}>
      page-go-to
    </button>
  );
}

describe("AppShell global search", () => {
  it("lets page content open the header's search modal, scoped", () => {
    render(
      <AppShell>
        <PageButton />
      </AppShell>,
    );
    fireEvent.click(screen.getByRole("button", { name: "page-go-to" }));
    expect(screen.getByRole("button", { name: "Remove the Notes scope" })).toBeInTheDocument();
  });
});
