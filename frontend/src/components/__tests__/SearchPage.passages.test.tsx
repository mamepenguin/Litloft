import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

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

const handed = () => browser.props.at(-1);

describe("SPEC-CORE-040 I17 the page carries the chosen view down", () => {
  beforeEach(() => {
    browser.props = [];
  });

  it("hands Files over when the URL names no view", () => {
    renderAt("q=cats&include_scene_clip=true");

    expect(handed()?.show).toBeUndefined();
    expect(handed()?.includeSceneClip).toBe(true);
  });

  it("hands Passages over in the view the URL names", () => {
    renderAt("q=cats&show=passages&include_scene_clip=true");

    expect(handed()?.show).toBe("passages");
    expect(handed()?.includeSceneClip).toBe(true);
  });

  it("keeps show for a blank query too, leaving the meaning search to decide", () => {
    renderAt("show=passages");

    expect(handed()?.show).toBe("passages");
  });
});
