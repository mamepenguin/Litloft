import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Capture props passed to FolderBrowser by the search page so we can
// assert that URL params are forwarded correctly. We don't render the
// real FolderBrowser here — its behavior is covered separately.
const folderBrowserProps = vi.fn<(props: Record<string, unknown>) => void>();

vi.mock("@/components/FolderBrowser", () => ({
  FolderBrowser: (props: Record<string, unknown>) => {
    folderBrowserProps(props);
    return (
      <div
        data-testid="folder-browser"
        data-search-query={String(props.searchQuery ?? "")}
        data-type-filter={String(props.typeFilter ?? "")}
        data-drive={String(props.driveName ?? "")}
        data-smart-folder-id={String(props.smartFolderId ?? "")}
      />
    );
  },
}));

let mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useParams: () => ({ name: "media" }),
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/drive/media/search",
}));

import SearchPage from "@/app/drive/[name]/search/page";

describe("SearchPage", () => {
  beforeEach(() => {
    folderBrowserProps.mockReset();
    mockSearchParams = new URLSearchParams();
  });

  it("renders FolderBrowser with searchQuery from URL", () => {
    mockSearchParams = new URLSearchParams("q=foo");
    render(<SearchPage />);
    const node = screen.getByTestId("folder-browser");
    expect(node.getAttribute("data-search-query")).toBe("foo");
    expect(node.getAttribute("data-drive")).toBe("media");
  });

  it("propagates type filter from URL", () => {
    mockSearchParams = new URLSearchParams("q=foo&type=video");
    render(<SearchPage />);
    const node = screen.getByTestId("folder-browser");
    expect(node.getAttribute("data-type-filter")).toBe("video");
  });

  it("propagates smart_folder_id from URL", () => {
    mockSearchParams = new URLSearchParams("q=foo&smart_folder_id=sf123");
    render(<SearchPage />);
    const node = screen.getByTestId("folder-browser");
    expect(node.getAttribute("data-smart-folder-id")).toBe("sf123");
  });

  it("renders without crashing when q is empty", () => {
    mockSearchParams = new URLSearchParams();
    render(<SearchPage />);
    const node = screen.getByTestId("folder-browser");
    // Empty query is forwarded as an empty string; FolderBrowser handles
    // the empty-query rendering itself.
    expect(node.getAttribute("data-search-query")).toBe("");
  });
});
