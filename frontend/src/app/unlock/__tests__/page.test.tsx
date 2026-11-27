// UNSPEC fix-unlock-refresh
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const pushMock = vi.fn();
const replaceMock = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, refresh: vi.fn() }),
  useSearchParams: () => searchParams,
}));

const unlockMock = vi.fn();
vi.mock("@/lib/api", () => ({
  unlock: (...args: unknown[]) => unlockMock(...args),
}));

const loadFullPageMock = vi.fn();
vi.mock("@/lib/fullPageLoad", () => ({
  loadFullPage: (path: string) => loadFullPageMock(path),
}));

import UnlockPage from "../page";

beforeEach(() => {
  pushMock.mockReset();
  replaceMock.mockReset();
  unlockMock.mockReset();
  loadFullPageMock.mockReset();
  searchParams = new URLSearchParams();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function submit(password: string) {
  fireEvent.change(screen.getByPlaceholderText(/.+/), { target: { value: password } });
  fireEvent.click(screen.getByRole("button"));
}

describe("UnlockPage", () => {
  it.each([
    ["", "/"],
    ["/drive/%E3%83%86%E3%82%B9%E3%83%88", "/drive/%E3%83%86%E3%82%B9%E3%83%88"],
    ["/drive/a?file=abc", "/drive/a?file=abc"],
    ["//evil.example", "/"],
    ["https://evil.example", "/"],
  ])("after a successful unlock with redirect %j, loads %s as a full page", async (redirect, expected) => {
    if (redirect) searchParams = new URLSearchParams({ redirect });
    unlockMock.mockResolvedValue({ success: true });
    render(<UnlockPage />);
    submit("pw");
    await waitFor(() => expect(loadFullPageMock).toHaveBeenCalledWith(expected));
    expect(pushMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("stays on the page and shows the error when the password is wrong", async () => {
    unlockMock.mockResolvedValue({ success: false, error: "Wrong password" });
    render(<UnlockPage />);
    submit("bad");
    expect(await screen.findByText("Wrong password")).toBeTruthy();
    expect(loadFullPageMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("stays on the page when the request fails", async () => {
    unlockMock.mockRejectedValue(new Error("network"));
    render(<UnlockPage />);
    submit("pw");
    await waitFor(() => expect(unlockMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole("button")).toHaveProperty("disabled", false));
    expect(loadFullPageMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
