import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { RestartBanner } from "@/components/RestartBanner";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
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

  it("copy button copies docker compose restart backend to clipboard", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ pending: true, files: [{ name: "drives.json", count: 1 }] }),
    );
    render(<RestartBanner />);
    await waitFor(() => {
      expect(screen.getByText(/drives\.json/)).toBeInTheDocument();
    });
    const button = screen.getByRole("button", { name: /コピー|copy/i });
    fireEvent.click(button);
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "docker compose restart backend",
      );
    });
  });
});
