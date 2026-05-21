// AdminLayout test (RED phase)
//
// Choices:
// - The /admin layout component is at @/app/admin/layout (default export).
// - It renders <RestartBanner /> at the top and the layout's children below
//   when the viewer is admin.
// - When restart-status returns 403, layout renders a 403 message and NOT
//   the children. We model "is_admin_viewer === false" as a 403 from
//   /api/admin/config/restart-status.
// - When /api/admin/config/setup-status returns { completed: false },
//   layout calls router.replace('/setup').

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: replaceMock,
    refresh: vi.fn(),
  }),
  usePathname: () => "/admin",
}));

// RestartBanner is mocked to a sentinel so we can detect its presence.
vi.mock("@/components/RestartBanner", () => ({
  RestartBanner: () => <div data-testid="restart-banner" />,
}));

import AdminLayout from "@/app/admin/layout";

const mockFetch = vi.fn();

beforeEach(() => {
  replaceMock.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("AdminLayout", () => {
  it("renders RestartBanner and children when admin viewer", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/admin/config/setup-status") {
        return Promise.resolve(jsonResponse({ completed: true }));
      }
      if (url === "/api/admin/config/restart-status") {
        return Promise.resolve(jsonResponse({ pending: false, files: [] }));
      }
      return Promise.resolve(jsonResponse({}));
    });
    render(
      <AdminLayout>
        <div data-testid="child">child content</div>
      </AdminLayout>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("restart-banner")).toBeInTheDocument();
    });
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("redirects to /unlock when not an admin viewer (restart-status returns 403)", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/admin/config/setup-status") {
        return Promise.resolve(jsonResponse({ completed: true }));
      }
      if (url === "/api/admin/config/restart-status") {
        return Promise.resolve(jsonResponse({ detail: "forbidden" }, 403));
      }
      return Promise.resolve(jsonResponse({}));
    });
    render(
      <AdminLayout>
        <div data-testid="child">child content</div>
      </AdminLayout>,
    );
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/unlock?redirect=/admin");
    });
    expect(screen.queryByTestId("child")).toBeNull();
  });

  it("does not render children while gate probe is pending", async () => {
    // Hold both fetches indefinitely so the layout stays in "loading".
    mockFetch.mockImplementation(() => new Promise(() => {}));
    render(
      <AdminLayout>
        <div data-testid="child">child content</div>
      </AdminLayout>,
    );
    // Children must not flash even on the very first paint.
    expect(screen.queryByTestId("child")).toBeNull();
    expect(screen.queryByTestId("restart-banner")).toBeNull();
  });

  it("redirects to /setup when setup-status.completed is false", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/admin/config/setup-status") {
        return Promise.resolve(jsonResponse({ completed: false }));
      }
      if (url === "/api/admin/config/restart-status") {
        return Promise.resolve(jsonResponse({ pending: false, files: [] }));
      }
      return Promise.resolve(jsonResponse({}));
    });
    render(
      <AdminLayout>
        <div data-testid="child">child content</div>
      </AdminLayout>,
    );
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/setup");
    });
  });
});
