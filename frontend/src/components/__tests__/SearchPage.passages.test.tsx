import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

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
  useParams: () => ({ name: "main" }),
  useSearchParams: () => params,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/drive/main/search",
}));

import SearchPage from "@/app/drive/[name]/search/page";

function renderAt(query: string) {
  params = new URLSearchParams(query);
  return render(<SearchPage />);
}

const topSlotRendered = () =>
  screen.queryByTestId("slot-search-results-top") !== null;

describe("SPEC-CORE-040 I17 Passages renders no Scene candidates strip", () => {
  beforeEach(() => {
    slots.ids = [];
  });

  it("keeps the strip in Files", () => {
    renderAt("q=cats&include_scene_clip=true");

    expect(topSlotRendered()).toBe(true);
    expect(slots.ids).toContain("search-results-top");
  });

  it("leaves the strip out in Passages", () => {
    renderAt("q=cats&show=passages&include_scene_clip=true");

    expect(topSlotRendered()).toBe(false);
    expect(slots.ids).not.toContain("search-results-top");
  });

  it("keeps the Scene search toggle where it is in Passages", () => {
    renderAt("q=cats&show=passages");

    expect(screen.getByRole("checkbox")).toBeInTheDocument();
    expect(screen.getByTestId("folder-browser")).toBeInTheDocument();
  });

  it("keeps the strip for a query that runs no meaning search", () => {
    renderAt("show=passages");

    expect(topSlotRendered()).toBe(true);
  });
});
