/**
 * SPEC-CORE-030 — the upload queue belongs to the app, not to a view.
 *
 * The tests render the drawer the root layout draws beside the page, hand
 * files to a view's zone, and then move the page around underneath. The
 * queue is a module store, so `vi.resetModules()` is what empties it between
 * tests: the components are imported after the reset, in the same registry.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";

vi.mock("@/lib/api", async () => (await import("@/__tests__/helpers/uploadApiMock")).apiMock());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/drive/main",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ name: "main" }),
}));

import { mockedApi, type UploadApi } from "@/__tests__/helpers/uploadApiMock";
import {
  deferred,
  dropOn,
  flush,
  initBodies,
  initResult,
  type Deferred,
  type InitResult,
} from "@/__tests__/helpers/uploadQueue";

type UploadZoneType = typeof import("@/components/UploadZone").UploadZone;
type UploadProgressType = typeof import("@/components/UploadProgress").UploadProgress;

interface Modules {
  UploadZone: UploadZoneType;
  UploadProgress: UploadProgressType;
}

async function loadModules(): Promise<Modules> {
  const [{ UploadZone }, { UploadProgress }] = await Promise.all([
    import("@/components/UploadZone"),
    import("@/components/UploadProgress"),
  ]);
  return { UploadZone, UploadProgress };
}

/**
 * The drawer's props are the root layout's, and the layout is a server
 * component with nothing to pass: reading the queue itself is the contract.
 */
const asRootDrawer = (drawer: UploadProgressType) =>
  drawer as unknown as ComponentType;

function root(drawer: UploadProgressType, page: ReactNode) {
  const Drawer = asRootDrawer(drawer);
  return (
    <>
      {page}
      <Drawer />
    </>
  );
}

function zone(
  UploadZone: UploadZoneType,
  drive: string,
  folderPath: string,
  key?: string,
) {
  return (
    <UploadZone key={key} drive={drive} folderPath={folderPath}>
      <div data-testid={`view-${drive}-${folderPath || "root"}`} />
    </UploadZone>
  );
}

const file = (name: string) => new File(["data"], name, { type: "text/plain" });

/** The browser's leave-page confirmation, as a dispatched event. */
function leavePage(): Event {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event;
}

/** The drawer's header, which is its collapse control. */
function collapseControl(): HTMLElement {
  return screen.getByRole("button", { name: /^Upload/ });
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(element);
  });
}

function holdInit(api: UploadApi): Deferred<InitResult> {
  const held = deferred<InitResult>();
  api.initUpload.mockReturnValue(held.promise);
  return held;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
});

/** A dropped folder whose read the test ends by hand. */
function droppedFolder(
  name: string,
  children: unknown[],
  gate: Deferred<void>,
): { dataTransfer: { items: unknown[]; files: unknown[] } } {
  let batch = 0;
  const directory = {
    isDirectory: true,
    isFile: false,
    name,
    createReader: () => ({
      readEntries: (callback: (entries: unknown[]) => void) => {
        void gate.promise.then(() => callback(batch++ === 0 ? children : []));
      },
    }),
  };
  return {
    dataTransfer: {
      items: [{ webkitGetAsEntry: () => directory }],
      files: [],
    },
  };
}

const fileEntry = (name: string) => ({
  isFile: true,
  isDirectory: false,
  name,
  file: (resolve: (picked: File) => void) => resolve(file(name)),
});

describe("SPEC-CORE-030 I1 — the destination is fixed at the drop", () => {
  it("SPEC-CORE-030 I1 queues what a folder read returns after the viewer has left", async () => {
    const api = await mockedApi();
    const { UploadZone, UploadProgress } = await loadModules();
    const read = deferred<void>();

    const view = render(root(UploadProgress, zone(UploadZone, "main", "recipes")));
    const zoneElement = view.container.querySelector("[data-upload-zone]")!;
    await act(async () => {
      fireEvent.drop(zoneElement, droppedFolder("trip", [fileEntry("a.txt")], read));
    });

    view.rerender(root(UploadProgress, null));
    read.resolve();
    await flush();

    expect(
      initBodies(api.initUpload).map(([drive, body]) => [
        drive,
        body.folder_path,
        body.relative_path,
      ]),
    ).toEqual([["main", "recipes", "trip/a.txt"]]);
    expect(screen.getByText("trip/a.txt")).toBeInTheDocument();
  });
});

