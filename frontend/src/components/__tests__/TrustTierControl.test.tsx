import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const setFileTrustTier = vi.fn();
vi.mock("@/lib/api", () => ({
  setFileTrustTier: (...args: unknown[]) => setFileTrustTier(...args),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { TrustTierControl } from "../TrustTierControl";
import type { FileItem, TrustTier } from "@/types";

function makeFile(
  trust_tier: TrustTier,
  trust_reviewed_at: string | null,
): FileItem {
  return {
    id: "f1",
    filename: "clip.md",
    title: "clip",
    description: "",
    drive: "main",
    folder_path: "",
    file_type: "document",
    mime_type: "text/markdown",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 1,
    duration: null,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier,
    trust_reviewed_at,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

const REVIEWED = "2026-08-29T00:00:00Z";

describe("TrustTierControl", () => {
  beforeEach(() => {
    setFileTrustTier.mockReset();
    setFileTrustTier.mockImplementation(async (_id: string, tier: TrustTier) =>
      makeFile(tier, REVIEWED),
    );
  });

  // The four states of spec §3. The migrated row (verified, never reviewed)
  // is the one worth guarding: it grounds Ask today, so it must not read as
  // unverified, but it also has not actually been judged by anyone.
  // The badge reports the tier alone. Whether anyone has ruled on the file is
  // a separate question, answered by the "not reviewed" listing filter —
  // surfacing it here made every untouched file look like a warning.
  it.each([
    ["unverified", null, "trust"],
    ["unverified", REVIEWED, "trust"],
    ["verified", REVIEWED, "withdraw"],
    ["verified", null, "withdraw"],
  ] as const)(
    "labels %s/%s with the action %s",
    async (tier, reviewedAt, actionLabel) => {
      render(
        <TrustTierControl file={makeFile(tier, reviewedAt)} onChange={vi.fn()} />,
      );
      expect(screen.getByRole("button", { name: actionLabel })).toBeTruthy();
    },
  );

  it("shows no text on a verified file, reviewed or not", () => {
    // Verified is the normal state of nearly every file; a label repeated
    // across the whole library is noise. This is the regression that made
    // scanner-discovered files read as unverified.
    for (const reviewedAt of [null, REVIEWED]) {
      const { unmount } = render(
        <TrustTierControl
          file={makeFile("verified", reviewedAt)}
          onChange={vi.fn()}
        />,
      );
      expect(screen.getByTestId("trust-tier-state")).toHaveTextContent("");
      unmount();
    }
  });

  it("labels only the exception", () => {
    render(
      <TrustTierControl file={makeFile("unverified", null)} onChange={vi.fn()} />,
    );
    expect(screen.getByTestId("trust-tier-state")).toHaveTextContent(
      "stateUnverified",
    );
  });

  it("is a single control, so it fits the 300px Markdown inspector", () => {
    // Regression: a state chip beside an action button put two text labels in
    // a row that also renders in the inspector and on a phone.
    render(
      <TrustTierControl file={makeFile("verified", REVIEWED)} onChange={vi.fn()} />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("promotes an unverified file", async () => {
    const onChange = vi.fn();
    render(
      <TrustTierControl file={makeFile("unverified", null)} onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "trust" }));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(setFileTrustTier).toHaveBeenCalledWith("f1", "verified");
  });

  it("demotes a verified file", async () => {
    const onChange = vi.fn();
    render(
      <TrustTierControl file={makeFile("verified", REVIEWED)} onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "withdraw" }));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(setFileTrustTier).toHaveBeenCalledWith("f1", "unverified");
  });

  it("does not fire twice while a write is in flight", async () => {
    let release: (v: FileItem) => void = () => {};
    setFileTrustTier.mockImplementation(
      () => new Promise<FileItem>((res) => { release = res; }),
    );
    render(
      <TrustTierControl file={makeFile("unverified", null)} onChange={vi.fn()} />,
    );
    const button = screen.getByRole("button", { name: "trust" });

    fireEvent.click(button);
    fireEvent.click(button);

    expect(setFileTrustTier).toHaveBeenCalledTimes(1);
    release(makeFile("verified", REVIEWED));
  });
});
