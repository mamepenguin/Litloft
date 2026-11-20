import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let search = new URLSearchParams();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main/apps/reading/shelf",
  useSearchParams: () => search,
  useParams: () => ({ name: "main" }),
  useRouter: () => ({ push: vi.fn(), replace, back: vi.fn() }),
}));

vi.mock("@/components/readingapp/ReadingShelfPage", () => ({
  parseGrouping: (by: string | null) => by,
  ReadingShelfPage: ({ onTargetChosen }: { onTargetChosen?: () => void }) => (
    <button type="button" onClick={() => onTargetChosen?.()}>
      choose a Target
    </button>
  ),
}));

const Route = (await import("@/app/drive/[name]/apps/reading/shelf/page")).default;

beforeEach(() => {
  replace.mockReset();
});

describe("SPEC-CORE-147 I5 a Target chosen on Reading's See all page", () => {
  it("drops tag, watch and folder from the URL by replace and keeps the rest", () => {
    search = new URLSearchParams("by=folder&key=Novels&tag=SF&watch=finished&folder=Comics&sort=title");
    render(<Route />);

    fireEvent.click(screen.getByRole("button", { name: "choose a Target" }));

    expect(replace).toHaveBeenCalledTimes(1);
    const href = new URL(String(replace.mock.calls[0][0]), "http://localhost");
    expect(href.searchParams.has("tag")).toBe(false);
    expect(href.searchParams.has("watch")).toBe(false);
    expect(href.searchParams.has("folder")).toBe(false);
    expect(href.searchParams.get("key")).toBe("Novels");
    expect(href.searchParams.get("sort")).toBe("title");
  });

  it("leaves a URL without filters alone", () => {
    search = new URLSearchParams("by=folder&key=Novels");
    render(<Route />);

    fireEvent.click(screen.getByRole("button", { name: "choose a Target" }));

    expect(replace).not.toHaveBeenCalled();
  });
});
