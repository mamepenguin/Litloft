import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import enMessages from "@/messages-core/en.json";

vi.mock("@/components/FolderBrowser", () => ({
  FolderBrowser: () => <div data-testid="folder-browser" />,
}));

const slotRenders = vi.hoisted(() => ({
  calls: [] as Array<{ id: string; props: Record<string, unknown> | undefined }>,
}));

const slotMode = vi.hoisted(() => ({ real: false }));

vi.mock("@/components/AddonSlot", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/AddonSlot")>();
  return {
    ...actual,
    AddonSlot: (p: { id: string; props?: Record<string, unknown> }) => {
      slotRenders.calls.push({ id: p.id, props: p.props });
      if (slotMode.real) return <actual.AddonSlot {...p} />;
      return <div data-testid={`slot-${p.id}`} />;
    },
  };
});

let mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useParams: () => ({ name: "media" }),
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/drive/media/search",
}));

import SearchPage from "@/app/drive/[name]/search/page";

function renderPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <SearchPage />
    </NextIntlClientProvider>,
  );
}

const topSlotProps = () =>
  slotRenders.calls.filter((c) => c.id === "search-results-top").at(-1)?.props;

describe("SearchPage search-results-top slot (SPEC-CORE-025)", () => {
  beforeEach(() => {
    slotRenders.calls = [];
    slotMode.real = false;
    mockSearchParams = new URLSearchParams();
  });

  it("renders the slot between the toggle row and the file list", () => {
    mockSearchParams = new URLSearchParams("q=cats");
    renderPage();

    const toggle = screen.getByRole("checkbox");
    const slot = screen.getByTestId("slot-search-results-top");
    const list = screen.getByTestId("folder-browser");
    expect(toggle.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(slot.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("hands the slot the query, drive, flag, type filter and smart folder from the URL", () => {
    mockSearchParams = new URLSearchParams(
      "q=cats&type=video&smart_folder_id=sf1&include_scene_clip=true",
    );
    renderPage();
    expect(topSlotProps()).toEqual({
      query: "cats",
      drive: "media",
      includeSceneClip: true,
      typeFilter: "video",
      smartFolderId: "sf1",
    });
  });

  it("hands the slot null filters and a false flag when the URL has none", () => {
    mockSearchParams = new URLSearchParams("q=cats");
    renderPage();
    expect(topSlotProps()).toEqual({
      query: "cats",
      drive: "media",
      includeSceneClip: false,
      typeFilter: null,
      smartFolderId: null,
    });
  });

  it.each([
    ["a type operator", "cats type:video"],
    ["a tag operator", "tag:pets cats"],
    ["a favorite operator", "is:favorite cats"],
  ])("renders the slot for a plain query but not for a query with %s", (_n, q) => {
    mockSearchParams = new URLSearchParams({ q: "cats", include_scene_clip: "true" });
    const plain = renderPage();
    expect(screen.getByTestId("slot-search-results-top")).toBeInTheDocument();
    plain.unmount();
    slotRenders.calls = [];

    mockSearchParams = new URLSearchParams({ q, include_scene_clip: "true" });
    renderPage();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByTestId("slot-search-results-top")).toBeNull();
    expect(slotRenders.calls.some((c) => c.id === "search-results-top")).toBe(false);
  });

  it("adds nothing to the page when no addon registers the slot", () => {
    slotMode.real = true;
    mockSearchParams = new URLSearchParams("q=cats&include_scene_clip=true");
    const { container } = renderPage();

    expect(topSlotProps()).toBeDefined();
    expect(screen.getByTestId("folder-browser")).toBeInTheDocument();
    const toggleRow = screen.getByRole("checkbox").closest("div")!;
    expect(toggleRow.nextElementSibling).toBe(screen.getByTestId("folder-browser"));
    expect(container.children).toHaveLength(2);
  });
});
