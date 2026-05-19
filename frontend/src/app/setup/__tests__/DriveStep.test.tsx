// DriveStep test (Phase 2: detected-drives redesign).
//
// spec 2026-05-19-gui-first-setup-cli-bootstrap §3.3 / plan Phase 2.
//
// The DriveStep no longer asks the user to type a host path. The backend
// seeds drives.json from the container mount directories, so by the time
// /setup loads there are N stub drives. DriveStep renders that detected
// list: the display name and access group are editable, the path is
// read-only. When zero drives are detected it shows mount guidance and
// disables Next.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { DriveStep, type DriveDraft } from "@/app/setup/steps/DriveStep";

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

const twoDrives: DriveDraft[] = [
  { name: "media", path: "/app/drives/media", access_group: "" },
  { name: "docs", path: "/app/drives/docs", access_group: "" },
];

describe("DriveStep (detected drives)", () => {
  it("renders every detected drive", () => {
    render(
      <DriveStep
        value={twoDrives}
        onChange={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    // Display-name inputs default to the slug.
    expect(screen.getByDisplayValue("media")).toBeInTheDocument();
    expect(screen.getByDisplayValue("docs")).toBeInTheDocument();
  });

  it("shows each drive's path read-only (not an editable text input)", () => {
    render(
      <DriveStep
        value={twoDrives}
        onChange={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    // The container path is displayed but must not be a writable input
    // the user can type a host path into.
    const mediaPath = screen.getByText("/app/drives/media");
    expect(mediaPath).toBeInTheDocument();
    expect(mediaPath.tagName).not.toBe("INPUT");
    // No textbox should carry the path as an editable value.
    const pathTextbox = screen.queryByDisplayValue("/app/drives/media");
    expect(pathTextbox === null || pathTextbox.tagName !== "INPUT").toBe(true);
  });

  it("editing a display name calls onChange with an immutable new array", () => {
    const onChange = vi.fn();
    render(
      <DriveStep
        value={twoDrives}
        onChange={onChange}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    const firstName = screen.getByDisplayValue("media");
    fireEvent.change(firstName, { target: { value: "Movies" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as DriveDraft[];
    expect(next).not.toBe(twoDrives); // new array, not mutated
    expect(next[0].name).toBe("Movies");
    expect(next[0].path).toBe("/app/drives/media"); // path preserved
    expect(next[1]).toEqual(twoDrives[1]); // other entry untouched
    expect(twoDrives[0].name).toBe("media"); // original not mutated
  });

  it("editing an access group calls onChange with the updated entry", () => {
    const onChange = vi.fn();
    render(
      <DriveStep
        value={twoDrives}
        onChange={onChange}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    const groups = screen.getAllByRole("textbox", { name: /group/i });
    fireEvent.change(groups[1], { target: { value: "family" } });
    const next = onChange.mock.calls[0][0] as DriveDraft[];
    expect(next[1].access_group).toBe("family");
    expect(next[0].access_group).toBe("");
  });

  it("disables Next and shows mount guidance when no drive is detected", () => {
    render(
      <DriveStep
        value={[]}
        onChange={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    const next = screen.getByRole("button", { name: /next/i });
    expect(next).toBeDisabled();
    // Guidance must mention editing the override file and rebuilding.
    // (override.yml is referenced both in the guidance and in the
    // troubleshooting <details>, so assert at least one match.)
    expect(
      screen.getAllByText(/docker-compose\.override\.yml/i).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/docker compose up -d --build/i).length,
    ).toBeGreaterThan(0);
  });

  it("enables Next when at least one drive is detected", () => {
    render(
      <DriveStep
        value={twoDrives}
        onChange={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /next/i })).not.toBeDisabled();
  });

  it("validates the whole array via PUT /api/admin/config/drives on Next", async () => {
    const onNext = vi.fn();
    render(
      <DriveStep
        value={twoDrives}
        onChange={vi.fn()}
        onNext={onNext}
        onBack={vi.fn()}
      />,
    );
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true, count: 2 }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => {
      expect(onNext).toHaveBeenCalled();
    });
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/admin/config/drives");
    expect(opts.method).toBe("PUT");
    const sent = JSON.parse(opts.body as string);
    expect(Array.isArray(sent)).toBe(true);
    expect(sent).toHaveLength(2);
    expect(sent[0].name).toBe("media");
  });

  it("surfaces a server validation error inline and does not advance", async () => {
    const onNext = vi.fn();
    render(
      <DriveStep
        value={twoDrives}
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
              "Path not found in container. Check docker-compose.yml volumes.",
          },
        },
        422,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => {
      expect(
        screen.getByText(/not found in container|path_not_found/i),
      ).toBeInTheDocument();
    });
    expect(onNext).not.toHaveBeenCalled();
  });

  it("skips server validation when skipValidate is set (wizard mode)", () => {
    const onNext = vi.fn();
    render(
      <DriveStep
        value={twoDrives}
        onChange={vi.fn()}
        onNext={onNext}
        onBack={vi.fn()}
        skipValidate
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(onNext).toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
