import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { accentFills } from "@/__tests__/helpers/accentFills";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  // getTranslations stub: keyless -> key itself; with values, encode
  // them so tests can assert what the page passed (name/count).
  t: vi.fn((key: string, values?: Record<string, unknown>) => {
    if (key === "greeting") return `greeting:${values?.name}`;
    if (key === "fileCount") return `count:${values?.count}`;
    return key;
  }),
}));

vi.mock("next/headers", () => ({
  cookies: () => mocks.cookies(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => mocks.t,
}));

const fetchSpy = vi.fn();
const originalFetch = globalThis.fetch;
let drivesResponse: unknown[] = [];
let authStatusResponse: unknown = {
  unlocked_groups: [],
  has_protected_drives: false,
};

import Home from "../page";

function setCookie(viewer?: string) {
  mocks.cookies.mockResolvedValue({
    get: (name: string) =>
      name === "lit_viewer" && viewer !== undefined
        ? { value: viewer }
        : undefined,
  });
}

function setDrives(drives: unknown[]) {
  drivesResponse = drives;
}

function setAuthStatus(status: unknown) {
  authStatusResponse = status;
}

beforeEach(() => {
  fetchSpy.mockReset();
  mocks.cookies.mockReset();
  mocks.t.mockClear();
  globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
  fetchSpy.mockImplementation(async (url: string) => {
    if (url === "http://backend:8000/api/drives") {
      return { ok: true, json: async () => drivesResponse };
    }
    if (url === "http://backend:8000/api/auth/status") {
      return { ok: true, json: async () => authStatusResponse };
    }
    return { ok: false, json: async () => ({}) };
  });
  setCookie(undefined);
  setDrives([]);
  setAuthStatus({ unlocked_groups: [], has_protected_drives: false });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("/ root home (Server Component)", () => {
  it("heads the page once, over the drive list it is about", async () => {
    // The wordmark used to sit in a bordered card with a tagline under
    // it, and "Drives" was a second heading directly below — two
    // headings and a fixed sentence above the only content on the page.
    setDrives([{ name: "Media", protected: false, file_count: 3 }]);
    render(await Home());
    const top = screen.getAllByRole("heading", { level: 1 });
    expect(top).toHaveLength(1);
    expect(top[0].textContent).toBe("Litloft");
    // No second heading over the grid, and none inside the cells either:
    // a grid of drive names is not a set of document sections
    // (`card-titles.test.ts`).
    expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
    expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
    expect(screen.queryByText("tagline")).toBeNull();
    expect(screen.queryByText("title")).toBeNull();
  });

  it("does not render a greeting when no lit_viewer cookie is set", async () => {
    setCookie(undefined);
    render(await Home());
    expect(screen.queryByText(/^greeting:/)).toBeNull();
  });

  it("renders a server-side greeting from the lit_viewer cookie", async () => {
    setCookie(encodeURIComponent("Alice"));
    render(await Home());
    expect(screen.getByText("greeting:Alice")).toBeTruthy();
  });

  it("forwards only access_token upstream, never lit_viewer (JWT/viewer orthogonality)", async () => {
    // design-decisions.md: keep the access JWT and the personal-identity
    // lit_viewer cookie orthogonal — lit_viewer must never reach the backend.
    mocks.cookies.mockResolvedValue({
      get: (name: string) =>
        name === "access_token"
          ? { value: "jwt-abc" }
          : name === "lit_viewer"
            ? { value: encodeURIComponent("Alice") }
            : undefined,
    });
    await Home();
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://backend:8000/api/drives",
      expect.objectContaining({
        headers: { Cookie: "access_token=jwt-abc" },
      }),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://backend:8000/api/auth/status",
      expect.objectContaining({
        headers: { Cookie: "access_token=jwt-abc" },
      }),
    );
    for (const [, init] of fetchSpy.mock.calls) {
      const cookieHeader = (init?.headers as HeadersInit | undefined) as
        | Record<string, string>
        | undefined;
      expect(cookieHeader?.Cookie ?? "").not.toContain("lit_viewer");
    }
  });

  it("sanitizes the cookie nickname (decode + strip bidi/zero-width)", async () => {
    // %-encoded "Al\u200FIce" with an RLM (denylist range \u200b-\u200f).
    setCookie(encodeURIComponent("Al\u200fice"));
    render(await Home());
    expect(screen.getByText("greeting:Alice")).toBeTruthy();
  });

  it("ignores a malformed (undecodable) cookie without throwing", async () => {
    setCookie("%E0%A4%A"); // invalid percent-encoding
    const el = await Home();
    render(el);
    expect(screen.queryByText(/^greeting:/)).toBeNull();
  });

  it("shows a file count per drive", async () => {
    setDrives([{ name: "Media", protected: false, file_count: 1234 }]);
    render(await Home());
    expect(screen.getByText("count:1234")).toBeTruthy();
    const link = screen.getByRole("link", { name: /Media/ });
    expect(link.getAttribute("href")).toBe("/drive/Media");
  });

  it("shows an empty-drive label instead of a count when file_count is 0", async () => {
    setDrives([{ name: "Empty", protected: false, file_count: 0 }]);
    render(await Home());
    expect(screen.getByText("emptyDrive")).toBeTruthy();
    expect(screen.queryByText(/^count:/)).toBeNull();
  });

  it("renders the empty state when there are no drives", async () => {
    setDrives([]);
    render(await Home());
    expect(screen.getByText("empty")).toBeTruthy();
    expect(screen.getByText("emptyDescription")).toBeTruthy();
  });

  it("ends the grid with a way in to what is still locked", async () => {
    setDrives([{ name: "Media", protected: false, file_count: 10 }]);
    setAuthStatus({
      unlocked_groups: [],
      has_protected_drives: true,
      is_admin: false,
    });
    const { container } = render(await Home());
    const link = screen.getByRole("link", { name: /unlockAccess/ });
    expect(link.getAttribute("href")).toBe("/unlock");

    // The last cell of the same grid, not a footnote under the page.
    const grid = container.querySelector(".grid")!;
    expect(grid.contains(link)).toBe(true);
    expect(grid.lastElementChild).toBe(link);
    // No size of its own: it is a grid child like the others, so the two
    // cells match at every column count without either one saying a width.
    expect(link.className).not.toMatch(/\b(w-|h-|min-w-|max-w-)/);

    // ...and the same box, which is not the same thing. A grid row
    // stretches its cells to the tallest, so a difference only shows at
    // one column — where the outlined cell came out 2px taller than the
    // filled one until the filled one grew a transparent border of its
    // own. Measured at 375 / 400 / 430: 80 vs 82.
    const drive = screen.getByRole("link", { name: /Media/ });
    const boxOf = (el: Element) =>
      el.className
        .split(/\s+/)
        .filter((c) => /^(p-|rounded-|border($|-\d))/.test(c))
        .sort();
    expect(boxOf(link)).toEqual(boxOf(drive));
  });

  /**
   * The one check that keeps the access rule from leaking out of the
   * backend. A locked drive is hidden by 404 rather than merely closed
   * (`design-decisions.md`, Access control), so this card must not name
   * what is behind it — not the drive, not how many, not the group.
   */
  it("says nothing about what is behind the lock", async () => {
    setDrives([{ name: "Media", protected: false, file_count: 10 }]);
    setAuthStatus({
      unlocked_groups: ["staff"],
      has_protected_drives: true,
      is_admin: false,
    });
    render(await Home());
    const card = screen.getByRole("link", { name: /unlockAccess/ });
    const text = card.textContent ?? "";
    expect(text.trim()).toBe("unlockAccess");
    for (const leak of ["Media", "10", "count:", "staff"]) {
      expect(text).not.toContain(leak);
    }
  });

  it("offers no way in when the viewer already holds every protected drive", async () => {
    setDrives([{ name: "Media", protected: false, file_count: 10 }]);
    setAuthStatus({
      unlocked_groups: ["staff"],
      has_protected_drives: true,
      is_admin: true,
    });
    render(await Home());
    expect(screen.queryByRole("link", { name: /unlockAccess/ })).toBeNull();
  });

  it("offers no way in when nothing is protected at all", async () => {
    setDrives([{ name: "Media", protected: false, file_count: 10 }]);
    setAuthStatus({
      unlocked_groups: [],
      has_protected_drives: false,
      is_admin: false,
    });
    render(await Home());
    expect(screen.queryByRole("link", { name: /unlockAccess/ })).toBeNull();
  });

  /**
   * Nothing unlocked yet is the state where the entry matters most, and
   * it is also the one where the empty state would otherwise be the whole
   * page — a reader told "no drives" with no way to say otherwise.
   */
  it("shows the entry beneath the empty state when only locked drives exist", async () => {
    setDrives([]);
    setAuthStatus({
      unlocked_groups: [],
      has_protected_drives: true,
      is_admin: false,
    });
    const { container } = render(await Home());
    expect(screen.getByText("empty")).toBeTruthy();
    const link = screen.getByRole("link", { name: /unlockAccess/ });
    const grid = container.querySelector(".grid")!;
    expect(within(grid as HTMLElement).getAllByRole("link")).toHaveLength(1);
    expect(
      screen.getByText("empty").compareDocumentPosition(link) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  /**
   * 裁定 R2 — `/` is under the accent budget like every other screen, and
   * it spends nothing today. Asserted so that the locked-drive card, the
   * one thing on this page that could reach for a fill, cannot take it.
   */
  it("spends no accent fill", async () => {
    setDrives([
      { name: "Media", protected: false, file_count: 10 },
      { name: "Docs", protected: true, file_count: 2 },
    ]);
    setAuthStatus({
      unlocked_groups: [],
      has_protected_drives: true,
      is_admin: false,
    });
    const { container } = render(await Home());
    expect(accentFills(container)).toEqual([]);
  });
});
