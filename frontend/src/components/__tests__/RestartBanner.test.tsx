import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { RestartBanner } from "@/components/RestartBanner";

const copyTextMock = vi.hoisted(() => vi.fn<(text: string) => Promise<boolean>>());
vi.mock("@/lib/copyText", () => ({ copyText: copyTextMock }));

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  copyTextMock.mockReset();
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

describe("RestartBanner", () => {
  it("renders nothing when pending: false", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ pending: false, files: [] }));
    const { container } = render(<RestartBanner />);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
    expect(container.textContent ?? "").not.toMatch(/再起動|restart/i);
  });

  it("renders banner with file list when pending: true", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        pending: true,
        files: [
          { name: "drives.json", count: 3 },
          { name: "passwords.json", count: 1 },
        ],
      }),
    );
    render(<RestartBanner />);
    await waitFor(() => {
      expect(screen.getByText(/drives\.json/)).toBeInTheDocument();
    });
    expect(screen.getByText(/passwords\.json/)).toBeInTheDocument();
  });

  async function renderPending() {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ pending: true, files: [{ name: "drives.json", count: 1 }] }),
    );
    render(<RestartBanner />);
    await waitFor(() => {
      expect(screen.getByText(/drives\.json/)).toBeInTheDocument();
    });
  }

  it("copies the restart command and says so", async () => {
    copyTextMock.mockResolvedValue(true);
    await renderPending();
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
    });
    expect(copyTextMock).toHaveBeenCalledWith("docker compose restart backend");
  });

  it("does not claim a copy the browser refused", async () => {
    copyTextMock.mockResolvedValue(false);
    await renderPending();
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => {
      expect(copyTextMock).toHaveBeenCalledTimes(1);
    });
    await Promise.resolve();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copied" })).toBeNull();
  });
});
