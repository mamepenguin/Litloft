/**
 * SPEC-CORE-037 — what an upload entry shows once it reaches **Complete**, and
 * what the processing view must leave alone. Fetch timing lives in
 * `uploadProcessingRefresh.test.tsx`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";

vi.mock("@/lib/api", async () => (await import("@/__tests__/helpers/uploadApiMock")).apiMock());
vi.mock("@/hooks/useWebSocket", () => ({ useWebSocket: () => null }));

import { mockedApi, type UploadApi } from "@/__tests__/helpers/uploadApiMock";
import {
  deferred,
  dropOn,
  flush,
  initResult,
  type InitResult,
} from "@/__tests__/helpers/uploadQueue";

type StageState = "pending" | "running" | "done" | "failed";

interface Stage {
  addon: string | null;
  key: string;
  i18n_key: string;
  state: StageState;
  required: boolean;
}

type Answer = { files: Record<string, { stages: Stage[]; ready: boolean }> };

const SAVED: Stage = {
  addon: null,
  key: "saved",
  i18n_key: "upload.stageSaved",
  state: "done",
  required: true,
};

function stage(
  addon: string,
  key: string,
  state: StageState,
  i18n_key: string,
  required: boolean,
): Stage {
  return { addon, key, i18n_key, state, required };
}

const answer = (files: Answer["files"]): Answer => ({ files });

type DrawerType = ComponentType;
type UploadZoneType = typeof import("@/components/UploadZone").UploadZone;

async function load(): Promise<{ Drawer: DrawerType; UploadZone: UploadZoneType }> {
  const [{ UploadProgress }, { UploadZone }] = await Promise.all([
    import("@/components/UploadProgress"),
    import("@/components/UploadZone"),
  ]);
  return { Drawer: UploadProgress as unknown as DrawerType, UploadZone };
}

/** Drop one file, let it complete, and keep the drawer mounted. */
async function renderCompleted(
  api: UploadApi,
  { id = "file_a", name = "a.txt" } = {},
) {
  const { Drawer, UploadZone } = await load();
  api.initUpload.mockResolvedValue(initResult("upload-1"));
  api.completeUpload.mockResolvedValue({ id });
  const view = render(
    <>
      <UploadZone drive="main" folderPath="films">
        <div />
      </UploadZone>
      <Drawer />
    </>,
  );
  await dropOn(view.container, [new File(["x"], name)]);
  await flush(20);
  // The first answer may come as soon as the entry enters the processing view
  // or on the first tick; both are the same to what the line shows.
  await advance(30 * 1000);
  return view;
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const spinner = () => document.querySelector("svg.lucide-loader-circle");
const failureMark = () => document.querySelector("svg.lucide-circle-alert");

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SPEC-CORE-037 I7 — the stage line and Ready", () => {
  it("SPEC-CORE-037 I7 replaces the stage line with Ready when the answer is ready", async () => {
    const api = await mockedApi();
    api.getFilesProcessing.mockResolvedValue(
      answer({
        file_a: {
          stages: [
            SAVED,
            stage("intel", "search", "done", "upload.statusPending", true),
          ],
          ready: true,
        },
      }),
    );

    await renderCompleted(api);

    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.queryByText("Pending")).toBeNull();
  });

  it("SPEC-CORE-037 I7 keeps the failure mark beside Ready when a stage had failed", async () => {
    const api = await mockedApi();
    api.getFilesProcessing.mockResolvedValue(
      answer({
        file_a: {
          stages: [
            SAVED,
            stage("intel", "search", "done", "upload.statusPending", true),
            stage("intel", "transcript", "failed", "upload.statusError", false),
          ],
          ready: true,
        },
      }),
    );

    await renderCompleted(api);

    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(failureMark()).not.toBeNull();
  });

  it("SPEC-CORE-037 I7 shows the stages in the answer's order while in progress", async () => {
    const api = await mockedApi();
    api.getFilesProcessing.mockResolvedValue(
      answer({
        file_a: {
          stages: [
            SAVED,
            stage("intel", "search", "running", "upload.statusProcessing", true),
            stage("intel", "text", "pending", "upload.statusPending", false),
          ],
          ready: false,
        },
      }),
    );

    await renderCompleted(api);

    const running = screen.getByText("Processing");
    const pending = screen.getByText("Pending");
    expect(
      running.compareDocumentPosition(pending) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(spinner()).not.toBeNull();
  });

  it("SPEC-CORE-037 I7 marks a failed stage and keeps every stage in the line", async () => {
    const api = await mockedApi();
    api.getFilesProcessing.mockResolvedValue(
      answer({
        file_a: {
          stages: [
            SAVED,
            stage("intel", "search", "pending", "upload.statusPending", true),
            stage("intel", "transcript", "failed", "upload.statusError", false),
          ],
          ready: false,
        },
      }),
    );

    await renderCompleted(api);

    expect(screen.getByText("Some steps failed")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(failureMark()).not.toBeNull();
  });
});

