/**
 * SPEC-ADDON-170 I3: an old Pickup page bookmark lands on the not-found page.
 */
import { Component, type ReactNode } from "react";
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const NOT_FOUND = "NEXT_NOT_FOUND";

const nav = vi.hoisted(() => ({
  params: { name: "family", addon: "intelligence", slug: "pickup" } as Record<string, string>,
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

describe("SPEC-ADDON-170 I3 /drive/{drive}/addons/intelligence/pickup", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return [];
        }
      },
    );
    nav.notFound.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function caughtFor(slug: string): Promise<string | null> {
    nav.notFound.mockClear();
    nav.params = { name: "family", addon: "intelligence", slug };
    const { container, unmount } = render(
      <Boundary>
        <DriveScopedAddonSubpage />
      </Boundary>,
    );
    await waitFor(() => expect(nav.notFound).toHaveBeenCalled(), { timeout: 5000 });
    const caught = container.querySelector("[data-testid='caught']")?.textContent ?? null;
    unmount();
    return caught;
  }

  it("renders the not-found page, the same as a subpage intelligence never shipped", async () => {
    const pickup = await caughtFor("pickup");
    const neverShipped = await caughtFor("no-such-subpage");
    expect(pickup).toBe(NOT_FOUND);
    expect(pickup).toBe(neverShipped);
  });
});
