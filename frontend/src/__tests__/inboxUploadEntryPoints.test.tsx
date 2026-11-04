/**
 * SPEC-CORE-032 I2 — the store sends the marker, but each entry point has
 * to reach the store. This file drives the paths a viewer can take from
 * the upload zone itself.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";

import { UploadZone } from "@/components/UploadZone";
import { resetUploadStore } from "@/hooks/useUpload";

vi.mock("@/lib/api", () => ({
  initUpload: vi.fn().mockResolvedValue({ upload_id: "u1", total_chunks: 1 }),
  uploadChunk: vi.fn().mockResolvedValue({}),
  completeUpload: vi.fn().mockResolvedValue({ id: "f1" }),
  cancelUpload: vi.fn().mockResolvedValue({}),
  getFilesProcessing: vi.fn().mockResolvedValue({ files: {} }),
}));

function file(name: string): File {
  return new File(["x"], name, { type: "text/plain" });
}

async function initCalls() {
  const { initUpload } = await import("@/lib/api");
  await waitFor(() =>
    expect(vi.mocked(initUpload).mock.calls.length).toBeGreaterThan(0),
  );
  return vi.mocked(initUpload).mock.calls as [
    string,
    Record<string, unknown>,
  ][];
}

function renderZone(folderPath = "") {
  return render(
    <UploadZone drive="main" folderPath={folderPath}>
      <div />
    </UploadZone>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  resetUploadStore();
});

describe("SPEC-CORE-032 I2 the upload zone's entry points", () => {
  it("SPEC-CORE-032 I2 marks a drag and drop", async () => {
    const { container } = renderZone("recipes");
    fireEvent.drop(container.querySelector("[data-upload-zone]")!, {
      dataTransfer: { files: [file("a.txt")], items: [], types: ["Files"] },
    });

    const [drive, body] = (await initCalls())[0];
    expect(drive).toBe("main");
    expect(body.folder_path).toBe("recipes");
    expect(body.inbox_source).toBe("upload");
  });

  it("SPEC-CORE-032 I2 marks Add → Upload files", async () => {
    const { container } = renderZone("recipes");
    container
      .querySelector("[data-upload-zone]")!
      .dispatchEvent(
        new CustomEvent("upload-files", { detail: [file("a.txt")] }),
      );

    const [, body] = (await initCalls())[0];
    expect(body.folder_path).toBe("recipes");
    expect(body.inbox_source).toBe("upload");
  });

  it("SPEC-CORE-032 I2 marks a folder upload's files, one arrival each", async () => {
    const { container } = renderZone("");
    container.querySelector("[data-upload-zone]")!.dispatchEvent(
      new CustomEvent("upload-files", {
        detail: [
          { file: file("a.txt"), relativePath: "folder/a.txt" },
          { file: file("b.txt"), relativePath: "folder/b.txt" },
        ],
      }),
    );

    const { initUpload } = await import("@/lib/api");
    await waitFor(() =>
      expect(vi.mocked(initUpload).mock.calls).toHaveLength(2),
    );
    const calls = vi.mocked(initUpload).mock.calls as [
      string,
      Record<string, unknown>,
    ][];
    expect(calls.map(([, body]) => body.relative_path)).toEqual([
      "folder/a.txt",
      "folder/b.txt",
    ]);
    for (const [, body] of calls) {
      expect(body.inbox_source).toBe("upload");
    }
  });

  /**
   * The zone the inbox page mounts has no folder of its own; files land in
   * the drive root, like the other drive-wide views.
   */
  it("SPEC-CORE-032 I2 sends the inbox page's zone to the drive root", async () => {
    const { container } = renderZone("");
    fireEvent.drop(container.querySelector("[data-upload-zone]")!, {
      dataTransfer: { files: [file("a.txt")], items: [], types: ["Files"] },
    });

    const [, body] = (await initCalls())[0];
    expect(body.folder_path).toBe("");
    expect(body.inbox_source).toBe("upload");
  });
});