describe("SPEC-CORE-030 I2 — a hand-off outlives the view", () => {
  it("SPEC-CORE-030 I2 keeps the entry listed while the view that started it unmounts", async () => {
    const api = await mockedApi();
    const init = holdInit(api);
    const { UploadZone, UploadProgress } = await loadModules();

    const view = render(root(UploadProgress, zone(UploadZone, "main", "recipes", "a")));
    await dropOn(view.container, [file("a.txt")]);

    expect(screen.getByText("a.txt")).toBeInTheDocument();
    expect(screen.getByText("Uploading")).toBeInTheDocument();

    view.rerender(root(UploadProgress, null));

    expect(screen.getByText("a.txt")).toBeInTheDocument();
    expect(screen.getByText("Uploading")).toBeInTheDocument();
    expect(api.cancelUpload).not.toHaveBeenCalled();
    expect(api.initUpload).toHaveBeenCalledTimes(1);

    init.resolve(initResult("upload-1"));
    await flush();

    expect(api.uploadChunk).toHaveBeenCalledTimes(1);
    expect(api.completeUpload).toHaveBeenCalledTimes(1);
    expect(screen.getByText("a.txt")).toBeInTheDocument();
  });

  it("SPEC-CORE-030 I2 keeps every entry through a router.refresh of the page", async () => {
    const api = await mockedApi();
    holdInit(api);
    const { UploadZone, UploadProgress } = await loadModules();

    const view = render(root(UploadProgress, zone(UploadZone, "main", "recipes", "before")));
    await dropOn(view.container, [file("a.txt"), file("b.txt")]);
    expect(screen.getByText("a.txt")).toBeInTheDocument();
    expect(screen.getByText("b.txt")).toBeInTheDocument();

    // A refresh re-renders the page subtree under the same providers; the
    // key is what makes the page's own state start over.
    view.rerender(root(UploadProgress, zone(UploadZone, "main", "recipes", "after")));

    expect(screen.getByText("a.txt")).toBeInTheDocument();
    expect(screen.getByText("b.txt")).toBeInTheDocument();
    expect(api.initUpload).toHaveBeenCalledTimes(2);
    expect(api.cancelUpload).not.toHaveBeenCalled();
  });
});

describe("SPEC-CORE-030 I3 — cancel reaches the entry's own drive", () => {
  it("SPEC-CORE-030 I3 cancels from another drive's page and sends no complete", async () => {
    const api = await mockedApi();
    api.initUpload.mockResolvedValue(initResult("upload-7", 2));
    const inFlight = deferred<unknown>();
    api.uploadChunk.mockReturnValue(inFlight.promise);
    const { UploadZone, UploadProgress } = await loadModules();

    const view = render(root(UploadProgress, zone(UploadZone, "alpha", "films", "a")));
    await dropOn(view.container, [file("a.txt")]);
    expect(api.uploadChunk).toHaveBeenCalledTimes(1);

    view.rerender(root(UploadProgress, zone(UploadZone, "beta", "", "b")));

    await click(screen.getByLabelText("Cancel"));

    expect(api.cancelUpload).toHaveBeenCalledWith("alpha", "upload-7");
    expect(screen.getByText("Cancelled")).toBeInTheDocument();

    // The chunk was already in flight; its success must not revive the entry.
    inFlight.resolve({});
    await flush();

    expect(api.uploadChunk).toHaveBeenCalledTimes(1);
    expect(api.completeUpload).not.toHaveBeenCalled();
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });
});

describe("SPEC-CORE-030 I4 — two at a time, in the order they were added", () => {
  it("SPEC-CORE-030 I4 holds the third file until one of the first two finishes", async () => {
    const api = await mockedApi();
    const inits = new Map<string, Deferred<InitResult>>();
    api.initUpload.mockImplementation((_drive: string, body: { filename: string }) => {
      const gate = deferred<InitResult>();
      inits.set(body.filename, gate);
      return gate.promise;
    });
    api.uploadChunk.mockResolvedValue({});
    api.completeUpload.mockResolvedValue({});
    const { UploadZone } = await loadModules();

    const view = render(
      <>
        {zone(UploadZone, "main", "films", "a")}
        {zone(UploadZone, "other", "music", "b")}
      </>,
    );

    await dropOn(view.container, [file("a1.txt"), file("a2.txt")], 0);
    await dropOn(view.container, [file("b1.txt")], 1);

    expect(initBodies(api.initUpload).map(([, body]) => body.filename)).toEqual([
      "a1.txt",
      "a2.txt",
    ]);

    inits.get("a1.txt")!.resolve(initResult("upload-a1"));
    await flush();

    expect(initBodies(api.initUpload).map(([, body]) => body.filename)).toEqual([
      "a1.txt",
      "a2.txt",
      "b1.txt",
    ]);
    expect(
      initBodies(api.initUpload).map(([drive, body]) => [drive, body.folder_path]),
    ).toEqual([
      ["main", "films"],
      ["main", "films"],
      ["other", "music"],
    ]);
  });
});

