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

let params = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useParams: () => ({ name: "media" }),
  useSearchParams: () => params,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/drive/media/search",
}));

import SearchPage from "@/app/drive/[name]/search/page";

function renderPage() {
  return render(<SearchPage />);
}

const handed = () => browser.props.at(-1);

beforeEach(() => {
  browser.props = [];
  params = new URLSearchParams();
});

describe("SPEC-CORE-039 I21 a filtered query reaches the results page as written", () => {
  it.each([
    ["a tag operator", "cats tag:pets"],
    ["a type operator", "cats type:video"],
    ["a favourite operator", "is:favorite cats"],
  ])("keeps the operators in the query it hands over for %s", (_name, q) => {
    params = new URLSearchParams({ q, include_scene_clip: "true" });

    renderPage();

    expect(handed()?.searchQuery).toBe(q);
    expect(handed()?.includeSceneClip).toBe(true);
  });

  it("mounts no addon slot of its own, filtered or not", () => {
    params = new URLSearchParams({ q: "cats", include_scene_clip: "true" });

    const filtered = renderPage();
    expect(filtered.container.querySelector('[data-testid^="slot-"]')).toBeNull();
    filtered.unmount();

    params = new URLSearchParams({ q: "cats tag:pets", include_scene_clip: "true" });
    const unfiltered = renderPage();
    expect(unfiltered.container.querySelector('[data-testid^="slot-"]')).toBeNull();
    expect(screen.getByTestId("folder-browser")).toBeInTheDocument();
  });
});
