import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const browser = vi.hoisted(() => ({ props: [] as Array<Record<string, unknown>> }));

vi.mock("@/components/FolderBrowser", () => ({
  FolderBrowser: (props: Record<string, unknown>) => {
    browser.props.push(props);
    return <div data-testid="folder-browser" />;
  },
}));

vi.mock("@/components/AddonSlot", () => ({
  AddonSlot: ({ id }: { id: string }) => <div data-testid={`slot-${id}`} />,
}));

let mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useParams: () => ({ name: "media" }),
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/drive/media/search",
}));

import SearchPage from "@/app/drive/[name]/search/page";

function renderPage() {
  return render(<SearchPage />);
}

const handed = () => browser.props.at(-1);

describe("SPEC-CORE-025 the page hands the results page the URL's search", () => {
  beforeEach(() => {
    browser.props = [];
    mockSearchParams = new URLSearchParams();
  });

  it("hands over the query, drive, scene flag, type and smart folder", () => {
    mockSearchParams = new URLSearchParams(
      "q=cats&type=video&smart_folder_id=sf1&include_scene_clip=true",
    );
    renderPage();

    expect(handed()).toMatchObject({
      driveName: "media",
      searchQuery: "cats",
      typeFilter: "video",
      smartFolderId: "sf1",
      includeSceneClip: true,
    });
  });

  it("hands over nothing the URL does not carry", () => {
    mockSearchParams = new URLSearchParams("q=cats");
    renderPage();

    expect(handed()).toMatchObject({
      searchQuery: "cats",
      typeFilter: null,
      smartFolderId: null,
      includeSceneClip: false,
    });
  });

  it("mounts no results-top slot of its own", () => {
    mockSearchParams = new URLSearchParams("q=cats&include_scene_clip=true");
    const { container } = renderPage();

    expect(screen.getByTestId("folder-browser")).toBeInTheDocument();
    expect(container.querySelector('[data-testid^="slot-"]')).toBeNull();
  });
});
