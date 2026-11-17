import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { SelectionBar } from "../SelectionBar";
import { batchDelete, batchPurge } from "@/lib/api";

// The real dialog is covered in ConfirmDialog.test.tsx. This stub shows the
// running line, the outcome line and the confirm label the bar passes, and it
// does not disable its buttons, so the bar's own guards are what is tested.
vi.mock("@/lib/api", () => ({
  batchDelete: vi.fn(),
  batchPurge: vi.fn(),
  batchMove: vi.fn(),
  batchTag: vi.fn(),
  batchRestore: vi.fn(),
}));

vi.mock("../ConfirmDialog", () => ({
  ConfirmDialog: (p: any) =>
    p.open ? (
      <div data-testid="confirm-dialog" data-busy={p.busy ? "true" : "false"}>
        {p.progress ? <p data-testid="progress">{p.progress}</p> : null}
        {p.error ? <p data-testid="error">{p.error}</p> : null}
        {p.message ? <p data-testid="message">{p.message}</p> : null}
        <button data-testid="confirm-button" onClick={p.onConfirm}>
          {p.confirmLabel}
        </button>
        <button data-testid="cancel-button" onClick={p.onCancel}>
          Cancel
        </button>
      </div>
    ) : null,
}));

vi.mock("../MoveDialog", () => ({ MoveDialog: () => null }));
vi.mock("../CollectionPicker", () => ({ CollectionPicker: () => null }));
vi.mock("../ClipboardProvider", () => ({
  useClipboard: () => ({ copy: vi.fn(), cut: vi.fn(), paste: vi.fn(), clear: vi.fn(), isCut: () => false }),
}));

const idsOf = (n: number) => Array.from({ length: n }, (_, i) => `f${String(i).padStart(4, "0")}`);
const sorted = (xs: string[]) => [...xs].sort();

type Props = Parameters<typeof SelectionBar>[0];

function baseProps(ids: string[], extra: Partial<Props> = {}): Props {
  return {
    count: ids.length,
    selectedIds: new Set(ids),
    totalCount: 500,
    drive: "main",
    currentPath: "",
    onSelectAll: vi.fn(),
    onClear: vi.fn(),
    onComplete: vi.fn(),
    onSelectOnly: vi.fn(),
    onProcessed: vi.fn(),
    ...extra,
  } as Props;
}

const TRIGGER: Record<"trash" | "purge", { label: string; isTrashView: boolean }> = {
  trash: { label: "Move to Trash", isTrashView: false },
  purge: { label: "Permanently Delete", isTrashView: true },
};

function startRun(action: "trash" | "purge", props: Props) {
  const view = render(<SelectionBar {...props} isTrashView={TRIGGER[action].isTrashView} />);
  fireEvent.click(screen.getByLabelText(TRIGGER[action].label));
  return view;
}

function confirm() {
  fireEvent.click(screen.getByTestId("confirm-button"));
}

const sendOf = (action: "trash" | "purge") => (action === "trash" ? batchDelete : batchPurge);

const answerOk = (ids: string[]) => ({ deleted: ids.length, purged: ids.length, errors: [] });

// The bar passes the chunk and `{ signal }` as the options argument.
const idsOfCall = (call: unknown[]) => call[0] as string[];
const signalOfCall = (call: unknown[]) => (call[1] as { signal: AbortSignal }).signal;

