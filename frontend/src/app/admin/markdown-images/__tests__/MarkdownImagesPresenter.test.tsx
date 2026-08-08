import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { MarkdownImageAnalysis } from "@/lib/markdownImageImport";
import { MarkdownImagesPresenter } from "../MarkdownImagesPresenter";

vi.mock("@/components/FolderPicker", () => ({
  FolderPicker: () => <div data-testid="folder-picker" />,
}));

const analysis: MarkdownImageAnalysis = {
  analysis_id: "analysis-1",
  drive: "recipes",
  folder_path: "",
  recursive: true,
  expires_at: "2026-08-06T00:00:00Z",
  counts: {
    total_markdown: 1000,
    local_loft_image: 200,
    external_https_candidate: 12,
    no_image: 788,
    unsupported_first_image: 0,
    invalid_loft_reference: 0,
    read_error: 0,
  },
  host_counts: {
    "images.example.com": 10,
    "cdn.example.net": 2,
  },
  samples: [],
};

function renderPresenter(selectedHosts = new Set<string>()) {
  const onHostToggle = vi.fn();
  const onImport = vi.fn();
  render(
    <MarkdownImagesPresenter
      drives={[{ name: "recipes", protected: false, file_count: 1000 }]}
      drive="recipes"
      folderPath=""
      recursive
      analysis={analysis}
      selectedHosts={selectedHosts}
      job={null}
      loading={false}
      error={null}
      onDriveChange={vi.fn()}
      onFolderPathChange={vi.fn()}
      onRecursiveChange={vi.fn()}
      onAnalyze={vi.fn()}
      onHostToggle={onHostToggle}
      onImport={onImport}
      onCancel={vi.fn()}
    />,
  );
  return { onHostToggle, onImport };
}

describe("MarkdownImagesPresenter", () => {
  it("keeps the scope controls within the fixed page width", () => {
    renderPresenter();

    const driveSelect = screen.getByRole("combobox");
    expect(driveSelect).toHaveClass("w-full", "min-w-0", "max-w-full");
    expect(driveSelect.parentElement).toHaveClass("min-w-0");
  });

  it("shows dry-run counts and leaves hosts unselected by default", () => {
    renderPresenter();

    expect(screen.getByText("1,000")).toBeInTheDocument();
    expect(screen.getByLabelText("images.example.com")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Attach 0" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Analyze" })).toHaveClass(
      "rounded-2xl",
      "hover:bg-accent-hover",
    );
  });

  it("enables import only when selected hosts contribute candidates", () => {
    const { onHostToggle, onImport } = renderPresenter(
      new Set(["images.example.com"]),
    );

    const importButton = screen.getByRole("button", { name: "Attach 10" });
    expect(importButton).toBeEnabled();
    expect(importButton).toHaveClass(
      "rounded-2xl",
      "hover:bg-accent-hover",
    );
    fireEvent.click(importButton);
    expect(onImport).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByLabelText("cdn.example.net"));
    expect(onHostToggle).toHaveBeenCalledWith("cdn.example.net");
  });
});
