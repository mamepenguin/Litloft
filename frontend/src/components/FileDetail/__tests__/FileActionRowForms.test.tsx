/**
 * `CastButton` is stubbed because the real one returns `null` unless the
 * browser reports a remote playback device, which would make a row that
 * dropped Cast look correct. `FavoriteButton` is stubbed so the label probe
 * reads Like's label and not Favorite's.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { createRef } from "react";

import { FileActionRow } from "../FileActionRow";
import { makeFile } from "./harness";

vi.mock("../../CastButton", async () => ({
  CastButton: (await import("./harness")).CastButtonStub,
}));
vi.mock("../../FavoriteButton", async () => ({
  FavoriteButton: (await import("./harness")).FavoriteButtonStub,
}));
vi.mock("../../FileActions", async () => ({
  FileActions: (await import("./harness")).FileActionsStub,
}));
vi.mock("../../AddonSlot", async () => {
  const harness = await import("./harness");
  return {
    AddonSlot: harness.AddonSlotStub,
    SlotEntryRenderer: harness.SlotEntryRendererStub,
  };
});
vi.mock("@/lib/api", () => ({
  setFileTrustTier: vi.fn(),
  likeFile: vi.fn(),
  dislikeFile: vi.fn(),
}));

/**
 * The addon slot is deliberately not a probe: what it draws depends on which
 * addons are checked out.
 */
const PROBES = {
  trust: (row: HTMLElement) =>
    row.querySelector("[data-testid='trust-tier-state']") !== null,
  gallery: (row: HTMLElement) =>
    row.querySelector("[aria-label='Gallery mode']") !== null,
  cast: (row: HTMLElement) => row.querySelector("[data-testid='cast']") !== null,
  // The Like button's word, not the row's text: the controls sit in
  // adjacent text nodes, so "Like" and "Unverified" concatenate and a
  // word-boundary match on the row reads neither of them.
  labels: (row: HTMLElement) =>
    row.querySelector("button[aria-label='Mark as liked'] span") !== null,
} as const;

type Probe = keyof typeof PROBES;

const EXPECTED: {
  kind: string;
  file: Parameters<typeof makeFile>[0];
  strip: Probe[];
  sheet: Probe[];
}[] = [
  {
    kind: "a note",
    file: {
      file_type: "document",
      filename: "note.md",
      mime_type: "text/markdown",
    },
    strip: [],
    sheet: ["labels", "trust"],
  },
  {
    kind: "an image",
    file: { file_type: "image", filename: "p.jpg", mime_type: "image/jpeg" },
    strip: [],
    sheet: ["gallery", "labels", "trust"],
  },
  {
    kind: "a video",
    file: { file_type: "video" },
    strip: [],
    sheet: ["cast", "labels", "trust"],
  },
];

/** Sorted, so neither side depends on the order `PROBES` is written in. */
const carried = (row: HTMLElement): Probe[] =>
  (Object.keys(PROBES) as Probe[]).filter((probe) => PROBES[probe](row)).sort();

function renderRow(
  overrides: Parameters<typeof makeFile>[0],
  compact: boolean,
): HTMLElement {
  const { container } = render(
    <FileActionRow
      file={makeFile(overrides)}
      onFileChange={vi.fn()}
      onRefetch={vi.fn()}
      onStartEdit={vi.fn()}
      onAfterDelete={vi.fn()}
      onRequestImageGallery={vi.fn()}
      videoRef={createRef<HTMLVideoElement>()}
      addonSlotProps={{}}
      compact={compact}
    />,
  );
  return container.querySelector<HTMLElement>("[data-testid='file-action-row']")!;
}

/** What the loop below registered, recorded after each `it()`. */
const registered: string[] = [];

const rowCaseId = (kind: string) =>
  `${kind}: the strip sheds what the sheet's column keeps`;

describe("the action row's two forms", () => {
  it("probes exactly the controls the guide's sentence is about", () => {
    expect(Object.keys(PROBES).sort()).toEqual([
      "cast",
      "gallery",
      "labels",
      "trust",
    ]);
    expect(EXPECTED).toHaveLength(3);
  });

  for (const { kind, file, strip, sheet } of EXPECTED) {
    it(rowCaseId(kind), () => {
      expect(carried(renderRow(file, true))).toEqual(strip);
      expect(carried(renderRow(file, false))).toEqual(sheet);
    });
    registered.push(rowCaseId(kind));
  }
});

it("registered a case for every kind the table declares", () => {
  expect(registered).toEqual(EXPECTED.map(({ kind }) => rowCaseId(kind)));
});