describe("SPEC-CORE-030 I5 — the leave-page confirmation follows the queue", () => {
  it("SPEC-CORE-030 I5 cancels the event while an entry is unfinished", async () => {
    const api = await mockedApi();
    holdInit(api);
    const { UploadZone, UploadProgress } = await loadModules();

    const view = render(root(UploadProgress, zone(UploadZone, "main", "films")));
    await dropOn(view.container, [file("a.txt")]);

    expect(leavePage().defaultPrevented).toBe(true);
  });

  it("SPEC-CORE-030 I5 cancels the event while an entry is pending", async () => {
    const api = await mockedApi();
    const { UploadZone, UploadProgress } = await loadModules();
    api.initUpload.mockReturnValue(deferred<InitResult>().promise);

    const view = render(root(UploadProgress, zone(UploadZone, "main", "films")));
    // Before the queue's zero-delay start, which is the whole of `pending`.
    await act(async () => {
      view.container
        .querySelector("[data-upload-zone]")!
        .dispatchEvent(
          new CustomEvent("upload-files", { detail: [file("a.txt")] }),
        );
    });

    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(leavePage().defaultPrevented).toBe(true);
  });

  it("SPEC-CORE-030 I5 cancels the event while an entry is processing", async () => {
    const api = await mockedApi();
    const finished = deferred<unknown>();
    api.initUpload.mockResolvedValue(initResult("upload-1"));
    api.uploadChunk.mockResolvedValue({});
    api.completeUpload.mockReturnValue(finished.promise);
    const { UploadZone, UploadProgress } = await loadModules();

    const view = render(root(UploadProgress, zone(UploadZone, "main", "films")));
    await dropOn(view.container, [file("a.txt")]);

    expect(screen.getByText("Processing")).toBeInTheDocument();
    expect(leavePage().defaultPrevented).toBe(true);
  });

  it("SPEC-CORE-030 I5 does not cancel the event when only finished entries remain", async () => {
    const api = await mockedApi();
    const { UploadZone, UploadProgress } = await loadModules();

    const view = render(root(UploadProgress, zone(UploadZone, "main", "films")));
    await dropOn(view.container, [file("a.txt")]);
    await flush();

    expect(api.completeUpload).toHaveBeenCalledTimes(1);
    expect(screen.getByText("a.txt")).toBeInTheDocument();
    expect(leavePage().defaultPrevented).toBe(false);
  });

  it("SPEC-CORE-030 I5 does not cancel the event for an empty queue", async () => {
    const { UploadProgress } = await loadModules();

    render(root(UploadProgress, null));

    expect(leavePage().defaultPrevented).toBe(false);
  });
});

describe("SPEC-CORE-030 I6 — an unfinished upload leaves in-app navigation alone", () => {
  it("SPEC-CORE-030 I6 does not mark the app dirty while a file is uploading", async () => {
    const api = await mockedApi();
    holdInit(api);
    const { dirtyRegistry } = await import("@/lib/dirtyRegistry");
    const { UploadZone } = await loadModules();

    const view = render(zone(UploadZone, "main", "films"));
    await dropOn(view.container, [file("a.txt")]);

    expect(dirtyRegistry.isDirty()).toBe(false);
  });
});

describe("SPEC-CORE-030 I9 — one failure does not stop the others", () => {
  it("SPEC-CORE-030 I9 shows the failed file's error and finishes the next one", async () => {
    const api = await mockedApi();
    api.initUpload.mockImplementation(async (_drive: string, body: { filename: string }) =>
      initResult(`upload-${body.filename}`),
    );
    api.uploadChunk.mockImplementation(async (_drive: string, uploadId: string) => {
      if (uploadId === "upload-a.txt") throw new Error("network down");
      return {};
    });
    const { UploadZone, UploadProgress } = await loadModules();

    const view = render(root(UploadProgress, zone(UploadZone, "main", "films")));
    await dropOn(view.container, [file("a.txt"), file("b.txt")]);
    await flush();

    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getByText("network down")).toBeInTheDocument();
    expect(api.completeUpload).toHaveBeenCalledTimes(1);
    expect(api.completeUpload).toHaveBeenCalledWith("main", "upload-b.txt");
  });
});

