/**
 * SPEC-CORE-046: giving the search modal an image.
 *
 * Each test loads the modal in a fresh module graph, so the per-drive
 * availability answer and the image store start empty.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  IMG_URL,
  answerMatchMedia,
  clipboard,
  dataTransfer,
  imageFile,
  installCodec,
  installFetch,
  installObjectUrls,
  sizedFile,
  LIMIT_BYTES,
} from "@/__tests__/helpers/imageQuery";

const mockRouterPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush, replace: vi.fn() }),
}));

vi.mock("../CurrentDriveProvider", () => ({
  useCurrentDrive: () => "main",
  useSetOverrideDrive: () => () => {},
}));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getDriveFiles: () => Promise.resolve({ data: [], meta: { total: 0, page: 1, limit: 8 } }),
  getWatchHistory: () => Promise.resolve([]),
  getFolderTree: () => Promise.resolve([]),
  getDriveTags: () => Promise.resolve([]),
  getPins: () => Promise.resolve([]),
  getCollections: () => Promise.resolve([]),
  getSmartFolders: () => Promise.resolve([]),
  getDriveSummary: () => Promise.resolve({ missing_count: 0 }),
  getAuthStatus: () => Promise.resolve({ is_admin: false }),
}));

vi.mock("@/lib/semanticSearch", () => ({
  fetchSemanticHits: () => Promise.resolve({ ok: true, results: [] }),
  isSemanticSearchAvailable: () => Promise.resolve(false),
}));

const mockWriteSearchCache = vi.fn();
vi.mock("@/lib/searchCache", () => ({
  readSearchCache: () => null,
  writeSearchCache: (...args: unknown[]) => mockWriteSearchCache(...args),
}));

vi.mock("../FileTypeIcon", () => ({ FileTypeIcon: () => null }));

Element.prototype.scrollIntoView = vi.fn();

const BUTTON = "Search by image";
const ONE = "Choose one image";
const TOO_LARGE = "This image is too large (up to 20 MB and 50 megapixels)";
const UNREADABLE = "This image couldn't be read";
const DROP = "Drop to search by this image";

type Scope = { label: string; type: string; seeAllHref: (q: string) => string };

let Shell: ComponentType<{ scope?: Scope; children?: ReactNode }>;
let net: ReturnType<typeof installFetch>;

async function load() {
  vi.resetModules();
  const { GlobalSearch } = await import("../GlobalSearch");
  const { ShortcutsProvider } = await import("../ShortcutsProvider");
  const provider = await import("../search/GlobalSearchProvider");
  function Scoped({ scope }: { scope: Scope }) {
    provider.useSearchScope(scope as never);
    return null;
  }
  Shell = function TestShell({ scope }) {
    return (
      <ShortcutsProvider>
        <provider.GlobalSearchProvider>
          <GlobalSearch />
          {scope ? <Scoped scope={scope} /> : null}
        </provider.GlobalSearchProvider>
      </ShortcutsProvider>
    );
  };
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function openModal(scope?: Scope) {
  const view = render(<Shell scope={scope} />);
  fireEvent.click(screen.getByLabelText("Search"));
  await flush();
  return view;
}

const input = () => screen.getAllByRole("textbox")[0];
const pushes = () => mockRouterPush.mock.calls.map(([u]) => String(u));

beforeEach(async () => {
  mockRouterPush.mockReset();
  mockWriteSearchCache.mockReset();
  answerMatchMedia(false);
  localStorage.clear();
  sessionStorage.clear();
  net = installFetch({ status: 200, body: {} });
  installObjectUrls();
  await load();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-046 step 0 / I7: while image search is unavailable the modal is as before", () => {
  it.each([
    ["404", { status: 404, body: {} }],
    ["available false", { status: 200, body: { available: false } }],
    ["pending", { status: 0, never: true }],
    ["network error", { status: 0, network: true }],
  ])("%s: no image button, an image paste is left alone, and no drop handler", async (_name, availability) => {
    net.setAvailability(availability);
    await openModal();

    expect(net.asked).toEqual([{ drive: "main" }]);
    expect(screen.queryByRole("button", { name: BUTTON })).toBeNull();

    const pasteAllowed = fireEvent.paste(input(), { clipboardData: clipboard([imageFile()]) });
    await flush();
    expect(pasteAllowed).toBe(true);
    expect(pushes()).toEqual([]);

    const reached = vi.fn();
    document.addEventListener("drop", reached);
    const dropAllowed = fireEvent.drop(input(), { dataTransfer: dataTransfer({ files: [imageFile()] }) });
    document.removeEventListener("drop", reached);
    expect(dropAllowed).toBe(true);
    expect(reached).toHaveBeenCalled();
    expect(pushes()).toEqual([]);
  });
});

describe("SPEC-CORE-046 step 0: availability", () => {
  it("asks the availability route once for the drive, with X-Lit-Drive", async () => {
    const view = await openModal();
    fireEvent.keyDown(input(), { key: "Escape" });
    await flush();
    fireEvent.click(screen.getByLabelText("Search"));
    await flush();

    expect(net.asked).toEqual([{ drive: "main" }]);
    expect(screen.getByRole("button", { name: BUTTON })).toBeInTheDocument();
    view.unmount();
  });
});

describe("SPEC-CORE-046 step 1 / I7: paste in the modal", () => {
  it("one image with no text starts an image query: the modal closes and the URL holds only img", async () => {
    await openModal();
    fireEvent.change(input(), { target: { value: "typed words" } });

    const pasteAllowed = fireEvent.paste(input(), { clipboardData: clipboard([imageFile()]) });
    await flush();

    expect(pasteAllowed).toBe(false);
    expect(pushes()).toHaveLength(1);
    const match = IMG_URL.exec(pushes()[0]);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("main");
    expect(screen.queryByRole("button", { name: BUTTON })).toBeNull();
  });

  it("a paste with non-blank text inserts the text and ignores the image", async () => {
    await openModal();

    const pasteAllowed = fireEvent.paste(input(), { clipboardData: clipboard([imageFile()], "office text") });
    await flush();

    expect(pasteAllowed).toBe(true);
    expect(pushes()).toEqual([]);
    expect(screen.getByRole("button", { name: BUTTON })).toBeInTheDocument();
  });

  it("a paste with blank text and one image takes the image", async () => {
    await openModal();

    fireEvent.paste(input(), { clipboardData: clipboard([imageFile()], " \n\t") });
    await flush();

    expect(pushes()).toHaveLength(1);
    expect(pushes()[0]).toMatch(IMG_URL);
  });

  it("a paste of two images and no text starts nothing and asks for one", async () => {
    await openModal();

    fireEvent.paste(input(), { clipboardData: clipboard([imageFile("a.png"), imageFile("b.png")]) });
    await flush();

    expect(pushes()).toEqual([]);
    expect(screen.getByRole("alert")).toHaveTextContent(ONE);
  });

  it("a clipboard item whose file is null starts nothing, where a readable one starts a query", async () => {
    await openModal();

    fireEvent.paste(input(), { clipboardData: clipboard([null]) });
    await flush();
    expect(pushes()).toEqual([]);

    fireEvent.paste(input(), { clipboardData: clipboard([imageFile()]) });
    await flush();
    expect(pushes()).toHaveLength(1);
  });

  it("nothing of the image query reaches the search history or the search cache", async () => {
    await openModal();
    fireEvent.change(input(), { target: { value: "typed" } });

    fireEvent.paste(input(), { clipboardData: clipboard([imageFile()]) });
    await flush();

    expect(pushes()).toHaveLength(1);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(mockWriteSearchCache).not.toHaveBeenCalled();
  });
});

describe("SPEC-CORE-046 step 1 / I7: drop on the modal", () => {
  it("swallows every dragenter, dragover and drop inside it", async () => {
    await openModal();
    const reached = vi.fn();
    for (const type of ["dragenter", "dragover", "drop"]) document.addEventListener(type, reached);
    const drag = { dataTransfer: dataTransfer({ files: [new File(["x"], "notes.txt", { type: "text/plain" })] }) };

    const results = [
      fireEvent.dragEnter(input(), drag),
      fireEvent.dragOver(input(), drag),
      fireEvent.drop(input(), drag),
    ];
    await flush();
    for (const type of ["dragenter", "dragover", "drop"]) document.removeEventListener(type, reached);

    expect(results).toEqual([false, false, false]);
    expect(reached).not.toHaveBeenCalled();
    expect(pushes()).toEqual([]);
  });

  it("shows the drop overlay for one image and starts a query on its drop", async () => {
    await openModal();
    const file = imageFile();

    fireEvent.dragEnter(input(), { dataTransfer: dataTransfer({ files: [file] }) });
    expect(screen.getByText(DROP)).toBeInTheDocument();
    fireEvent.drop(input(), { dataTransfer: dataTransfer({ files: [file] }) });
    await flush();

    expect(pushes()).toHaveLength(1);
    expect(pushes()[0]).toMatch(IMG_URL);
  });

  it("a drop of several files asks for one and starts nothing", async () => {
    await openModal();
    const drag = { dataTransfer: dataTransfer({ files: [imageFile("a.png"), imageFile("b.png")] }) };

    fireEvent.dragEnter(input(), drag);
    fireEvent.drop(input(), drag);
    await flush();

    expect(pushes()).toEqual([]);
    expect(screen.getByRole("alert")).toHaveTextContent(ONE);
  });

  it("a drop of a non-image does nothing", async () => {
    await openModal();
    const drag = { dataTransfer: dataTransfer({ files: [new File(["x"], "notes.txt", { type: "text/plain" })] }) };

    fireEvent.dragEnter(input(), drag);
    const dropAllowed = fireEvent.drop(input(), drag);
    await flush();

    expect(dropAllowed).toBe(false);
    expect(pushes()).toEqual([]);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("SPEC-CORE-046 step 1: the image button", () => {
  it("opens an image file picker, and a chosen file starts a query", async () => {
    await openModal();
    const picker = document.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement | null;
    expect(picker).not.toBeNull();
    const click = vi.spyOn(picker!, "click");

    fireEvent.click(screen.getByRole("button", { name: BUTTON }));
    expect(click).toHaveBeenCalled();
    fireEvent.change(picker!, { target: { files: [imageFile()] } });
    await flush();

    expect(pushes()).toHaveLength(1);
    expect(pushes()[0]).toMatch(IMG_URL);
  });

  it("is a labelled pill on a phone", async () => {
    answerMatchMedia(true);
    await openModal();

    const pill = screen.getByRole("button", { name: BUTTON });
    expect(pill.textContent).toContain(BUTTON);
  });
});

describe("SPEC-CORE-046 step 1: no image entry while scoped or browsing", () => {
  it("a scoped modal offers no image button and leaves an image paste alone", async () => {
    const scope = { label: "Notes", type: "text", seeAllHref: (q: string) => `/x?q=${q}` };
    const view = await openModal();
    expect(screen.getByRole("button", { name: BUTTON })).toBeInTheDocument();
    view.rerender(<Shell scope={scope} />);
    await flush();
    expect(screen.getByRole("button", { name: "Remove the Notes scope" })).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: BUTTON })).toBeNull();
    const pasteAllowed = fireEvent.paste(input(), { clipboardData: clipboard([imageFile()]) });
    await flush();
    expect(pasteAllowed).toBe(true);
    expect(pushes()).toEqual([]);
  });

  it("a browsing modal offers no image button and registers no drop handler", async () => {
    await openModal();
    expect(screen.getByRole("button", { name: BUTTON })).toBeInTheDocument();
    await act(async () => {
      fireEvent.change(input(), { target: { value: "/" } });
    });
    await flush();
    expect(screen.getByLabelText("Stop browsing")).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: BUTTON })).toBeNull();
    const dropAllowed = fireEvent.drop(input(), { dataTransfer: dataTransfer({ files: [imageFile()] }) });
    expect(dropAllowed).toBe(true);
  });
});

describe("SPEC-CORE-046 step 1 / step 3: preparation and refusal", () => {
  it("keeps the modal open with a busy button while preparing; closing cancels the image", async () => {
    const decoding = { resolve: (_: unknown) => {} };
    installCodec();
    vi.stubGlobal("createImageBitmap", vi.fn(() => new Promise((r) => {
      decoding.resolve = r;
    })));
    await openModal();

    fireEvent.paste(input(), { clipboardData: clipboard([imageFile("pic.avif", "image/avif")]) });
    await flush();
    expect(screen.getByRole("button", { name: BUTTON })).toHaveAttribute("aria-busy", "true");
    expect(input()).not.toBeDisabled();

    fireEvent.keyDown(input(), { key: "Escape" });
    await flush();
    await act(async () => decoding.resolve({ width: 10, height: 10, close: () => {} }));
    await flush();

    expect(pushes()).toEqual([]);
  });

  it("Enter on text cancels the image being prepared", async () => {
    const decoding = { resolve: (_: unknown) => {} };
    installCodec();
    vi.stubGlobal("createImageBitmap", vi.fn(() => new Promise((r) => {
      decoding.resolve = r;
    })));
    await openModal();

    fireEvent.paste(input(), { clipboardData: clipboard([imageFile("pic.avif", "image/avif")]) });
    await flush();
    expect(screen.getByRole("button", { name: BUTTON })).toHaveAttribute("aria-busy", "true");
    fireEvent.change(input(), { target: { value: "words" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    await flush();
    await act(async () => decoding.resolve({ width: 10, height: 10, close: () => {} }));
    await flush();

    expect(pushes().some((u) => IMG_URL.test(u))).toBe(false);
  });

  it("a later image cancels the earlier one", async () => {
    const decoding = { resolve: (_: unknown) => {} };
    installCodec();
    vi.stubGlobal("createImageBitmap", vi.fn(() => new Promise((r) => {
      decoding.resolve = r;
    })));
    await openModal();

    fireEvent.paste(input(), { clipboardData: clipboard([imageFile("pic.avif", "image/avif")]) });
    await flush();
    fireEvent.paste(input(), { clipboardData: clipboard([imageFile("second.png")]) });
    await flush();
    await act(async () => decoding.resolve({ width: 10, height: 10, close: () => {} }));
    await flush();

    expect(pushes()).toHaveLength(1);
    expect(pushes()[0]).toMatch(IMG_URL);
  });

  it("refuses a large undecodable file under the input row; the modal stays open until the next edit", async () => {
    installCodec({ decode: "fail" });
    await openModal();

    fireEvent.paste(input(), { clipboardData: clipboard([sizedFile(LIMIT_BYTES + 1)]) });
    await flush();

    expect(pushes()).toEqual([]);
    expect(screen.getByRole("alert")).toHaveTextContent(TOO_LARGE);
    expect(screen.getByRole("button", { name: BUTTON })).toBeInTheDocument();

    fireEvent.change(input(), { target: { value: "x" } });
    await flush();
    expect(screen.queryByText(TOO_LARGE)).toBeNull();
  });

  it("clears the size message when the modal closes", async () => {
    installCodec({ decode: "fail" });
    await openModal();
    fireEvent.paste(input(), { clipboardData: clipboard([sizedFile(LIMIT_BYTES + 1)]) });
    await flush();
    expect(screen.getByText(TOO_LARGE)).toBeInTheDocument();

    fireEvent.keyDown(input(), { key: "Escape" });
    await flush();
    fireEvent.click(screen.getByLabelText("Search"));
    await flush();

    expect(screen.queryByText(TOO_LARGE)).toBeNull();
  });

  it("refuses an undecodable file of an unlisted type as unreadable", async () => {
    installCodec({ decode: "fail" });
    await openModal();

    fireEvent.paste(input(), { clipboardData: clipboard([imageFile("pic.tiff", "image/tiff")]) });
    await flush();

    expect(pushes()).toEqual([]);
    expect(screen.getByRole("alert")).toHaveTextContent(UNREADABLE);
  });
});
