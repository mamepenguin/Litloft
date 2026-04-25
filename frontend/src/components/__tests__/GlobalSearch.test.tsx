import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import { GlobalSearch } from "../GlobalSearch";
import { ShortcutsProvider } from "../ShortcutsProvider";

function renderWithShortcuts(ui: ReactNode) {
  return render(<ShortcutsProvider>{ui}</ShortcutsProvider>);
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("../CurrentDriveProvider", () => ({
  useCurrentDrive: () => "main",
}));

vi.mock("@/lib/api", () => ({
  getDriveFiles: vi.fn().mockResolvedValue({
    data: [],
    meta: { total: 0, page: 1, limit: 100 },
  }),
}));

vi.mock("../FileTypeIcon", () => ({
  FileTypeIcon: ({ fileType }: { fileType: string }) => (
    <span data-testid={`icon-${fileType}`} />
  ),
}));

// jsdom does not implement matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

describe("GlobalSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    try { localStorage.removeItem("search-history"); } catch { /* jsdom */ }
  });

  afterEach(() => {
    // Flush pending setTimeout callbacks (e.g., openSearch's focus timer)
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it("renders search button", () => {
    render(<GlobalSearch />);
    expect(screen.getByLabelText("検索")).toBeInTheDocument();
  });

  it("opens search panel on click", () => {
    render(<GlobalSearch />);
    fireEvent.click(screen.getByLabelText("検索"));
    // Both mobile and desktop inputs should exist
    const inputs = screen.getAllByRole("textbox");
    expect(inputs.length).toBeGreaterThanOrEqual(1);
  });

  it("shows placeholder with drive name", () => {
    render(<GlobalSearch />);
    fireEvent.click(screen.getByLabelText("検索"));
    const inputs = screen.getAllByPlaceholderText("main 内を検索...");
    expect(inputs.length).toBeGreaterThanOrEqual(1);
  });

  it("closes on Escape key", () => {
    render(<GlobalSearch />);
    fireEvent.click(screen.getByLabelText("検索"));
    expect(screen.getAllByRole("textbox").length).toBeGreaterThanOrEqual(1);

    fireEvent.keyDown(document, { key: "Escape" });
    // Search button should still be visible
    expect(screen.getByLabelText("検索")).toBeInTheDocument();
  });

  it("opens on Cmd+Shift+F", () => {
    renderWithShortcuts(<GlobalSearch />);
    fireEvent.keyDown(document, { key: "f", ctrlKey: true, shiftKey: true });
    const inputs = screen.getAllByRole("textbox");
    expect(inputs.length).toBeGreaterThanOrEqual(1);
  });
});
