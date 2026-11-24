/**
 * SPEC-ADDON-158 I4: an old Find bookmark lands on the not-found page.
 */
import { Component, type ReactNode } from "react";
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const NOT_FOUND = "NEXT_NOT_FOUND";

const nav = vi.hoisted(() => ({
  params: { name: "family", addon: "intelligence", slug: "find" } as Record<string, string>,
  notFound: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useParams: () => nav.params,
  usePathname: () => `/drive/family/addons/${nav.params.addon}/${nav.params.slug}`,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  notFound: () => {
    nav.notFound();
    throw new Error(NOT_FOUND);
  },
}));

vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({
    addons: { intelligence: { label: "Intelligence", icon: "brain", scope: "both" } },
    catalogueDrive: "family",
    slots: {},
    loading: false,
    getSlotEntries: () => [],
    hasSlot: () => false,
  }),
  useAddonStatus: () => ({ features: {} }),
}));
vi.mock("@/components/CurrentDriveProvider", () => ({ useCurrentDrive: () => "family" }));

import DriveScopedAddonSubpage from "../page";

class Boundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    return this.state.error ? <div data-testid="caught">{this.state.error}</div> : this.props.children;
  }
}

describe("SPEC-ADDON-158 I4 /drive/{drive}/addons/intelligence/find", () => {
  beforeEach(() => {
    nav.notFound.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders the not-found page, as any unknown addon subpage does", async () => {
    nav.params = { name: "family", addon: "intelligence", slug: "find" };
    const { getByTestId } = render(
      <Boundary>
        <DriveScopedAddonSubpage />
      </Boundary>,
    );

    await waitFor(() => expect(nav.notFound).toHaveBeenCalled(), { timeout: 5000 });
    expect(getByTestId("caught").textContent).toBe(NOT_FOUND);
  });

  it("still loads a subpage intelligence keeps", async () => {
    nav.params = { name: "family", addon: "intelligence", slug: "search-compare" };
    const { container } = render(
      <Boundary>
        <DriveScopedAddonSubpage />
      </Boundary>,
    );

    await waitFor(() => expect(container.innerHTML).not.toBe(""), { timeout: 5000 });
    expect(nav.notFound).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain(NOT_FOUND);
    expect(container.querySelector('[data-testid="caught"]')).toBeNull();
  });
});
