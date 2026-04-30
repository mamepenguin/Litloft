// DriveStep test (RED phase)
//
// Choices:
// - DriveStep manages a single drive entry (name/path/group). The "Next" button
//   is disabled while any required field is empty.
// - Validation against the server happens when Next is clicked: fetch PUT (or a
//   dedicated /validate endpoint) returning a server validation error renders
//   inline. We mock fetch to assert this path.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { DriveStep } from "@/app/setup/steps/DriveStep";

const mockFetch = vi.fn();

beforeEach(() => {
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

describe("DriveStep", () => {
  it("disables Next when fields are empty", () => {
    render(
      <DriveStep
        value={{ name: "", path: "", access_group: "" }}
        onChange={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    const next = screen.getByRole("button", { name: /次へ|next/i });
    expect(next).toBeDisabled();
  });

  it("enables Next when all required fields are filled", () => {
    render(
      <DriveStep
        value={{ name: "main", path: "/data/main", access_group: "default" }}
        onChange={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    const next = screen.getByRole("button", { name: /次へ|next/i });
    expect(next).not.toBeDisabled();
  });

  it("shows inline error when server returns path_not_found", async () => {
    const onNext = vi.fn();
    render(
      <DriveStep
        value={{ name: "main", path: "/missing", access_group: "default" }}
        onChange={vi.fn()}
        onNext={onNext}
        onBack={vi.fn()}
      />,
    );
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        {
          detail: {
            code: "path_not_found",
            field: "path",
            message:
              "コンテナ内で見つかりません。docker-compose.yml の volumes を確認してください",
          },
        },
        422,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /次へ|next/i }));
    await waitFor(() => {
      expect(screen.getByText(/見つかりません|path_not_found/)).toBeInTheDocument();
    });
    expect(onNext).not.toHaveBeenCalled();
  });

  it("calls onChange when name input changes", () => {
    const onChange = vi.fn();
    render(
      <DriveStep
        value={{ name: "", path: "", access_group: "" }}
        onChange={onChange}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    const nameInput = screen.getByLabelText(/名前|name/i);
    fireEvent.change(nameInput, { target: { value: "main" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ name: "main" }),
    );
  });
});
