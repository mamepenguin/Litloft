import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { SearchQueryHeader } from "../SearchQueryHeader";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
  usePathname: () => "/drive/main/search",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

const mockGetDriveTags = vi.fn();

vi.mock("@/lib/api", () => ({
  getDriveTags: (...args: unknown[]) => mockGetDriveTags(...args),
}));

const pushed = () => {
  const raw = mockPush.mock.calls.at(-1)?.[0] as string | undefined;
  if (!raw) return null;
  const url = new URL(raw, "http://localhost");
  return { pathname: url.pathname, params: url.searchParams };
};

function renderHeader(overrides: Record<string, unknown> = {}) {
  return render(
    <SearchQueryHeader
      drive="main"
      query="cats"
      typeFilter={null}
      sort="relevance"
      order="desc"
      smartFolderId={null}
      includeSceneClip={false}
      {...overrides}
    />,
  );
}

function submit(query: string) {
  const field = screen.getByLabelText("Search query");
  fireEvent.change(field, { target: { value: query } });
  fireEvent.keyDown(field, { key: "Enter" });
}

describe("SPEC-CORE-040 I9 A2's submission keeps the chosen view", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/drive/main/search?q=cats&show=passages");
  });

  it("keeps show=passages in the URL of the new query", () => {
    renderHeader({ show: "passages" });
    submit("dogs");

    const url = pushed();
    expect(url?.pathname).toBe("/drive/main/search");
    expect(url?.params.get("q")).toBe("dogs");
    expect(url?.params.get("show")).toBe("passages");
  });

  it("keeps show=passages beside the type filter and Scene search", () => {
    renderHeader({
      show: "passages",
      typeFilter: "video",
      includeSceneClip: true,
    });
    submit("dogs");

    const params = pushed()!.params;
    expect(params.get("q")).toBe("dogs");
    expect(params.get("type")).toBe("video");
    expect(params.get("include_scene_clip")).toBe("true");
    expect(params.get("show")).toBe("passages");
  });

  it("adds no show parameter when the page shows files", () => {
    renderHeader();
    submit("dogs");

    expect(pushed()!.params.has("show")).toBe(false);
  });
});