describe.each(["trash", "purge"] as const)("SPEC-CORE-120 batch run (%s)", (action) => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(batchDelete).mockImplementation(async (ids: string[]) => answerOk(ids) as any);
    vi.mocked(batchPurge).mockImplementation(async (ids: string[]) => answerOk(ids) as any);
  });

  it("I1 [SPEC-CORE-120] a selection of 101 is sent as requests of 100 then 1, in selection order", async () => {
    const ids = idsOf(101);
    startRun(action, baseProps(ids));
    confirm();

    await waitFor(() => expect(sendOf(action)).toHaveBeenCalledTimes(2));
    const calls = vi.mocked(sendOf(action)).mock.calls;
    expect(idsOfCall(calls[0])).toEqual(ids.slice(0, 100));
    expect(idsOfCall(calls[1])).toEqual(ids.slice(100));
  });

  it("I1 [SPEC-CORE-120] a selection of exactly 100 is one request", async () => {
    const ids = idsOf(100);
    const props = baseProps(ids);
    startRun(action, props);
    confirm();

    await waitFor(() => expect(props.onComplete).toHaveBeenCalledTimes(1));
    expect(sendOf(action)).toHaveBeenCalledTimes(1);
  });

  it("I7 [SPEC-CORE-120] a full success clears the selection, closes the dialog and calls onComplete(true) once", async () => {
    const ids = idsOf(3);
    const props = baseProps(ids);
    startRun(action, props);
    confirm();

    await waitFor(() => expect(props.onComplete).toHaveBeenCalledTimes(1));
    expect(props.onComplete).toHaveBeenCalledWith(true);
    expect(props.onClear).toHaveBeenCalledTimes(1);
    expect(props.onSelectOnly).not.toHaveBeenCalled();
    expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
  });

  it("I6 [SPEC-CORE-120] a partial run selects exactly the failed ids, keeps the dialog open, and calls onComplete(true) once", async () => {
    const ids = idsOf(3);
    vi.mocked(sendOf(action)).mockResolvedValueOnce({
      deleted: 2,
      purged: 2,
      errors: [{ id: ids[1], error: "locked" }],
    } as any);
    const props = baseProps(ids);
    startRun(action, props);
    confirm();

    await waitFor(() => expect(props.onComplete).toHaveBeenCalledTimes(1));
    expect(props.onComplete).toHaveBeenCalledWith(true);
    expect(props.onSelectOnly).toHaveBeenCalledTimes(1);
    expect(sorted(vi.mocked(props.onSelectOnly!).mock.calls[0][0] as string[])).toEqual([ids[1]]);
    expect(props.onClear).not.toHaveBeenCalled();
    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("confirm-dialog")).toHaveTextContent("2 processed; 1 could not be processed.");
  });

  it("I6 [SPEC-CORE-120] the ids reported as processed are the processed ids and no failed id", async () => {
    const ids = idsOf(3);
    vi.mocked(sendOf(action)).mockResolvedValueOnce({
      deleted: 2,
      purged: 2,
      errors: [{ id: ids[1], error: "locked" }],
    } as any);
    const props = baseProps(ids);
    startRun(action, props);
    confirm();

    await waitFor(() => expect(props.onComplete).toHaveBeenCalledTimes(1));
    const reported = vi
      .mocked(props.onProcessed!)
      .mock.calls.flatMap(([xs]) => xs as string[]);
    expect(sorted(reported)).toEqual(sorted([ids[0], ids[2]]));
  });

  it("I6 I15 [SPEC-CORE-120] a stopped run selects failed plus unconfirmed, and remaining equals that size", async () => {
    const ids = idsOf(101);
    vi.mocked(sendOf(action))
      .mockImplementationOnce(async (chunk: string[]) => answerOk(chunk) as any)
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const props = baseProps(ids);
    startRun(action, props);
    confirm();

    await waitFor(() => expect(props.onComplete).toHaveBeenCalledTimes(1));
    const kept = vi.mocked(props.onSelectOnly!).mock.calls[0][0] as string[];
    expect(sorted(kept)).toEqual([ids[100]]);
    expect(screen.getByTestId("confirm-dialog")).toHaveTextContent(
      `Stopped after 100 processed. ${kept.length} files remain selected.`,
    );
  });

  it("I7 [SPEC-CORE-120] a run where every chunk is unconfirmed still calls onComplete(true) once and stays open", async () => {
    const ids = idsOf(3);
    vi.mocked(sendOf(action)).mockRejectedValue(new TypeError("Failed to fetch"));
    const props = baseProps(ids);
    startRun(action, props);
    confirm();

    await waitFor(() => expect(props.onComplete).toHaveBeenCalledTimes(1));
    expect(props.onComplete).toHaveBeenCalledWith(true);
    expect(sorted(vi.mocked(props.onSelectOnly!).mock.calls[0][0] as string[])).toEqual(sorted(ids));
    expect(props.onClear).not.toHaveBeenCalled();
    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
  });

  it("I5 [SPEC-CORE-120] an answer whose counts do not add up stops the run and is unconfirmed", async () => {
    const ids = idsOf(101);
    vi.mocked(sendOf(action)).mockResolvedValueOnce({ deleted: 99, purged: 99, errors: [] } as any);
    const props = baseProps(ids);
    startRun(action, props);
    confirm();

    await waitFor(() => expect(props.onComplete).toHaveBeenCalledTimes(1));
    expect(sendOf(action)).toHaveBeenCalledTimes(1);
    expect(sorted(vi.mocked(props.onSelectOnly!).mock.calls[0][0] as string[])).toEqual(sorted(ids));
  });

  it("I2 [SPEC-CORE-120] the running line shows the processed count of the run, not the chunk count", async () => {
    const ids = idsOf(101);
    let releaseSecond: () => void = () => {};
    vi.mocked(sendOf(action))
      .mockImplementationOnce(async (chunk: string[]) => answerOk(chunk) as any)
      .mockImplementationOnce(
        () => new Promise((resolve) => (releaseSecond = () => resolve(answerOk([ids[100]]) as any))),
      );
    startRun(action, baseProps(ids));
    confirm();

    expect(await screen.findByTestId("progress")).toHaveTextContent("Processing 100 of 101");
    releaseSecond();
    await waitFor(() => expect(screen.queryByTestId("progress")).not.toBeInTheDocument());
  });

  it("I9 [SPEC-CORE-120] unmounting during a run aborts the in-flight request and sends no further chunk", async () => {
    const ids = idsOf(101);
    vi.mocked(sendOf(action)).mockImplementation(() => new Promise(() => {}));
    const { unmount } = startRun(action, baseProps(ids));
    confirm();

    await waitFor(() => expect(sendOf(action)).toHaveBeenCalledTimes(1));
    const signal = signalOfCall(vi.mocked(sendOf(action)).mock.calls[0]);
    unmount();

    expect(signal.aborted).toBe(true);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(sendOf(action)).toHaveBeenCalledTimes(1);
  });

  it("I17 [SPEC-CORE-120] while running, Cancel does nothing and the dialog stays open", async () => {
    const ids = idsOf(3);
    vi.mocked(sendOf(action)).mockImplementation(() => new Promise(() => {}));
    startRun(action, baseProps(ids));
    confirm();
    await waitFor(() => expect(sendOf(action)).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId("cancel-button"));

    expect(screen.getByTestId("confirm-dialog")).toHaveAttribute("data-busy", "true");
  });

  it("I18 [SPEC-CORE-120] while running, a second confirm does not start another run", async () => {
    const ids = idsOf(3);
    vi.mocked(sendOf(action)).mockImplementation(() => new Promise(() => {}));
    startRun(action, baseProps(ids));
    confirm();
    await waitFor(() => expect(sendOf(action)).toHaveBeenCalledTimes(1));

    confirm();
    confirm();

    expect(sendOf(action)).toHaveBeenCalledTimes(1);
  });

  it("I19 [SPEC-CORE-120] while running, the selection's other actions are disabled", async () => {
    const ids = idsOf(1);
    vi.mocked(sendOf(action)).mockImplementation(() => new Promise(() => {}));
    startRun(action, baseProps(ids));
    confirm();
    await waitFor(() => expect(sendOf(action)).toHaveBeenCalledTimes(1));

    expect(screen.getByLabelText(TRIGGER[action].label)).toBeDisabled();
    if (action === "trash") expect(screen.getByLabelText("Move")).toBeDisabled();
  });

  it("I23 [SPEC-CORE-120] the retry line is absent from a first run and present on a retry", async () => {
    const ids = idsOf(3);
    vi.mocked(sendOf(action)).mockResolvedValueOnce({
      deleted: 2,
      purged: 2,
      errors: [{ id: ids[1], error: "locked" }],
    } as any);
    const props = baseProps(ids);
    const { rerender } = startRun(action, props);
    confirm();
    await waitFor(() => expect(props.onComplete).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Some files may have been processed by an earlier attempt.")).not.toBeInTheDocument();

    // The parent replaces the selection with the failed ids; the open dialog retries them.
    const retryIds = vi.mocked(props.onSelectOnly!).mock.calls[0][0] as string[];
    rerender(<SelectionBar {...baseProps(retryIds)} isTrashView={TRIGGER[action].isTrashView} />);
    expect(screen.getByTestId("confirm-button")).toHaveTextContent("Process remaining");
    vi.mocked(sendOf(action)).mockResolvedValueOnce({
      deleted: 0,
      purged: 0,
      errors: [{ id: ids[1], error: "not found" }],
    } as any);
    confirm();

    await waitFor(() =>
      expect(screen.getByText("Some files may have been processed by an earlier attempt.")).toBeInTheDocument(),
    );
    expect(idsOfCall(vi.mocked(sendOf(action)).mock.calls[1])).toEqual([ids[1]]);
  });
});

describe("SPEC-CORE-120 I13: a SelectionBar without the new props", () => {
  it("I13 [SPEC-CORE-120] a trash run without onSelectOnly or onProcessed still completes with onComplete(true)", async () => {
    vi.clearAllMocks();
    vi.mocked(batchDelete).mockResolvedValue({ deleted: 3, errors: [] } as any);
    const ids = idsOf(3);
    const props = baseProps(ids, { onSelectOnly: undefined, onProcessed: undefined });
    startRun("trash", props);
    confirm();

    await waitFor(() => expect(props.onComplete).toHaveBeenCalledTimes(1));
    expect(props.onComplete).toHaveBeenCalledWith(true);
  });
});
