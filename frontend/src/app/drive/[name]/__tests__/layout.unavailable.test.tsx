/**
 * SPEC-CORE-125: a drive whose summary answers 404 shows one "can't open" state in place of
 * every route under /drive/<name>.
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiStatusError } from "@/lib/apiError";
import { treeEnabledStore } from "@/lib/treeEnabledStore";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  }),
});

let mockPathname = "/drive/work";
let mockSearchParams = new URLSearchParams();
let mockParams: Record<string, string | string[]> = { name: "work" };

vi.mock("next/navigation", () => ({
  useParams: () => mockParams,
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const mounts = { tree: 0, page: 0, pane: 0 };

vi.mock("@/components/folder/FolderTreePane", () => ({
  FolderTreePane: () => {
    useEffect(() => {
      mounts.tree += 1;
    }, []);
    return <div data-testid="tree-pane" />;
  },
}));
vi.mock("@/components/FilePreview", () => ({ FilePreview: () => null }));
vi.mock("@/components/folder/RightPaneFile", () => ({
  RightPaneFile: ({ fileId }: { fileId: string }) => {
    useEffect(() => {
      mounts.pane += 1;
    }, []);
    return <div data-testid="right-pane">file:{fileId}</div>;
  },
}));

vi.mock("@/lib/api", () => ({
  getDriveSummary: vi.fn(),
  getAuthStatus: vi.fn(),
}));

import { getAuthStatus, getDriveSummary } from "@/lib/api";
import DriveLayout from "../layout";

const summary = vi.mocked(getDriveSummary);
const auth = vi.mocked(getAuthStatus);

function Page(): ReactNode {
  useEffect(() => {
    mounts.page += 1;
  }, []);
  return <div data-testid="page">content</div>;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const SUMMARY = { name: "work", trash_count: 0, missing_count: 0 };
const notFound = () => new ApiStatusError(404, "API error: 404 Not Found");
const LOCKED = { unlocked_groups: [], has_protected_drives: true, is_admin: false };

function heading(name: string) {
  return screen.getByRole("heading", { level: 1, name: `Can't open the drive “${name}”` });
}

function renderLayout() {
  return render(
    <DriveLayout>
      <Page />
    </DriveLayout>,
  );
}

beforeEach(() => {
  localStorage.clear();
  treeEnabledStore.reset();
  mockPathname = "/drive/work";
  mockSearchParams = new URLSearchParams();
  mockParams = { name: "work" };
  mounts.tree = 0;
  mounts.page = 0;
  mounts.pane = 0;
  summary.mockReset();
  auth.mockReset();
  summary.mockResolvedValue(SUMMARY);
  auth.mockResolvedValue({ unlocked_groups: [], has_protected_drives: false, is_admin: false });
});

afterEach(() => {
  localStorage.clear();
  treeEnabledStore.reset();
});

const ROUTES: [string, string, string][] = [
  ["the drive root", "/drive/work", ""],
  ["a folder", "/drive/work/Q1/2026", ""],
  ["a folder with ?file=", "/drive/work/Q1", "file=abc123"],
  ["the home view", "/drive/work", "view=home"],
  ["a cross-folder view", "/drive/work", "view=favorites"],
  ["a cross-folder view with ?file=", "/drive/work", "view=favorites&file=abc123"],
  ["the trash view", "/drive/work", "view=trash"],
  ["search", "/drive/work/search", ""],
  ["a collection", "/drive/work/collections/c0000000001", ""],
  ["an app", "/drive/work/apps/video", ""],
  ["an addon page", "/drive/work/addons/intelligence", ""],
  ["an addon page with ?file=", "/drive/work/addons/intelligence", "file=abc123"],
];

describe("SPEC-CORE-125 I1 a 404 summary replaces every route", () => {
  it.each(ROUTES)("%s", async (_label, pathname, query) => {
    treeEnabledStore.set("work", true);
    mockPathname = pathname;
    mockSearchParams = new URLSearchParams(query);
    summary.mockRejectedValue(notFound());

    renderLayout();

    const h1 = await waitFor(() => heading("work"));
    expect(screen.getAllByRole("heading", { level: 1 })).toEqual([h1]);
    expect(screen.getByRole("link", { name: "All drives" })).toHaveAttribute("href", "/");
    expect(screen.queryByTestId("page")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tree-pane")).not.toBeInTheDocument();
    expect(screen.queryByTestId("right-pane")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Folder tree")).not.toBeInTheDocument();
  });

  it("names the drive of the URL, decoded", async () => {
    mockParams = { name: "my%20work" };
    mockPathname = "/drive/my%20work";
    summary.mockRejectedValue(notFound());
    renderLayout();
    await waitFor(() => heading("my work"));
    expect(summary).toHaveBeenCalledWith("my work");
  });
});

describe("SPEC-CORE-125 I2 an available drive keeps what was mounted while checking", () => {
  it("draws the route before the summary answers", () => {
    summary.mockReturnValue(new Promise(() => {}));
    renderLayout();
    expect(screen.getByTestId("page")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it.each([
    ["the children and the tree pane", "", { tree: 1, page: 1, pane: 0 }],
    ["the file pane and the tree pane", "file=abc123", { tree: 1, page: 0, pane: 1 }],
  ])("does not remount %s on a 2xx", async (_label, query, expected) => {
    treeEnabledStore.set("work", true);
    mockSearchParams = new URLSearchParams(query);
    const gate = deferred<typeof SUMMARY>();
    summary.mockReturnValue(gate.promise);
    renderLayout();
    expect(mounts).toEqual(expected);

    await act(async () => {
      gate.resolve(SUMMARY);
      await gate.promise;
    });

    expect(mounts).toEqual(expected);
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(auth).not.toHaveBeenCalled();
  });
});

describe("SPEC-CORE-125 I3 a failure that is not a 404", () => {
  it.each([
    ["a 500", new ApiStatusError(500, "API error: 500 Internal Server Error")],
    ["a 401", new ApiStatusError(401, "API error: 401 Unauthorized")],
    ["a network failure", new TypeError("Failed to fetch")],
    ["an abort", new DOMException("aborted", "AbortError")],
  ])("%s draws the route's own content", async (_label, error) => {
    summary.mockRejectedValue(error);
    renderLayout();
    await waitFor(() => expect(summary).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("page")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(auth).not.toHaveBeenCalled();
  });
});

describe("SPEC-CORE-125 I5 the Unlock link", () => {
  async function open404(): Promise<void> {
    summary.mockRejectedValue(notFound());
    renderLayout();
    await waitFor(() => heading("work"));
  }

  it("is drawn when the viewer has protected drives and is not an admin", async () => {
    auth.mockResolvedValue(LOCKED);
    await open404();
    const link = await screen.findByRole("link", { name: "Unlock" });
    expect(link).toHaveAttribute("href", "/unlock?redirect=%2Fdrive%2Fwork");
  });

  it("carries the path and query, encoded, and drops a hash", async () => {
    auth.mockResolvedValue(LOCKED);
    mockPathname = "/drive/work/Q1";
    mockSearchParams = new URLSearchParams("view=favorites&file=abc123");
    window.history.replaceState(null, "", "/drive/work/Q1#frag");
    await open404();
    const link = await screen.findByRole("link", { name: "Unlock" });
    expect(link).toHaveAttribute(
      "href",
      `/unlock?redirect=${encodeURIComponent("/drive/work/Q1?view=favorites&file=abc123")}`,
    );
  });

  it("omits the query marker when there is no query", async () => {
    auth.mockResolvedValue(LOCKED);
    mockPathname = "/drive/work/search";
    await open404();
    const link = await screen.findByRole("link", { name: "Unlock" });
    expect(link).toHaveAttribute("href", `/unlock?redirect=${encodeURIComponent("/drive/work/search")}`);
  });

  it.each([
    ["no protected drives", { unlocked_groups: [], has_protected_drives: false, is_admin: false }],
    ["an admin viewer", { unlocked_groups: ["a"], has_protected_drives: true, is_admin: true }],
  ])("is not drawn for %s", async (_label, status) => {
    auth.mockResolvedValue(status);
    await open404();
    await waitFor(() => expect(auth).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole("link", { name: "Unlock" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All drives" })).toBeInTheDocument();
  });

  it("is not drawn while the auth status has not answered, nor when it fails", async () => {
    auth.mockReturnValue(new Promise(() => {}));
    await open404();
    expect(screen.queryByRole("link", { name: "Unlock" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All drives" })).toBeInTheDocument();
  });

  it("is not drawn when the auth status fails", async () => {
    auth.mockRejectedValue(new Error("down"));
    await open404();
    await waitFor(() => expect(auth).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole("link", { name: "Unlock" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All drives" })).toBeInTheDocument();
  });

  it("appears after the state is drawn, once the auth status answers", async () => {
    const gate = deferred<typeof LOCKED>();
    auth.mockReturnValue(gate.promise);
    await open404();
    expect(screen.queryByRole("link", { name: "Unlock" })).not.toBeInTheDocument();
    await act(async () => {
      gate.resolve(LOCKED);
      await gate.promise;
    });
    expect(screen.getByRole("link", { name: "Unlock" })).toBeInTheDocument();
  });
});

describe("SPEC-CORE-125 I4 what the state does not say", () => {
  it("shows only the URL's drive name, no group and no count", async () => {
    auth.mockResolvedValue({ unlocked_groups: ["family"], has_protected_drives: true, is_admin: false });
    summary.mockRejectedValue(notFound());
    const { container } = renderLayout();
    await waitFor(() => heading("work"));
    await screen.findByRole("link", { name: "Unlock" });
    expect(container.textContent).not.toMatch(/family|\d/);
    expect(container.textContent).not.toMatch(/Add|Drop|No files/i);
  });
});

describe("SPEC-CORE-125 I6 an answer for a drive that is no longer the URL's", () => {
  it("discards a late 404 for the previous drive name", async () => {
    const first = deferred<typeof SUMMARY>();
    summary.mockImplementation((drive: string) =>
      drive === "work" ? first.promise : Promise.resolve({ ...SUMMARY, name: drive }),
    );
    const view = renderLayout();

    mockParams = { name: "other" };
    mockPathname = "/drive/other";
    view.rerender(
      <DriveLayout>
        <Page />
      </DriveLayout>,
    );
    await waitFor(() => expect(summary).toHaveBeenCalledWith("other"));

    await act(async () => {
      first.reject(notFound());
      await first.promise.catch(() => {});
    });

    expect(screen.getByTestId("page")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(auth).not.toHaveBeenCalled();
  });

  it("discards a late auth status for the previous drive name", async () => {
    const gate = deferred<typeof LOCKED>();
    auth.mockReturnValueOnce(gate.promise);
    summary.mockImplementation((drive: string) =>
      drive === "work" ? Promise.reject(notFound()) : Promise.reject(notFound()),
    );
    auth.mockResolvedValue({ unlocked_groups: [], has_protected_drives: true, is_admin: true });
    const view = renderLayout();
    await waitFor(() => heading("work"));

    mockParams = { name: "other" };
    mockPathname = "/drive/other";
    view.rerender(
      <DriveLayout>
        <Page />
      </DriveLayout>,
    );
    await waitFor(() => heading("other"));
    await waitFor(() => expect(auth).toHaveBeenCalledTimes(2));

    await act(async () => {
      gate.resolve(LOCKED);
      await gate.promise;
    });

    expect(screen.queryByRole("link", { name: "Unlock" })).not.toBeInTheDocument();
  });

  it("returns to checking for a new drive name", async () => {
    summary.mockImplementation((drive: string) =>
      drive === "work" ? Promise.reject(notFound()) : new Promise(() => {}),
    );
    const view = renderLayout();
    await waitFor(() => heading("work"));

    mockParams = { name: "other" };
    mockPathname = "/drive/other";
    view.rerender(
      <DriveLayout>
        <Page />
      </DriveLayout>,
    );

    await waitFor(() => expect(screen.getByTestId("page")).toBeInTheDocument());
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });
});

describe("SPEC-CORE-125 I7 how often the layout asks", () => {
  it("asks once per mount and not again on navigation inside the drive", async () => {
    const view = renderLayout();
    await waitFor(() => expect(summary).toHaveBeenCalledTimes(1));

    mockPathname = "/drive/work/Q1";
    mockSearchParams = new URLSearchParams("view=favorites");
    view.rerender(
      <DriveLayout>
        <Page />
      </DriveLayout>,
    );
    mockSearchParams = new URLSearchParams("file=abc123");
    view.rerender(
      <DriveLayout>
        <Page />
      </DriveLayout>,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(summary).toHaveBeenCalledTimes(1);
    expect(auth).not.toHaveBeenCalled();
  });

  it("asks again for a new drive name", async () => {
    const view = renderLayout();
    await waitFor(() => expect(summary).toHaveBeenCalledTimes(1));
    mockParams = { name: "other" };
    mockPathname = "/drive/other";
    view.rerender(
      <DriveLayout>
        <Page />
      </DriveLayout>,
    );
    await waitFor(() => expect(summary).toHaveBeenCalledTimes(2));
    expect(summary).toHaveBeenLastCalledWith("other");
  });

  it("asks again when the layout mounts again", async () => {
    const first = renderLayout();
    await waitFor(() => expect(summary).toHaveBeenCalledTimes(1));
    first.unmount();
    renderLayout();
    await waitFor(() => expect(summary).toHaveBeenCalledTimes(2));
  });

  it("asks for the auth status once per drive name that answered 404, not on navigation", async () => {
    summary.mockRejectedValue(notFound());
    const view = renderLayout();
    await waitFor(() => heading("work"));
    await waitFor(() => expect(auth).toHaveBeenCalledTimes(1));

    mockPathname = "/drive/work/Q1";
    mockSearchParams = new URLSearchParams("view=favorites");
    view.rerender(
      <DriveLayout>
        <Page />
      </DriveLayout>,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(summary).toHaveBeenCalledTimes(1);
    expect(auth).toHaveBeenCalledTimes(1);
  });
});
