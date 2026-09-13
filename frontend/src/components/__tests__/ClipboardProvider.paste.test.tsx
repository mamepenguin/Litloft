/**
 * What a paste leaves behind.
 *
 * Both endpoints answer 200 with a count and a per-file error list rather
 * than throwing, so "it succeeded" is a number and not the absence of an
 * exception. Each state below declares the two things that follow from
 * that number: whether the clipboard survives, and whether anything is
 * said about the files that did not arrive.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

const mockBatchCopy = vi.fn();
const mockBatchMove = vi.fn();
vi.mock("@/lib/api", () => ({
  batchCopy: (...args: unknown[]) => mockBatchCopy(...args),
  batchMove: (...args: unknown[]) => mockBatchMove(...args),
}));

const mockError = vi.fn();
vi.mock("@/components/ToastProvider", () => ({
  useToast: () => ({ error: mockError, success: vi.fn(), info: vi.fn() }),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

// Overrides the global mock, which renders `{count}` but not an ICU plural.
// What matters here is that the number reaches the message at all, so the
// key and its argument are reported instead of the rendered sentence.
vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string, values?: Record<string, unknown>) =>
    `${namespace}.${key}:${values?.count ?? ""}`,
}));

import { ClipboardProvider, useClipboard } from "../ClipboardProvider";
import messages from "@/messages-core/en.json";

// A box rather than a bare binding: the react-hooks rule forbids a
// component assigning to a variable outside it, and the point here is to
// reach the provider's own API from the test.
const box: { api: ReturnType<typeof useClipboard> | null } = { api: null };
const api = () => box.api!;

function Probe() {
  box.api = useClipboard();
  return (
    <span data-testid="held">
      {box.api.clipboard ? box.api.clipboard.fileIds.join(",") : "-"}
    </span>
  );
}

const held = () => screen.getByTestId("held").textContent;

const copyResult = (copied: number, failed: number) => ({
  copied,
  errors: Array.from({ length: failed }, (_, i) => ({ id: `e${i}`, error: "nope" })),
});
const moveResult = (moved: number, failed: number) => ({
  moved,
  errors: Array.from({ length: failed }, (_, i) => ({ id: `e${i}`, error: "nope" })),
});

/**
 * Three files on the clipboard in each case, so "all", "none" and "some"
 * are three different numbers rather than two.
 */
const IDS = ["f1", "f2", "f3"];

/** mode, arrived, refused, clipboard survives, how many are reported. */
const OUTCOMES = [
  ["copy", 3, 0, true, 0],
  ["copy", 0, 3, false, 3],
  ["copy", 2, 1, true, 1],
  ["cut", 3, 0, true, 0],
  ["cut", 0, 3, false, 3],
  ["cut", 2, 1, true, 1],
] as const;

async function pasteAfter(mode: "copy" | "cut") {
  render(
    <ClipboardProvider>
      <Probe />
    </ClipboardProvider>,
  );
  act(() => {
    if (mode === "copy") api().copy(IDS, "main", "source");
    else api().cut(IDS, "main", "source");
  });
  expect(held()).toBe("f1,f2,f3");
  await act(async () => {
    await api().paste("main", "target");
  });
}

describe("what a paste leaves on the clipboard", () => {
  beforeEach(() => {
    // `resetAllMocks`, not `clearAllMocks`: the latter clears calls and
    // leaves implementations, so a row that arms only one of the two
    // endpoints inherits the other's resolved value from the row before.
    vi.resetAllMocks();
    sessionStorage.clear();
  });
  afterEach(cleanup);

  it("covers every class of outcome for both modes", () => {
    // Declared per class, so shrinking one of them is a failure rather
    // than a narrowing. "None arrived" is the class the change exists to
    // add, and it is the one a smaller table would lose first.
    const classOf = (pasted: number) => (pasted === 3 ? "all" : pasted === 0 ? "none" : "some");
    for (const mode of ["copy", "cut"] as const) {
      for (const klass of ["all", "none", "some"] as const) {
        expect(
          OUTCOMES.filter((o) => o[0] === mode && classOf(o[1]) === klass),
          `${mode}/${klass}`,
        ).toHaveLength(1);
      }
    }
    expect(OUTCOMES).toHaveLength(6);
  });

  it.each(OUTCOMES)(
    "%s: %i arrived and %i did not — cleared=%s, %i reported",
    async (mode, pasted, failed, cleared, reported) => {
      mockBatchCopy.mockResolvedValue(copyResult(pasted, failed));
      mockBatchMove.mockResolvedValue(moveResult(pasted, failed));

      await pasteAfter(mode);

      // Which endpoint, not just that one answered. Copy and cut differ
      // only here, and sending one to the other's endpoint relocates
      // originals that should have been duplicated.
      expect(mockBatchCopy).toHaveBeenCalledTimes(mode === "copy" ? 1 : 0);
      expect(mockBatchMove).toHaveBeenCalledTimes(mode === "copy" ? 0 : 1);

      expect(held()).toBe(cleared ? "-" : "f1,f2,f3");
      // sessionStorage travels with it: a clipboard cleared on screen and
      // kept in storage comes back on the next reload.
      expect(sessionStorage.getItem("hv_clipboard") === null).toBe(cleared);
      expect(mockError).toHaveBeenCalledTimes(reported > 0 ? 1 : 0);
      if (reported > 0) {
        expect(mockError.mock.calls[0][0]).toBe(`clipboard.pasteFailed:${reported}`);
      }
    },
  );

  it("asks for a message the catalogue actually holds", () => {
    // The case above names a key; this is what says the key is real.
    // A renamed key makes one of the two fail whichever side moved.
    expect(messages.clipboard.pasteFailed).toBeTruthy();
  });

  it("keeps the clipboard when the request itself fails", async () => {
    // The other failure: not a 200 carrying errors, but no answer at all.
    // Nothing was pasted, so there is nothing a second attempt would
    // duplicate.
    mockBatchCopy.mockRejectedValue(new Error("network"));

    render(
      <ClipboardProvider>
        <Probe />
      </ClipboardProvider>,
    );
    act(() => api().copy(IDS, "main", "source"));
    await act(async () => {
      await api().paste("main", "target").catch(() => {});
    });

    expect(held()).toBe("f1,f2,f3");
    // And says so. The clipboard surviving is not a message: a paste that
    // visibly does nothing is the state this change set out to remove.
    expect(mockError).toHaveBeenCalledTimes(1);
    expect(mockError.mock.calls[0][0]).toBe("clipboard.pasteRefused:");
  });
});