describe("SPEC-CORE-030 I11 — the destination-folder answer is translated", () => {
  const stages: Array<{ stage: string; fail: (api: UploadApi) => void }> = [
    {
      stage: "init",
      fail: (api) => {
        api.initUpload.mockRejectedValue(new Error("destination_folder_not_found"));
      },
    },
    {
      stage: "chunk",
      fail: (api) => {
        api.initUpload.mockResolvedValue(initResult("upload-1"));
        api.uploadChunk.mockRejectedValue(new Error("destination_folder_not_found"));
      },
    },
    {
      stage: "complete",
      fail: (api) => {
        api.initUpload.mockResolvedValue(initResult("upload-1"));
        api.uploadChunk.mockResolvedValue({});
        api.completeUpload.mockRejectedValue(new Error("destination_folder_not_found"));
      },
    },
  ];

  it.each(stages)(
    "SPEC-CORE-030 I11 shows the destination-folder text when $stage fails",
    async ({ fail }) => {
      const api = await mockedApi();
      fail(api);
      const { UploadZone, UploadProgress } = await loadModules();

      const view = render(root(UploadProgress, zone(UploadZone, "main", "films")));
      await dropOn(view.container, [file("a.txt")]);
      await flush();

      expect(screen.getByText("The destination folder was not found")).toBeInTheDocument();
      expect(screen.queryByText("destination_folder_not_found")).toBeNull();
    },
  );

  it("SPEC-CORE-030 I11 keeps today's text for every other upload error", async () => {
    const api = await mockedApi();
    api.initUpload.mockRejectedValue(new Error("API error: 404 Not Found"));
    const { UploadZone, UploadProgress } = await loadModules();

    const view = render(root(UploadProgress, zone(UploadZone, "main", "films")));
    await dropOn(view.container, [file("a.txt")]);
    await flush();

    expect(screen.getByText("API error: 404 Not Found")).toBeInTheDocument();
    expect(screen.queryByText("The destination folder was not found")).toBeNull();
  });
});

describe("SPEC-CORE-030 I12 — Clear takes the finished entries of every drive", () => {
  it("SPEC-CORE-030 I12 leaves the unfinished entry and drops the finished ones", async () => {
    const api = await mockedApi();
    const held = deferred<InitResult>();
    api.initUpload.mockImplementation(async (_drive: string, body: { filename: string }) =>
      body.filename === "c.txt" ? held.promise : initResult(`upload-${body.filename}`),
    );
    const { UploadZone, UploadProgress } = await loadModules();

    const view = render(
      root(
        UploadProgress,
        <>
          {zone(UploadZone, "main", "films", "a")}
          {zone(UploadZone, "other", "music", "b")}
        </>,
      ),
    );
    await dropOn(view.container, [file("a.txt")], 0);
    await dropOn(view.container, [file("b.txt")], 1);
    await dropOn(view.container, [file("c.txt")], 0);

    expect(screen.getByText("a.txt")).toBeInTheDocument();
    expect(screen.getByText("b.txt")).toBeInTheDocument();
    expect(screen.getByText("c.txt")).toBeInTheDocument();

    await click(screen.getByText("Clear"));

    expect(screen.queryByText("a.txt")).toBeNull();
    expect(screen.queryByText("b.txt")).toBeNull();
    expect(screen.getByText("c.txt")).toBeInTheDocument();
  });
});

describe("SPEC-CORE-030 section 3 — the drawer's collapsed state", () => {
  it("SPEC-CORE-030 section 3 keeps collapsed across navigation and expands on a new file", async () => {
    const api = await mockedApi();
    holdInit(api);
    const { UploadZone, UploadProgress } = await loadModules();

    const view = render(root(UploadProgress, zone(UploadZone, "main", "films", "a")));
    await dropOn(view.container, [file("a.txt")]);
    expect(screen.getByText("a.txt")).toBeInTheDocument();

    await click(collapseControl());
    expect(screen.queryByText("a.txt")).toBeNull();

    view.rerender(root(UploadProgress, zone(UploadZone, "main", "series", "b")));
    expect(screen.queryByText("a.txt")).toBeNull();

    await dropOn(view.container, [file("b.txt")]);
    expect(screen.getByText("a.txt")).toBeInTheDocument();
    expect(screen.getByText("b.txt")).toBeInTheDocument();
  });

  it("SPEC-CORE-030 section 3 resets to expanded when the drawer empties", async () => {
    await mockedApi();
    const { UploadZone, UploadProgress } = await loadModules();

    const view = render(root(UploadProgress, zone(UploadZone, "main", "films")));
    await dropOn(view.container, [file("a.txt")]);
    await flush();

    await click(collapseControl());
    expect(screen.queryByText("a.txt")).toBeNull();

    await click(screen.getByText("Clear"));

    await dropOn(view.container, [file("b.txt")]);
    expect(screen.getByText("b.txt")).toBeInTheDocument();
  });
});
