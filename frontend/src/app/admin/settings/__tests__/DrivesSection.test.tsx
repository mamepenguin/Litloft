// DrivesSection test (RED phase)
//
// Choices for ambiguous parts:
// - DrivesSection fetches GET /api/admin/config/drives on mount (no props required).
// - Submit posts to PUT /api/admin/config/drives with the entire updated array.
// - Add/Edit modal exposes name/path/group inputs.
// - Errors render inline with the validation message in 日本語.
// - Delete confirmation uses a button labeled /削除|delete/i then a confirm button.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { DrivesSection } from "@/app/admin/settings/DrivesSection";

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

const initialDrives = [
  { name: "main", path: "/data/main", access_group: "default" },
  { name: "private", path: "/data/private", access_group: "secret" },
];

describe("DrivesSection", () => {
  it("loads drives from API on mount and shows the list", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(initialDrives));
    render(<DrivesSection />);
    await waitFor(() => {
      expect(screen.getByText("main")).toBeInTheDocument();
    });
    expect(screen.getByText("private")).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/admin/config/drives",
      expect.any(Object),
    );
  });

  it("clicking Add opens the modal", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(initialDrives));
    render(<DrivesSection />);
    await waitFor(() => {
      expect(screen.getByText("main")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /add/i }));
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/path/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/group/i)).toBeInTheDocument();
  });

  it("submitting a valid drive PUTs the new array", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(initialDrives));
    render(<DrivesSection />);
    await waitFor(() => {
      expect(screen.getByText("main")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /add/i }));
    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: "media" },
    });
    fireEvent.change(screen.getByLabelText(/path/i), {
      target: { value: "/data/media" },
    });
    fireEvent.change(screen.getByLabelText(/group/i), {
      target: { value: "default" },
    });

    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/admin/config/drives",
        expect.objectContaining({ method: "PUT" }),
      );
    });
    const lastCall = mockFetch.mock.calls.find(
      ([url, opts]) => url === "/api/admin/config/drives" && opts?.method === "PUT",
    );
    expect(lastCall).toBeTruthy();
    const body = JSON.parse((lastCall![1] as RequestInit).body as string);
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "media",
          path: "/data/media",
          access_group: "default",
        }),
      ]),
    );
  });

  it("server validation error renders inline error in English", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(initialDrives));
    render(<DrivesSection />);
    await waitFor(() => {
      expect(screen.getByText("main")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /add/i }));
    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: "ghost" },
    });
    fireEvent.change(screen.getByLabelText(/path/i), {
      target: { value: "/missing/path" },
    });
    fireEvent.change(screen.getByLabelText(/group/i), {
      target: { value: "default" },
    });

    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        {
          detail: {
            code: "path_not_found",
            field: "path",
            message:
              "Path not found in container. Check docker-compose.yml volumes.",
          },
        },
        422,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText(/not found in container|path_not_found/i)).toBeInTheDocument();
    });
  });

  it("editing an existing drive pre-fills the modal and PUTs the change", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(initialDrives));
    render(<DrivesSection />);
    await waitFor(() => {
      expect(screen.getByText("main")).toBeInTheDocument();
    });

    // Open edit for "main"
    const editButtons = screen.getAllByRole("button", { name: /編集|edit/i });
    fireEvent.click(editButtons[0]);

    const nameInput = screen.getByLabelText(/name/i) as HTMLInputElement;
    expect(nameInput.value).toBe("main");

    fireEvent.change(nameInput, { target: { value: "main2" } });
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/admin/config/drives",
        expect.objectContaining({ method: "PUT" }),
      );
    });
  });

  it("deleting a drive PUTs a shorter array after confirmation", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(initialDrives));
    render(<DrivesSection />);
    await waitFor(() => {
      expect(screen.getByText("main")).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByRole("button", { name: /削除|delete/i });
    fireEvent.click(deleteButtons[0]);

    // Confirmation prompt
    const confirmButton = await screen.findByRole("button", {
      name: /確認|confirm|ok/i,
    });
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));
    fireEvent.click(confirmButton);

    await waitFor(() => {
      const putCall = mockFetch.mock.calls.find(
        ([url, opts]) =>
          url === "/api/admin/config/drives" && opts?.method === "PUT",
      );
      expect(putCall).toBeTruthy();
      const body = JSON.parse((putCall![1] as RequestInit).body as string);
      expect(body).toHaveLength(1);
    });
  });

  it("renders a help disclosure explaining how to add a new mounted drive", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(initialDrives));
    render(<DrivesSection />);
    await waitFor(() => {
      expect(screen.getByText("main")).toBeInTheDocument();
    });

    // A <details> disclosure (resolved i18n strings, not key paths) that
    // tells the admin a new drive needs a docker-compose.override.yml
    // mount + rebuild — consistent with the /setup DriveStep wording.
    expect(
      screen.getByText(/docker-compose\.override\.yml/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/docker compose up -d --build/i),
    ).toBeInTheDocument();
  });
});