describe("SPEC-CORE-037 I12 — the unavailable stage", () => {
  it("SPEC-CORE-037 I12 says it cannot check, with a spinner, while the stage is unavailable", async () => {
    const api = await mockedApi();
    api.getFilesProcessing.mockResolvedValue(
      answer({
        file_a: {
          stages: [
            SAVED,
            {
              addon: "intel",
              key: "unavailable",
              i18n_key: "upload.stageUnavailable",
              state: "pending",
              required: true,
            },
          ],
          ready: false,
        },
      }),
    );

    await renderCompleted(api);

    expect(screen.getByText("Not available right now")).toBeInTheDocument();
    expect(spinner()).not.toBeNull();
  });
});

describe("SPEC-CORE-037 I9 — the processing view moves nothing else", () => {
  it("SPEC-CORE-037 I9 does not arm the leave-page confirmation for a processing entry", async () => {
    const api = await mockedApi();
    api.getFilesProcessing.mockResolvedValue(
      answer({
        file_a: {
          stages: [
            SAVED,
            stage("intel", "search", "pending", "upload.statusPending", true),
          ],
          ready: false,
        },
      }),
    );

    await renderCompleted(api);
    expect(screen.getByText("Pending")).toBeInTheDocument();

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it("SPEC-CORE-037 I9 Clear removes a processing entry and stops its fetching", async () => {
    const api = await mockedApi();
    api.getFilesProcessing.mockResolvedValue(
      answer({
        file_a: {
          stages: [
            SAVED,
            stage("intel", "search", "pending", "upload.statusPending", true),
          ],
          ready: false,
        },
      }),
    );

    await renderCompleted(api);
    expect(screen.getByText("Pending")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText("Clear"));
    });
    await flush(10);

    expect(screen.queryByText("a.txt")).toBeNull();
    expect(screen.queryByText("Pending")).toBeNull();

    const requests = api.getFilesProcessing.mock.calls.length;
    await advance(5 * 60 * 1000);
    expect(api.getFilesProcessing.mock.calls.length).toBe(requests);
  });

  it("SPEC-CORE-037 I9 starts a third upload while two entries sit in processing view", async () => {
    const api = await mockedApi();
    const held = [
      deferred<InitResult>(),
      deferred<InitResult>(),
      deferred<InitResult>(),
    ];
    let started = 0;
    api.initUpload.mockImplementation(() => held[started++].promise);
    api.completeUpload.mockImplementation(async (_drive, uploadId) => ({ id: uploadId }));
    api.getFilesProcessing.mockImplementation(async (ids: string[]) =>
      answer(
        Object.fromEntries(
          ids.map((id) => [
            id,
            {
              stages: [
                SAVED,
                stage("intel", "search", "pending", "upload.statusPending", true),
              ],
              ready: false,
            },
          ]),
        ),
      ),
    );

    const { Drawer, UploadZone } = await load();
    const view = render(
      <>
        <UploadZone drive="main" folderPath="films">
          <div />
        </UploadZone>
        <Drawer />
      </>,
    );
    await dropOn(view.container, [
      new File(["x"], "a.txt"),
      new File(["x"], "b.txt"),
      new File(["x"], "c.txt"),
    ]);
    await flush(10);
    expect(api.initUpload).toHaveBeenCalledTimes(2);

    held[0].resolve(initResult("upload-1"));
    held[1].resolve(initResult("upload-2"));
    await flush(20);
    await advance(30 * 1000);

    expect(api.initUpload).toHaveBeenCalledTimes(3);
    expect(screen.getAllByText("Pending").length).toBeGreaterThan(0);

    held[2].resolve(initResult("upload-3"));
    await flush(20);
  });
});
