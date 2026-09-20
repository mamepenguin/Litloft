import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NavigationCommitSignal } from "../NavigationCommitSignal";

const nav = vi.hoisted(() => ({
  pathname: "/drive/main",
  search: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => nav.search,
}));

const notify = vi.hoisted(() => vi.fn());

vi.mock("@/lib/viewTransitions", () => ({
  notifyNavigationCommit: notify,
}));

beforeEach(() => {
  notify.mockClear();
  nav.pathname = "/drive/main";
  nav.search = new URLSearchParams();
});

describe("NavigationCommitSignal", () => {
  it("reports the committed url", () => {
    render(<NavigationCommitSignal />);

    expect(notify).toHaveBeenCalledWith("/drive/main");
  });

  it("includes the query, so opening a file counts as a commit", () => {
    nav.search = new URLSearchParams({ file: "abc123" });

    render(<NavigationCommitSignal />);

    expect(notify).toHaveBeenCalledWith("/drive/main?file=abc123");
  });

  it("reports again when only the query changed", () => {
    const view = render(<NavigationCommitSignal />);
    notify.mockClear();

    nav.search = new URLSearchParams({ file: "abc123" });
    view.rerender(<NavigationCommitSignal />);

    expect(notify).toHaveBeenCalledWith("/drive/main?file=abc123");
  });

  it("reports again when only the path changed", () => {
    const view = render(<NavigationCommitSignal />);
    notify.mockClear();

    nav.pathname = "/drive/main/movies";
    view.rerender(<NavigationCommitSignal />);

    expect(notify).toHaveBeenCalledWith("/drive/main/movies");
  });

  it("stays quiet on a re-render that did not change the url", () => {
    const view = render(<NavigationCommitSignal />);
    notify.mockClear();

    view.rerender(<NavigationCommitSignal />);

    expect(notify).not.toHaveBeenCalled();
  });
});
