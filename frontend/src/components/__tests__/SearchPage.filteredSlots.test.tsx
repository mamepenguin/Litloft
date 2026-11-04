import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/FolderBrowser", () => ({
  FolderBrowser: () => <div data-testid="folder-browser" />,
}));

const slots = vi.hoisted(() => ({ ids: [] as string[] }));
vi.mock("@/components/AddonSlot", () => ({
  AddonSlot: ({ id }: { id: string }) => {
    slots.ids.push(id);
    return <div data-testid={`slot-${id}`} />;
  },
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

beforeEach(() => {
  slots.ids = [];
  params = new URLSearchParams();
});

describe("SPEC-CORE-039 I21 a filtered query renders no Scene toggle and no slots", () => {
  it.each([
    ["a tag operator", "cats tag:pets"],
    ["a type operator", "cats type:video"],
    ["a favourite operator", "is:favorite cats"],
  ])("hides the toggle and search-results-top for %s", (_name, q) => {
    params = new URLSearchParams({ q, include_scene_clip: "true" });

    renderPage();

    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByTestId("slot-search-results-top")).toBeNull();
    expect(slots.ids).not.toContain("search-results-top");
  });

  it("keeps both for an unfiltered query", () => {
    params = new URLSearchParams({ q: "cats", include_scene_clip: "true" });

    renderPage();

    expect(screen.getByRole("checkbox")).toBeInTheDocument();
    expect(screen.getByTestId("slot-search-results-top")).toBeInTheDocument();
  });
});
