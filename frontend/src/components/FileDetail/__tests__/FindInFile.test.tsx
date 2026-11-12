import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useState, type ReactNode } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";

import { RightPaneFile } from "../../folder/RightPaneFile";
import { FileDetailContent } from "../../FileDetailContent";
import { ShortcutsProvider } from "../../ShortcutsProvider";
import type { FileItem } from "@/types";
import type { MediaController } from "@/lib/mediaController";
import type { DocumentController } from "@/lib/documentController";
import { claimSlot, makeFile, relationMocks, setViewport, shellLoaded, slotMocks, usePolicyMock, withRelations } from "./harness";

const shared = vi.hoisted(() => ({
  params: new URLSearchParams(),
  replace: (() => {}) as (url: string, opts?: unknown) => void,
  push: (() => {}) as (url: string, opts?: unknown) => void,
  selectFile: (() => {}) as (id: string) => void,
  getFile: (async () => null) as (id: string) => Promise<unknown>,
  mediaController: null as unknown,
  documentController: null as unknown,
  markdown: null as string | null,
  plainText: null as string | null,
  knowledgeMarkdown: null as string | null,
  citation: undefined as string | undefined,
  intelligenceInSlots: true,
  pdfViewer: false,
  pdfText: [] as string[],
}));

vi.mock("next-intl", async () => {
  const messages = (await import("@/messages-core/ja.json")).default as Record<string, unknown>;
  const lookup = (path: string): unknown =>
    path.split(".").reduce<unknown>(
      (node, part) =>
        typeof node === "object" && node !== null
          ? (node as Record<string, unknown>)[part]
          : undefined,
      messages,
    );
  const useTranslations = (namespace?: string) => (key: string, values?: Record<string, unknown>) => {
    const path = namespace === undefined ? key : `${namespace}.${key}`;
    const raw = lookup(path);
    let text = typeof raw === "string" ? raw : path;
    for (const [k, v] of Object.entries(values ?? {})) text = text.split(`{${k}}`).join(String(v));
    return text;
  };
  return {
    useTranslations,
    useLocale: () => "ja",
    NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main",
  useSearchParams: () => shared.params,
  useRouter: () => ({
    replace: (url: string, opts?: unknown) => shared.replace(url, opts),
    push: (url: string, opts?: unknown) => shared.push(url, opts),
    back: () => {},
    forward: () => {},
    refresh: () => {},
    prefetch: () => {},
  }),
  useParams: () => ({}),
}));

vi.mock("@/hooks/useSelectedFile", () => ({
  useSelectedFile: () => ({
    fileId: shared.params.get("file"),
    selectFile: (id: string) => shared.selectFile(id),
    clearFile: () => {},
  }),
}));

vi.mock("@/hooks/useFileNav", () => ({
  useFileNav: () => ({
    prevId: null,
    nextId: null,
    position: null,
    total: null,
    navigatePrev: () => {},
    navigateNext: () => {},
  }),
}));

vi.mock("@/components/TreeToggle", () => ({
  TreeToggle: () => <button data-testid="tree-toggle">tree</button>,
}));
vi.mock("@/components/ImageGallery", () => ({ ImageGallery: () => null }));

vi.mock("react-pdf", async () => {
  const React = await import("react");
  function MockPage({
    pageNumber,
    onRenderTextLayerSuccess,
  }: {
    pageNumber: number;
    onRenderTextLayerSuccess?: () => void;
  }) {
    // react-pdf keeps the previous page's text layer for the commit in which
    // `pageNumber` changes, then swaps it once the new page has loaded.
    const [textPage, setTextPage] = React.useState(pageNumber);
    React.useEffect(() => {
      setTextPage(pageNumber);
    }, [pageNumber]);
    React.useEffect(() => {
      if (textPage === pageNumber) onRenderTextLayerSuccess?.();
    }, [textPage, pageNumber, onRenderTextLayerSuccess]);
    return (
      <div
        className="react-pdf__Page"
        data-testid="pdf-page"
        data-page-number={pageNumber}
      >
        <div className="react-pdf__Page__textContent textLayer">
          <span>{shared.pdfText[textPage - 1] ?? ""}</span>
        </div>
      </div>
    );
  }
  function MockDocument({
    children,
    onLoadSuccess,
  }: {
    children?: ReactNode;
    onLoadSuccess?: (pdf: unknown) => void;
  }) {
    React.useEffect(() => {
      onLoadSuccess?.({
        numPages: Math.max(1, shared.pdfText.length),
        getViewerPreferences: async () => null,
        getOutline: async () => null,
      });
    }, [onLoadSuccess]);
    return <div>{children}</div>;
  }
  return {
    pdfjs: { GlobalWorkerOptions: {} },
    Document: MockDocument,
    Page: MockPage,
  };
});

vi.mock("../../FilePreview", async () => {
  const { MarkdownPreview } = await import("../../MarkdownPreview");
  const { TextLines } = await import("../../TextLines");
  const { PdfPreview } = await import("../../PdfPreview");
  const { FindTextBodyProvider } = await import("../find/FindContext");
  // The real viewer is lazily loaded, so it lands after the bar has opened
  // and selected its query.
  function DeferredPdf({
    file,
    onDocumentController,
  }: {
    file: FileItem;
    onDocumentController?: (c: DocumentController | null) => void;
  }) {
    const [ready, setReady] = useState(false);
    useEffect(() => {
      setReady(true);
    }, []);
    if (!ready) return null;
    return (
      <PdfPreview
        fileId={file.id}
        title={file.filename}
        onDocumentController={onDocumentController}
      />
    );
  }
  return {
    FilePreview: ({
      file,
      onMediaController,
      onDocumentController,
    }: {
      file?: FileItem;
      onMediaController?: (c: MediaController | null) => void;
      onDocumentController?: (c: DocumentController | null) => void;
    }) => {
      useEffect(() => {
        if (!onMediaController || !shared.mediaController) return;
        onMediaController(shared.mediaController as MediaController);
        return () => onMediaController(null);
      }, [onMediaController]);
      useEffect(() => {
        if (!onDocumentController || !shared.documentController) return;
        onDocumentController(shared.documentController as DocumentController);
        return () => onDocumentController(null);
      }, [onDocumentController]);
      return (
        <div data-testid="file-preview">
          {shared.pdfViewer && file?.mime_type === "application/pdf" && (
            <DeferredPdf file={file} onDocumentController={onDocumentController} />
          )}
          {shared.markdown !== null && (
            <div data-testid="markdown-body">
              <FindTextBodyProvider>
                <MarkdownPreview
                  source={shared.markdown}
                  chrome={false}
                  mermaid={false}
                  highlight={shared.citation}
                />
              </FindTextBodyProvider>
            </div>
          )}
          {shared.plainText !== null && (
            <div data-testid="text-lines-body">
              <TextLines text={shared.plainText} filename="notes.txt" highlight={shared.citation} />
            </div>
          )}
        </div>
      );
    },
  };
});
vi.mock("../../ActiveSummaryHost", async () => ({
  ActiveSummaryHost: (await import("./harness")).ActiveSummaryHostStub,
}));
vi.mock("../related/RelatedPanel", async () => ({
  RelatedPanel: (await import("./harness")).RelatedPanelStub,
}));
vi.mock("../related/useFileRelations", async () => ({
  useFileRelations: (await import("./harness")).useFileRelationsStub,
}));
vi.mock("../../ExifSection", async () => ({
  ExifSection: (await import("./harness")).ExifSectionStub,
}));
vi.mock("../../AddonSlotsProvider", async () => {
  const harness = await import("./harness");
  return {
    useAddonSlots: () => ({
      ...harness.useAddonSlotsStub(),
      addons: shared.intelligenceInSlots
        ? { intelligence: { label: "Intelligence", icon: "brain", scope: "drive" } }
        : {},
      catalogueDrive: "main",
    }),
    useAddonStatus: () => ({ features: {} }),
  };
});
vi.mock("../../AddonSlot", async () => {
  const harness = await import("./harness");
  const { MarkdownPreview } = await import("../../MarkdownPreview");
  // The knowledge editor's own Editor component is not mounted in these
  // tests; this stands in for its preview so the shell's body provider has
  // something to mark.
  function AddonSlot({
    id,
    includeIds,
    excludeIds,
    props,
  }: {
    id: string;
    includeIds?: string[];
    excludeIds?: string[];
    props?: Record<string, unknown>;
  }) {
    if (
      id === "file-detail-sections" &&
      includeIds?.includes("knowledge-edit") &&
      shared.knowledgeMarkdown !== null
    ) {
      return (
        <div data-testid="knowledge-edit-slot">
          <MarkdownPreview
            source={shared.knowledgeMarkdown}
            chrome={false}
            mermaid={false}
          />
        </div>
      );
    }
    return (
      <harness.AddonSlotStub
        id={id}
        includeIds={includeIds}
        excludeIds={excludeIds}
        props={props}
      />
    );
  }
  return { AddonSlot, SlotEntryRenderer: harness.SlotEntryRendererStub };
});
vi.mock("@/hooks/usePolicy", async () => ({
  usePolicy: (await import("./harness")).usePolicyMock,
}));
vi.mock("../../CommentSection", async () => ({
  CommentSection: (await import("./harness")).CommentSectionStub,
}));
vi.mock("../../EditableTagChips", async () => ({
  EditableTagChips: (await import("./harness")).EditableTagChipsStub,
}));
vi.mock("../../FavoriteButton", async () => ({
  FavoriteButton: (await import("./harness")).FavoriteButtonStub,
}));
vi.mock("../../FileActions", async () => ({
  FileActions: (await import("./harness")).FileActionsStub,
}));
vi.mock("../../CastButton", async () => ({
  CastButton: (await import("./harness")).CastButtonStub,
}));
vi.mock("../../ChaptersPanel", async () => ({
  ChaptersPanel: (await import("./harness")).ChaptersPanelStub,
}));
vi.mock("@/lib/api", () => ({
  getFile: (id: string) => shared.getFile(id),
  getFileShared: (id: string) => shared.getFile(id),
  getFileNeighbors: async () => ({ prev_id: null, next_id: null }),
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
  recordFileView: async () => undefined,
  likeFile: async () => undefined,
  dislikeFile: async () => undefined,
  updateFile: async () => undefined,
}));
vi.mock("@/lib/recentlyPlayed", () => ({
  addRecentlyPlayed: () => {},
  getSavedProgress: () => null,
  saveProgress: () => {},
}));
vi.mock("../../SidebarProvider", async () => {
  const harness = await import("./harness");
  return { useSidebar: harness.useSidebarStub, useOverlaySidebar: harness.overlaySidebarSpy };
});

/* ---------- the find route, served by a fake addon ---------- */

type Kind = "utterance" | "scene" | "page" | "section" | "picture_text" | "text";

interface FindRow {
  kind: Kind;
  start?: number;
  end?: number | null;
  page?: number;
  section?: number;
  section_title?: string | null;
  ordinal: number;
  snippet: string;
  match_start: number;
  match_length: number;
}

interface FindAnswer {
  query: string;
  indexed: boolean;
  total: number;
  truncated: boolean;
  rows: FindRow[];
}

interface FindCall {
  fileId: string;
  q: string;
  drive: string | null;
  signal: AbortSignal | undefined;
}

type Reply = FindAnswer | { status: number } | "network-error";

const TERM = "needle";
const DRIVE = "main";
const BARE_DRIVE = "bare";

const findCalls: FindCall[] = [];
let reply: (q: string) => Reply | Promise<Reply> = () => answer([]);

function row(kind: Kind, snippet: string, extra: Partial<FindRow> = {}, term = TERM): FindRow {
  const at = snippet.toLowerCase().indexOf(term.toLowerCase());
  return {
    kind,
    ordinal: 1,
    snippet,
    match_start: at,
    match_length: term.length,
    ...extra,
  };
}

function answer(rows: FindRow[], extra: Partial<FindAnswer> = {}): FindAnswer {
  return { query: TERM, indexed: true, total: rows.length, truncated: false, rows, ...extra };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(raw, "http://litloft.local");
      if (url.pathname === "/api/addons/status") {
        const drive = url.searchParams.get("drive");
        return jsonResponse({
          addons:
            drive === DRIVE
              ? { intelligence: { label: "Intelligence", icon: "brain", scope: "drive" } }
              : {},
          slots: {},
        });
      }
      const find = /^\/api\/addons\/intelligence\/files\/([^/]+)\/find$/.exec(url.pathname);
      if (find) {
        const headers = new Headers(init?.headers);
        const q = url.searchParams.get("q") ?? "";
        findCalls.push({ fileId: find[1], q, drive: headers.get("X-Lit-Drive"), signal: init?.signal ?? undefined });
        const out = await reply(q);
        if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        if (out === "network-error") throw new TypeError("Failed to fetch");
        if ("status" in out) return jsonResponse({ detail: "x" }, out.status);
        return jsonResponse(out);
      }
      return jsonResponse({}, 404);
    }),
  );
}

/* ---------- page, controllers, and reading the screen ---------- */

const VIDEO = makeFile({ id: "vid000000001", filename: "talk.mp4", drive: DRIVE });
const PDF = makeFile({
  id: "pdf000000001",
  filename: "paper.pdf",
  drive: DRIVE,
  file_type: "document",
  mime_type: "application/pdf",
  duration: null,
});
const BARE_VIDEO = makeFile({ id: "bare00000001", filename: "talk.mp4", drive: BARE_DRIVE });
const MARKDOWN = makeFile({
  id: "md0000000001",
  filename: "note.md",
  drive: DRIVE,
  file_type: "document",
  mime_type: "text/markdown",
  duration: null,
});

function fakeMediaController() {
  return {
    seek: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    togglePlay: vi.fn(),
    toggleMute: vi.fn(),
    toggleFullscreen: vi.fn(),
    getCurrentTime: () => 0,
    getDuration: () => 600,
    isPaused: () => true,
    isMuted: () => false,
    getVolume: () => 1,
    setVolume: vi.fn(),
    getPlaybackRate: () => 1,
    setPlaybackRate: vi.fn(),
  };
}

let player = fakeMediaController();
let documentNav = { goTo: vi.fn() };

function setUrl(file: FileItem, extra = "") {
  shared.params = new URLSearchParams(`file=${file.id}${extra}`);
}

async function openPage(file: FileItem = VIDEO, extra = "") {
  setUrl(file, extra);
  const utils = render(
    <ShortcutsProvider>
      <RightPaneFile fileId={file.id} drive={file.drive} />
    </ShortcutsProvider>,
  );
  await shellLoaded();
  return utils;
}

const FIND_BUTTON = "このファイル内を検索";

const findButton = () => screen.findByRole("button", { name: FIND_BUTTON });

function focusedInput(): HTMLInputElement {
  const el = document.activeElement;
  expect(el?.tagName).toBe("INPUT");
  return el as HTMLInputElement;
}

async function openBar(): Promise<HTMLInputElement> {
  fireEvent.click(await findButton());
  return focusedInput();
}

function typeInto(input: HTMLInputElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

function pressCtrlF(target: Document | Element = document): boolean {
  return fireEvent.keyDown(target, { key: "f", ctrlKey: true });
}

const enter = (input: HTMLInputElement, shiftKey = false) =>
  fireEvent.keyDown(input, { key: "Enter", shiftKey });

/** The shortest element whose text is exactly `text`. */
function exactly(text: string): HTMLElement[] {
  return screen.queryAllByText(
    (_content, el) =>
      !!el &&
      el.textContent === text &&
      !Array.from(el.children).some((child) => child.textContent === text),
  );
}

async function findCount(text: string) {
  await waitFor(() => expect(exactly(text).length).toBeGreaterThan(0));
}

function rowWith(snippet: string): HTMLElement {
  const [found] = exactly(snippet);
  if (!found) throw new Error(`no row shows ${snippet}`);
  return found;
}

const listedSnippets = (snippets: string[]) => snippets.filter((s) => exactly(s).length > 0);

const tabs = () => screen.queryAllByRole("tab").map((t) => t.textContent?.trim() ?? "");

function selectedTab(): string | null {
  const selected = screen.queryAllByRole("tab").filter((t) => t.getAttribute("aria-selected") === "true");
  return selected[0]?.textContent?.trim() ?? null;
}

// A place in the list is a button too, and its locator can start with a
// chip's label.
const queryChip = (name: RegExp) =>
  screen
    .queryAllByRole("button")
    .filter((b) => !b.closest("li") && name.test(b.textContent?.trim() ?? ""));

function chip(name: RegExp): HTMLElement {
  const [found] = queryChip(name);
  if (!found) throw new Error(`no chip ${name}`);
  return found;
}


function statusWith(text: string): HTMLElement | null {
  return (exactly(text)[0]?.closest('[role="status"]') as HTMLElement | null) ?? null;
}

const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });

const THREE_UTTERANCES = () => [
  row("utterance", "first needle spoken", { start: 5, end: 9 }),
  row("utterance", "second needle spoken", { start: 65, end: 70 }),
  row("utterance", "third needle spoken", { start: 3665, end: 3670 }),
];

beforeEach(() => {
  findCalls.length = 0;
  reply = () => answer([]);
  installFetch();
  player = fakeMediaController();
  documentNav = { goTo: vi.fn() };
  shared.mediaController = player;
  shared.documentController = documentNav;
  shared.markdown = null;
  shared.plainText = null;
  shared.knowledgeMarkdown = null;
  shared.citation = undefined;
  shared.intelligenceInSlots = true;
  shared.pdfViewer = false;
  shared.replace = vi.fn();
  shared.push = vi.fn();
  shared.selectFile = vi.fn();
  shared.getFile = async (id: string) =>
    [VIDEO, PDF, BARE_VIDEO, MARKDOWN].find((f) => f.id === id) ??
    makeFile({ id, drive: DRIVE });
  relationMocks.value = [];
  usePolicyMock.mockReturnValue({ enabled: true, isLoading: false });
  window.localStorage.clear();
  setViewport();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/* ---------- availability ---------- */

describe("SPEC-CORE-028 I7 I10 the find button exists only on the file page of a drive with the intelligence addon", () => {
  it("shows the button, named for what it does, on a drive with intelligence and not on one without", async () => {
    const first = await openPage(VIDEO);
    expect(await findButton()).toBeInTheDocument();
    first.unmount();

    shared.intelligenceInSlots = false;
    await openPage(BARE_VIDEO);
    await flush();
    expect(screen.queryByRole("button", { name: FIND_BUTTON })).toBeNull();
  });

  it("leaves Ctrl+F to the browser on a drive without intelligence, and takes it on one with", async () => {
    const first = await openPage(VIDEO);
    await findButton();
    expect(pressCtrlF()).toBe(false);
    expect(focusedInput()).toBeInTheDocument();
    first.unmount();

    shared.intelligenceInSlots = false;
    await openPage(BARE_VIDEO);
    await flush();
    expect(pressCtrlF()).toBe(true);
    expect(document.activeElement?.tagName).not.toBe("INPUT");
  });

  it("has no button and no shortcut on the collection surface", async () => {
    // HTML rides the shared shell on every surface, so the collection
    // surface draws a page row here and the absence of the button is
    // the surface rule, not a missing row.
    const page = makeFile({
      id: "html00000001",
      filename: "page.html",
      mime_type: "text/html",
      drive: DRIVE,
    });
    shared.getFile = async () => page;
    setUrl(page);
    const canonical = render(
      <ShortcutsProvider>
        <FileDetailContent fileId={page.id} drive={DRIVE} />
      </ShortcutsProvider>,
    );
    expect(await findButton()).toBeInTheDocument();
    canonical.unmount();

    render(
      <ShortcutsProvider>
        <FileDetailContent fileId={page.id} drive={DRIVE} surface="collection" />
      </ShortcutsProvider>,
    );
    await shellLoaded();
    await flush();
    expect(screen.queryByRole("button", { name: FIND_BUTTON })).toBeNull();
    expect(pressCtrlF()).toBe(true);
  });
});

/* ---------- opening ---------- */

describe("SPEC-CORE-028 I10 opening the bar", () => {
  it("from the button focuses the input and lists and selects the 検索 tab right after Info", async () => {
    withRelations(1);
    await openPage(VIDEO);
    await findButton();
    const before = tabs();
    expect(before.length).toBe(2);

    const input = await openBar();

    expect(input).toHaveFocus();
    expect(tabs()).toEqual([before[0], "検索", before[1]]);
    expect(selectedTab()).toBe("検索");
  });

  it("from Ctrl+F does the same, and claims the key", async () => {
    await openPage(VIDEO);
    await findButton();

    expect(pressCtrlF()).toBe(false);

    expect(focusedInput()).toBeInTheDocument();
    expect(tabs()).toContain("検索");
    expect(selectedTab()).toBe("検索");
  });

  it("selects the query again on a second press while open elsewhere on the page", async () => {
    await openPage(VIDEO);
    const input = await openBar();
    typeInto(input, TERM);
    act(() => {
      input.blur();
    });

    expect(pressCtrlF()).toBe(false);

    expect(input).toHaveFocus();
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, TERM.length]);
  });

  it("reopens with the last query selected and fetches it again", async () => {
    reply = () => answer(THREE_UTTERANCES());
    await openPage(VIDEO);
    const input = await openBar();
    typeInto(input, TERM);
    await findCount("3 件");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByDisplayValue(TERM)).toBeNull();
    const fetched = findCalls.length;

    const again = await openBar();

    expect(again.value).toBe(TERM);
    expect([again.selectionStart, again.selectionEnd]).toEqual([0, TERM.length]);
    await waitFor(() => expect(findCalls.length).toBeGreaterThan(fetched));
    expect(findCalls.at(-1)!.q).toBe(TERM);
    await findCount("3 件");
  });

  it("opens a closed inspector without writing the persisted preference, and closing closes it again", async () => {
    window.localStorage.setItem(`inspector-open:${DRIVE}`, "false");
    reply = () => answer(THREE_UTTERANCES());
    await openPage(VIDEO);
    expect(screen.queryByTestId("file-actions")).toBeNull();

    const input = await openBar();
    typeInto(input, TERM);

    await waitFor(() => expect(exactly("first needle spoken").length).toBeGreaterThan(0));
    expect(window.localStorage.getItem(`inspector-open:${DRIVE}`)).toBe("false");

    fireEvent.keyDown(focusedInput(), { key: "Escape" });

    await waitFor(() => expect(exactly("first needle spoken")).toEqual([]));
    expect(screen.queryByTestId("file-actions")).toBeNull();
    expect(window.localStorage.getItem(`inspector-open:${DRIVE}`)).toBe("false");
  });
});

/* ---------- when Ctrl+F is not taken ---------- */

describe("SPEC-CORE-028 I7 Ctrl+F is left to the browser where the bar does not own it", () => {
  it("in the bar's own input, where a second press opens the browser's find", async () => {
    await openPage(VIDEO);
    const input = await openBar();

    expect(pressCtrlF(input)).toBe(true);
    expect(input).toBeInTheDocument();
  });

  it("in any other editable field, and not once focus leaves it", async () => {
    await openPage(VIDEO);
    await findButton();
    const note = document.createElement("textarea");
    document.body.appendChild(note);
    note.focus();

    expect(pressCtrlF(note)).toBe(true);
    expect(document.activeElement).toBe(note);

    note.remove();
    expect(pressCtrlF()).toBe(false);
    expect(focusedInput()).toBeInTheDocument();
  });

  it("while an aria-modal element is open, and not once it closes", async () => {
    await openPage(VIDEO);
    await findButton();
    const modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    document.body.appendChild(modal);

    expect(pressCtrlF()).toBe(true);
    expect(document.activeElement?.tagName).not.toBe("INPUT");

    modal.remove();
    expect(pressCtrlF()).toBe(false);
    expect(focusedInput()).toBeInTheDocument();
  });

  it("while the document is in full screen, and not once it leaves", async () => {
    await openPage(VIDEO);
    await findButton();
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => document.body,
    });

    expect(pressCtrlF()).toBe(true);

    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => null });
    expect(pressCtrlF()).toBe(false);
    expect(focusedInput()).toBeInTheDocument();
  });

  it("on the phone layout, which keeps the button", async () => {
    setViewport(500);
    await openPage(VIDEO);
    expect(await findButton()).toBeInTheDocument();

    expect(pressCtrlF()).toBe(true);
    expect(document.activeElement?.tagName).not.toBe("INPUT");
  });
});

/* ---------- fetching ---------- */

describe("SPEC-CORE-028 I6 fetching follows the latest query only", () => {
  it("fetches 300 ms after the last keystroke, once, with the drive header", async () => {
    await openPage(VIDEO);
    const input = await openBar();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    typeInto(input, "nee");
    act(() => vi.advanceTimersByTime(200));
    typeInto(input, TERM);
    act(() => vi.advanceTimersByTime(299));
    await flush();
    expect(findCalls).toEqual([]);

    act(() => vi.advanceTimersByTime(1));
    await flush();

    expect(findCalls.map(({ fileId, q, drive }) => ({ fileId, q, drive }))).toEqual([
      { fileId: VIDEO.id, q: TERM, drive: DRIVE },
    ]);
  });

  it.each([
    ["empty", ""],
    ["whitespace-only", "  \t "],
  ])("clears everything and fetches nothing for %s input", async (_name, value) => {
    reply = () => answer(THREE_UTTERANCES());
    await openPage(VIDEO);
    const input = await openBar();
    typeInto(input, TERM);
    await findCount("3 件");
    const fetched = findCalls.length;

    typeInto(input, value);

    expect(exactly("3 件")).toEqual([]);
    expect(exactly("first needle spoken")).toEqual([]);
    await new Promise((r) => setTimeout(r, 400));
    expect(findCalls.length).toBe(fetched);
  });

  it("clears the rows, the count and the current place on the keystroke itself", async () => {
    reply = () => answer(THREE_UTTERANCES());
    await openPage(VIDEO);
    const input = await openBar();
    typeInto(input, TERM);
    await findCount("3 件");
    enter(input);
    await findCount("1 / 3");

    typeInto(input, "needles");

    expect(exactly("1 / 3")).toEqual([]);
    expect(exactly("3 件")).toEqual([]);
    expect(listedSnippets(["first needle spoken", "second needle spoken"])).toEqual([]);
  });

  it("aborts the fetch in flight on the next keystroke", async () => {
    const pending = deferred<Reply>();
    reply = () => pending.promise;
    await openPage(VIDEO);
    const input = await openBar();
    typeInto(input, TERM);
    await waitFor(() => expect(findCalls.length).toBe(1));

    typeInto(input, "needles");

    expect(findCalls[0].signal?.aborted).toBe(true);
  });

  it("discards an answer to anything but the latest query", async () => {
    const early = deferred<Reply>();
    reply = (q) =>
      q === "need"
        ? early.promise
        : answer([row("utterance", "the latest needles", { start: 1 })], { query: q });
    await openPage(VIDEO);
    const input = await openBar();
    typeInto(input, "need");
    await waitFor(() => expect(findCalls.length).toBe(1));
    typeInto(input, "needles");
    await findCount("1 件");

    early.resolve(answer(THREE_UTTERANCES(), { query: "need" }));
    await flush();

    expect(exactly("1 件").length).toBeGreaterThan(0);
    expect(exactly("3 件")).toEqual([]);
    expect(exactly("first needle spoken")).toEqual([]);
  });

  it.each([
    ["Enter", false, "1 / 3"],
    ["Shift+Enter", true, "3 / 3"],
  ])("%s while the debounce is pending fetches at once and lands on that end", async (_n, shift, count) => {
    reply = () => answer(THREE_UTTERANCES());
    await openPage(VIDEO);
    const input = await openBar();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    typeInto(input, TERM);

    enter(input, shift);
    await flush();

    expect(findCalls.map((c) => c.q)).toEqual([TERM]);
    vi.useRealTimers();
    await findCount(count);
  });

  it("counts only the last of several presses made while the fetch is in flight", async () => {
    const pending = deferred<Reply>();
    reply = () => pending.promise;
    await openPage(VIDEO);
    const input = await openBar();
    typeInto(input, TERM);
    await waitFor(() => expect(findCalls.length).toBe(1));

    enter(input);
    enter(input);
    enter(input, true);
    pending.resolve(answer(THREE_UTTERANCES()));

    await findCount("3 / 3");
  });
});

describe("SPEC-CORE-028 I6 an IME composition is not a keystroke until it ends", () => {
  it("keeps the answer and fetches nothing while composing, then handles the committed text", async () => {
    reply = (q) => answer(q === TERM ? THREE_UTTERANCES() : [], { query: q });
    await openPage(VIDEO);
    const input = await openBar();
    typeInto(input, TERM);
    await findCount("3 件");
    const fetched = findCalls.length;

    fireEvent.compositionStart(input);
    fireEvent.input(input, { target: { value: `${TERM}に` }, isComposing: true });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true, keyCode: 229 });
    fireEvent.keyDown(input, { key: "Escape", isComposing: true, keyCode: 229 });
    await new Promise((r) => setTimeout(r, 400));

    expect(exactly("3 件").length).toBeGreaterThan(0);
    expect(exactly("1 / 3")).toEqual([]);
    expect(input).toBeInTheDocument();
    expect(findCalls.length).toBe(fetched);

    fireEvent.compositionEnd(input, { data: "に" });

    await waitFor(() => expect(findCalls.at(-1)!.q).toBe(`${TERM}に`));
    expect(exactly("3 件")).toEqual([]);
  });
});

/* ---------- what the answer shows ---------- */

describe("SPEC-CORE-028 I6 each state of the answer says what it is", () => {
  it("says the file is not indexed yet, never that nothing was found", async () => {
    reply = () => answer([], { indexed: false });
    await openPage(VIDEO);
    typeInto(await openBar(), TERM);

    await waitFor(() =>
      expect(statusWith("このファイルはまだ検索用に読み込まれていません")).not.toBeNull(),
    );
    expect(exactly("見つかりません")).toEqual([]);
    expect(exactly("0 件")).toEqual([]);
  });

  it("says nothing was found on an indexed file with no hit", async () => {
    reply = () => answer([]);
    await openPage(VIDEO);
    typeInto(await openBar(), TERM);

    await waitFor(() => expect(statusWith("見つかりません")).not.toBeNull());
  });

  it.each([403, 404])("says the file cannot be searched on %i, and the bar stays open", async (status) => {
    reply = () => ({ status });
    await openPage(VIDEO);
    const input = await openBar();
    typeInto(input, TERM);

    await waitFor(() => expect(statusWith("このファイルの中は検索できません")).not.toBeNull());
    expect(input).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "再試行" })).toBeNull();
  });

  it.each([
    ["500", { status: 500 }],
    ["502", { status: 502 }],
    ["504", { status: 504 }],
    ["400", { status: 400 }],
    ["422", { status: 422 }],
    ["a network failure", "network-error"],
  ] as [string, Reply][])("shows a failure with a retry on %s, and none of the earlier rows", async (_n, failure) => {
    let fail = false;
    reply = (q) => (fail ? failure : answer(THREE_UTTERANCES(), { query: q }));
    await openPage(VIDEO);
    const input = await openBar();
    typeInto(input, TERM);
    await findCount("3 件");

    fail = true;
    typeInto(input, "needles");

    await waitFor(() => expect(statusWith("検索できませんでした")).not.toBeNull());
    expect(exactly("first needle spoken")).toEqual([]);
    expect(exactly("3 件")).toEqual([]);

    fail = false;
    const fetched = findCalls.length;
    fireEvent.click(screen.getByRole("button", { name: "再試行" }));

    await waitFor(() => expect(findCalls.length).toBe(fetched + 1));
    expect(findCalls.at(-1)!.q).toBe("needles");
    await findCount("3 件");
  });
});

describe("SPEC-CORE-028 I3 the count", () => {
  it("reads N 件 with no place current and n / N with one", async () => {
    reply = () => answer(THREE_UTTERANCES());
    await openPage(VIDEO);
    const input = await openBar();
    typeInto(input, TERM);

    await findCount("3 件");
    enter(input);
    await findCount("1 / 3");
  });

  it("carries + on every count when the answer is truncated, and says the list is cut", async () => {
    const rows = Array.from({ length: 2000 }, (_, i) =>
      row(i % 2 === 0 ? "utterance" : "scene", `place ${i} needle`, { start: i }),
    );
    reply = () => answer(rows, { total: 2400, truncated: true });
    await openPage(VIDEO);
    const input = await openBar();
    typeInto(input, TERM);

    await findCount("2000+ 件");
    expect(exactly("最初の 2000 件を表示しています").length).toBeGreaterThan(0);
    for (const name of [/^すべて/, /^発話/, /^画面内の文字/]) {
      expect(chip(name).textContent).toContain("+");
    }
    enter(input);
    await findCount("1 / 2000+");
    fireEvent.click(chip(/^画面内の文字/));
    await waitFor(() => expect(exactly("1000+ 件").length).toBeGreaterThan(0));
  });
});

describe("SPEC-CORE-028 I3 the kind chips", () => {
  const MIXED = () => [
    row("utterance", "said needle once", { start: 5 }),
    row("scene", "screen needle", { start: 6 }),
    row("utterance", "said needle twice", { start: 7 }),
  ];

  it("shows a chip per category present, with its count, and filters to it in order", async () => {
    reply = () => answer(MIXED());
    await openPage(VIDEO);
    const input = await openBar();
    typeInto(input, TERM);
    await findCount("3 件");

    expect(chip(/^すべて/).textContent).toContain("3");
    expect(chip(/^発話/).textContent).toContain("2");
    expect(chip(/^画面内の文字/).textContent).toContain("1");
    expect(queryChip(/^本文/)).toEqual([]);
    expect(queryChip(/^画像の文字/)).toEqual([]);

    fireEvent.click(chip(/^発話/));
    await findCount("2 件");
    expect(listedSnippets(["said needle once", "screen needle", "said needle twice"])).toEqual([
      "said needle once",
      "said needle twice",
    ]);

    fireEvent.click(chip(/^すべて/));
    await findCount("3 件");
  });

  it("shows no chips when every row is one category, counting 本文 kinds as one", async () => {
    reply = () =>
      answer([
        row("page", "on a page needle", { page: 2 }),
        row("section", "in a section needle", { section: 3, section_title: null }),
        row("text", "in the text needle"),
      ]);
    await openPage(PDF);
    typeInto(await openBar(), TERM);
    await findCount("3 件");

    expect(queryChip(/^すべて/)).toEqual([]);
    expect(queryChip(/^本文/)).toEqual([]);
  });

  it("drops the current place when a chip hides it, and steps within the chip", async () => {
    reply = () => answer(MIXED());
    await openPage(VIDEO);
    const input = await openBar();
    typeInto(input, TERM);
    await findCount("3 件");
    enter(input);
    await findCount("1 / 3");

    fireEvent.click(chip(/^画面内の文字/));

    await findCount("1 件");
    enter(input);
    await findCount("1 / 1");
    expect(player.seek).toHaveBeenLastCalledWith(6);
    enter(input);
    await findCount("1 / 1");
  });

  it("resets to すべて on a new answer", async () => {
    reply = (q) => answer(MIXED(), { query: q });
    await openPage(VIDEO);
    const input = await openBar();
    typeInto(input, TERM);
    await findCount("3 件");
    fireEvent.click(chip(/^画面内の文字/));
    await findCount("1 件");

    typeInto(input, "needl");

    await findCount("3 件");
  });
});

/* ---------- stepping and jumping ---------- */

describe("SPEC-CORE-028 I3 stepping through the places", () => {
  it("goes forward with Enter and back with Shift+Enter, wrapping at both ends", async () => {
    reply = () => answer(THREE_UTTERANCES());
    await openPage(VIDEO);
    const input = await openBar();
    typeInto(input, TERM);
    await findCount("3 件");

    const steps: [boolean, string, number][] = [
      [false, "1 / 3", 5],
      [false, "2 / 3", 65],
      [false, "3 / 3", 3665],
      [false, "1 / 3", 5],
      [true, "3 / 3", 3665],
      [true, "2 / 3", 65],
    ];
    for (const [shift, count, start] of steps) {
      enter(input, shift);
      await findCount(count);
      expect(player.seek).toHaveBeenLastCalledWith(start);
    }
  });

  it("goes to the last place on Shift+Enter with nothing current", async () => {
    reply = () => answer(THREE_UTTERANCES());
    await openPage(VIDEO);
    const input = await openBar();
    typeInto(input, TERM);
    await findCount("3 件");

    enter(input, true);

    await findCount("3 / 3");
    expect(player.seek).toHaveBeenLastCalledWith(3665);
  });

  it("steps exactly once per Enter when 60 presses arrive with no gap", async () => {
    const rows = Array.from({ length: 180 }, (_, i) =>
      row("text", `line ${i} needle`, { ordinal: i + 1 }),
    );
    shared.plainText = rows.map((r) => r.snippet).join("\n");
    reply = () => answer(rows);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await openPage(PDF);
      await screen.findByTestId("text-lines-body");
      const input = await openBar();
      typeInto(input, TERM);
      await findCount("180 件");

      act(() => {
        for (let i = 0; i < 60; i += 1) {
          input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        }
      });

      await findCount("60 / 180");
      expect(error).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });

  it("makes a chosen row current", async () => {
    reply = () => answer(THREE_UTTERANCES());
    await openPage(VIDEO);
    typeInto(await openBar(), TERM);
    await findCount("3 件");

    fireEvent.click(rowWith("second needle spoken"));

    await findCount("2 / 3");
    expect(player.seek).toHaveBeenLastCalledWith(65);
  });
});

describe("SPEC-CORE-028 I4 the current place moves the viewer by its kind", () => {
  it("seeks the player to an utterance's or a scene's start and never plays or pauses it", async () => {
    reply = () =>
      answer([
        row("utterance", "said needle", { start: 12.5, end: 20 }),
        row("scene", "shown needle", { start: 30, end: null }),
      ]);
    await openPage(VIDEO);
    const input = await openBar();
    typeInto(input, TERM);
    await findCount("2 件");

    enter(input);
    await waitFor(() => expect(player.seek).toHaveBeenLastCalledWith(12.5));
    enter(input);
    await waitFor(() => expect(player.seek).toHaveBeenLastCalledWith(30));

    expect(player.play).not.toHaveBeenCalled();
    expect(player.pause).not.toHaveBeenCalled();
    expect(player.togglePlay).not.toHaveBeenCalled();
  });

  it("moves a document to a page row's page and a section row's section", async () => {
    reply = () =>
      answer([
        row("page", "on page needle", { page: 7 }),
        row("section", "in section needle", { section: 4, section_title: "Four" }),
      ]);
    await openPage(PDF);
    const input = await openBar();
    typeInto(input, TERM);
    await findCount("2 件");

    enter(input);
    await waitFor(() => expect(documentNav.goTo).toHaveBeenLastCalledWith({ page: 7 }));
    enter(input);
    await waitFor(() => expect(documentNav.goTo).toHaveBeenLastCalledWith({ section: 4 }));
  });

  it.each([
    ["picture_text", row("picture_text", "a sign reads needle")],
    ["text outside a marking viewer", row("text", "office needle text")],
  ])("moves nothing for %s, and still makes it current", async (_n, only) => {
    reply = () => answer([only]);
    await openPage(PDF);
    const input = await openBar();
    typeInto(input, TERM);
    await findCount("1 件");

    enter(input);

    await findCount("1 / 1");
    expect(player.seek).not.toHaveBeenCalled();
    expect(documentNav.goTo).not.toHaveBeenCalled();
  });
});

describe("SPEC-CORE-028 the locator of each row", () => {
  it.each([
    ["an utterance under an hour", row("utterance", "u needle", { start: 65 }), ["01:05", "発話"]],
    ["an utterance past an hour", row("utterance", "u needle", { start: 3665 }), ["1:01:05", "発話"]],
    ["a scene", row("scene", "s needle", { start: 5 }), ["00:05", "画面内の文字"]],
    ["a page", row("page", "p needle", { page: 12 }), ["p. 12"]],
    ["a titled section", row("section", "t needle", { section: 3, section_title: "第三章 倉庫" }), ["第三章 倉庫"]],
    ["an untitled section", row("section", "t needle", { section: 3, section_title: null }), ["第 3 節"]],
    ["picture text", row("picture_text", "g needle"), ["画像の文字"]],
    ["text", row("text", "x needle"), ["本文"]],
  ] as [string, FindRow, string[]][])("shows %s with its locator and marks the term in its snippet", async (_n, only, locator) => {
    reply = () => answer([only]);
    await openPage(only.kind === "utterance" || only.kind === "scene" ? VIDEO : PDF);
    typeInto(await openBar(), TERM);
    await findCount("1 件");

    const snippet = rowWith(only.snippet);
    const mark = Array.from(snippet.querySelectorAll("*")).find((el) => el.textContent === TERM);
    expect(mark).toBeDefined();
    expect(mark!.className).toContain("bg-highlight-bg");

    let container: HTMLElement | null = snippet;
    while (container && !locator.every((l) => container!.textContent!.includes(l))) {
      container = container.parentElement;
    }
    expect(container).not.toBeNull();
    expect(container!.textContent!.length).toBeLessThan(only.snippet.length + 40);
  });
});

/* ---------- closing and changing files ---------- */

describe("SPEC-CORE-028 I8 closing the bar", () => {
  it("on Escape unlists the 検索 tab, gives back the tab it replaced, and leaves the player where it is", async () => {
    withRelations(1);
    reply = () => answer(THREE_UTTERANCES());
    await openPage(VIDEO);
    await findButton();
    const [, related] = tabs();
    fireEvent.click(screen.getAllByRole("tab").find((t) => t.textContent?.trim() === related)!);
    expect(selectedTab()).toBe(related);

    const input = await openBar();
    typeInto(input, TERM);
    await findCount("3 件");
    enter(input);
    await waitFor(() => expect(player.seek).toHaveBeenCalledTimes(1));

    fireEvent.keyDown(input, { key: "Escape" });

    await waitFor(() => expect(tabs()).not.toContain("検索"));
    expect(selectedTab()).toBe(related);
    expect(player.seek).toHaveBeenCalledTimes(1);
    expect(player.play).not.toHaveBeenCalled();
    expect(player.pause).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue(TERM)).toBeNull();
  });

  it("keeps the tab the viewer chose while the bar was open", async () => {
    withRelations(1);
    await openPage(VIDEO);
    await findButton();
    const [info, related] = tabs();
    fireEvent.click(screen.getAllByRole("tab").find((t) => t.textContent?.trim() === related)!);

    const input = await openBar();
    fireEvent.click(screen.getAllByRole("tab").find((t) => t.textContent?.trim() === info)!);
    fireEvent.keyDown(input, { key: "Escape" });

    await waitFor(() => expect(tabs()).not.toContain("検索"));
    expect(selectedTab()).toBe(info);
  });

  it("removes find from the URL without a new history entry", async () => {
    reply = () => answer(THREE_UTTERANCES());
    const replaceState = vi.spyOn(window.history, "replaceState");
    await openPage(VIDEO, `&find=${TERM}`);
    await findCount("3 件");

    fireEvent.keyDown(screen.getByDisplayValue(TERM), { key: "Escape" });

    await waitFor(() => {
      const urls = [
        ...(shared.replace as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0])),
        ...replaceState.mock.calls.map((c) => String(c[2])),
      ];
      expect(urls.some((u) => u.includes(`file=${VIDEO.id}`) && !/[?&]find=/.test(u))).toBe(true);
    });
    expect(shared.push).not.toHaveBeenCalled();
  });
});

describe("SPEC-CORE-028 I9 moving to another file", () => {
  it("closes the bar and clears its query", async () => {
    reply = () => answer(THREE_UTTERANCES());
    const { rerender } = await openPage(VIDEO);
    const input = await openBar();
    typeInto(input, TERM);
    await findCount("3 件");

    setUrl(PDF);
    rerender(
      <ShortcutsProvider>
        <RightPaneFile fileId={PDF.id} drive={DRIVE} />
      </ShortcutsProvider>,
    );
    await shellLoaded();

    await waitFor(() => expect(screen.queryByDisplayValue(TERM)).toBeNull());
    expect(tabs()).not.toContain("検索");
    const fresh = await openBar();
    expect(fresh.value).toBe("");
  });
});

describe("SPEC-CORE-028 I9 ?find= opens the page with the bar open on the query", () => {
  it("lists the answer with no place current", async () => {
    reply = () => answer(THREE_UTTERANCES());
    await openPage(VIDEO, `&find=${TERM}`);

    await findCount("3 件");
    expect(screen.getByDisplayValue(TERM)).toBeInTheDocument();
    expect(findCalls.map((c) => c.q)).toEqual([TERM]);
    expect(player.seek).not.toHaveBeenCalled();
    expect(selectedTab()).toBe("検索");
  });

  it("selects the query on a PDF, as on every other kind", async () => {
    shared.pdfViewer = true;
    reply = () => answer(THREE_UTTERANCES());
    await openPage(PDF, `&find=${TERM}`);

    const input = (await screen.findByDisplayValue(TERM)) as HTMLInputElement;
    await waitFor(() => expect(input).toHaveFocus());
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, TERM.length]);
    const selection = window.getSelection();
    expect(selection?.rangeCount).toBe(1);
    expect(input.contains(selection!.getRangeAt(0).commonAncestorContainer)).toBe(true);
  });

  it("strips the value and cuts it to 200 characters", async () => {
    const long = "x".repeat(250);
    reply = () => answer([]);
    await openPage(VIDEO, `&find=${encodeURIComponent(`  ${long}  `)}`);

    await waitFor(() => expect(findCalls.length).toBe(1));
    expect(findCalls[0].q).toBe("x".repeat(200));
    expect(screen.getByDisplayValue("x".repeat(200))).toBeInTheDocument();
  });

  it("ignores a value that is blank after stripping", async () => {
    const real = await openPage(VIDEO, `&find=${TERM}`);
    await waitFor(() => expect(screen.queryByDisplayValue(TERM)).not.toBeNull());
    real.unmount();
    findCalls.length = 0;

    await openPage(VIDEO, `&find=${encodeURIComponent("   ")}`);
    await findButton();
    await flush();

    expect(tabs()).not.toContain("検索");
    expect(findCalls).toEqual([]);
  });

  it("ignores any value on a drive without intelligence", async () => {
    const real = await openPage(VIDEO, `&find=${TERM}`);
    await waitFor(() => expect(screen.queryByDisplayValue(TERM)).not.toBeNull());
    real.unmount();
    findCalls.length = 0;

    shared.intelligenceInSlots = false;
    await openPage(BARE_VIDEO, `&find=${TERM}`);
    await flush();
    await new Promise((r) => setTimeout(r, 400));

    expect(screen.queryByDisplayValue(TERM)).toBeNull();
    expect(findCalls).toEqual([]);
  });
});

/* ---------- marks in a rendered MarkdownPreview ---------- */

/**
 * The occurrences of `term` in `root`'s text, each with the element that
 * holds exactly that occurrence and nothing else, or null when the
 * occurrence still sits inside a longer text.
 */
function occurrences(root: HTMLElement, term: string): (Element | null)[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const found: (Element | null)[] = [];
  const fold = (s: string) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = fold(node.textContent ?? "");
    const parent = node.parentElement;
    let at = text.indexOf(term);
    while (at >= 0) {
      found.push(parent && fold(parent.textContent ?? "") === term ? parent : null);
      at = text.indexOf(term, at + term.length);
    }
  }
  return found;
}

const NOTE = [
  "alpha alpha alpha needle bravo bravo bravo.",
  "",
  "charlie charlie charlie Needle delta delta delta.",
  "",
  "echo echo echo echo needle foxtrot foxtrot foxtrot.",
  "",
  "ＮＥＥＤＬＥ in full width is another word.",
].join("\n");

const NOTE_ROWS = () => [
  row("text", "alpha alpha alpha needle bravo bravo bravo.", { ordinal: 1 }),
  row("text", "charlie charlie charlie Needle delta delta delta.", { ordinal: 2 }),
  row("text", "echo echo echo echo needle foxtrot foxtrot foxtrot.", { ordinal: 3 }),
];

const BEACON_NOTE = [
  "---",
  "id: '20261105044627'",
  "title: Beacon maintenance notes",
  "tags:",
  "- beacon",
  "- harbor",
  "---",
  "",
  "# Beacon maintenance",
  "",
  "The beacon on the north pier was cleaned on Monday. The keeper replaced one lamp.",
  "",
  "The harbor master asked for a second check of the beacon after the storm.",
  "",
  "- Inspect the beacon lens for salt.",
  "- Record the beacon hours in the log.",
  "",
  "A final note: the south beacon needs paint before winter.",
].join("\n");

const BEACON_TERM = "beacon";

const BACKEND_DEV_NOTE = readFileSync(
  path.resolve(__dirname, "fixtures/backend-dev.md"),
  "utf8",
);

const foldAscii = (text: string) =>
  text.replace(/[A-Z]/g, (character) => character.toLowerCase());

/** The code-point indices of `term` in `note`, as the addon finds them. */
function termPositions(note: string, term: string): number[] {
  const chars = Array.from(foldAscii(note));
  const needle = Array.from(foldAscii(term));
  const found: number[] = [];
  for (let at = 0; at + needle.length <= chars.length; ) {
    if (needle.every((character, offset) => chars[at + offset] === character)) {
      found.push(at);
      at += needle.length;
    } else {
      at += 1;
    }
  }
  return found;
}

/** One row as the addon builds it, in code points: 80 either side, 「…」 where cut. */
function addonRow(note: string, at: number, ordinal: number, term: string) {
  const chars = Array.from(note);
  const length = Array.from(term).length;
  const start = Math.max(0, at - 80);
  const end = Math.min(chars.length, at + length + 80);
  const head = start > 0 ? "…" : "";
  const tail = end < chars.length ? "…" : "";
  return {
    kind: "text" as const,
    ordinal,
    snippet: `${head}${chars.slice(start, end).join("")}${tail}`,
    match_start: at - start + head.length,
    match_length: length,
  };
}

function addonRows(note: string, term: string) {
  return termPositions(note, term).map((at, index) =>
    addonRow(note, at, index + 1, term),
  );
}

function bodyStartLine(note: string): number {
  const lines = note.split("\n");
  if (lines[0] !== "---") return 0;
  const close = lines.indexOf("---", 1);
  return close < 0 ? 0 : close + 1;
}

function noteBody(note: string): string {
  const lines = note.split("\n");
  if (lines[0] !== "---") return note;
  const close = lines.indexOf("---", 1);
  return close < 0 ? note : lines.slice(close + 1).join("\n");
}

function lineOfCodePoint(note: string, at: number): number {
  return Array.from(note).slice(0, at).join("").split("\n").length - 1;
}

function sourceLinesOf(element: Element): [number, number] {
  const [from, to] = (element.getAttribute("data-source-lines") ?? "")
    .split("-")
    .map(Number);
  return [from, to];
}

async function walkFindRows(
  note: string,
  term: string,
  rows: FindRow[],
  noMarkRows: number[] = [],
) {
  shared.markdown = note;
  reply = () => answer(rows, { query: term });
  const positions = termPositions(note, term);
  const start = bodyStartLine(note);
  const scrolled: Element[] = [];
  const original = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
    scrolled.push(this);
  };
  try {
    await openPage(PDF);
    const body = await screen.findByTestId("markdown-body");
    const input = await openBar();
    typeInto(input, term);
    await findCount(`${rows.length} 件`);
    for (let index = 0; index < rows.length; index += 1) {
      scrolled.length = 0;
      enter(input);
      await findCount(`${index + 1} / ${rows.length}`);
      const line = lineOfCodePoint(note, positions[index]);
      const expectNone = line < start || noMarkRows.includes(index);
      if (expectNone) {
        await waitFor(() => {
          expect(body.querySelector("mark.find-mark-current")).toBeNull();
          expect(scrolled.filter((element) => body.contains(element))).toEqual([]);
        });
        continue;
      }
      await waitFor(() => {
        const current = body.querySelector("mark.find-mark-current");
        expect(current).not.toBeNull();
        const block = current!.closest("[data-source-lines]");
        expect(block).not.toBeNull();
        const [from, to] = sourceLinesOf(block!);
        expect(from).toBeLessThanOrEqual(line);
        expect(line).toBeLessThan(to);
        expect(scrolled.filter((element) => body.contains(element)).at(-1)).toBe(
          current,
        );
      });
    }
  } finally {
    Element.prototype.scrollIntoView = original;
  }
}

async function walkKnowledgeRows(note: string, term: string) {
  const rows = addonRows(note, term);
  const positions = termPositions(note, term);
  const start = bodyStartLine(note);
  shared.knowledgeMarkdown = noteBody(note);
  reply = () => answer(rows, { query: term });
  await openPage(MARKDOWN);
  const slot = await screen.findByTestId("knowledge-edit-slot");
  const input = await openBar();
  typeInto(input, term);
  await findCount(`${rows.length} 件`);
  let bodyOrdinal = 0;
  for (let index = 0; index < rows.length; index += 1) {
    enter(input);
    await findCount(`${index + 1} / ${rows.length}`);
    if (lineOfCodePoint(note, positions[index]) < start) {
      await waitFor(() =>
        expect(slot.querySelector("mark.find-mark-current")).toBeNull(),
      );
      continue;
    }
    const expected = bodyOrdinal;
    bodyOrdinal += 1;
    await waitFor(() => {
      const current = slot.querySelector("mark.find-mark-current");
      expect(current).not.toBeNull();
      const marks = Array.from(slot.querySelectorAll("mark.find-mark"));
      expect(marks.indexOf(current as Element)).toBe(expected);
    });
  }
}

const TODAI_NOTE = [
  "---",
  "id: '20261105044628'",
  "title: 灯台めぐりの記録",
  "tags:",
  "- 灯台",
  "---",
  "",
  "# 灯台の点検",
  "",
  "北の灯台は月曜に清掃した。南の灯台は木曜に見回る。",
  "",
  "- 灯台の扉を点検する。",
  "- 灯台の記録を残す。",
  "",
  "最後に、古い灯台の写真を撮っておく。",
].join("\n");

const TODAI_TERM = "灯台";

const ORDERED_NOTE = [
  "---",
  "title: Field notes",
  "---",
  "",
  "1. Check the beacon lamp.",
  "2. Close the beacon door.",
  "3. Log the beacon hours.",
].join("\n");

const TASK_NOTE = [
  "---",
  "title: Field notes",
  "---",
  "",
  "- [x] fix beacon cable",
  "- [ ] log beacon hours",
  "- [x] paint beacon door",
  "",
  "Keep this page for the next inspection.",
].join("\n");

const LINK_NOTE = [
  "---",
  "title: Field notes",
  "---",
  "",
  "Read the manual about the [beacon](https://example.com/x) today.",
  "",
  "Check the checklist for the [beacon](https://example.com/y) tonight.",
].join("\n");

const FENCE_NOTE = [
  "---",
  "title: Field notes",
  "---",
  "",
  "Before the fence the beacon waits.",
  "",
  "```python",
  'print("the beacon inside")',
  "```",
  "",
  "After the fence the beacon returns.",
].join("\n");

const EMOJI_NOTE = ["🚨 alert 🚨 the beacon failed", "", "Later the beacon was fixed."].join(
  "\n",
);

const BEACON_PLAIN_NOTE = [
  "---",
  "title: Beacon notes",
  "tags:",
  "- beacon",
  "---",
  "",
  "The beacon on the north pier was cleaned on Monday.",
  "",
  "The beacon lens is clear after the storm.",
  "",
  "The harbor beacon spins at night.",
  "",
  "A final beacon note for the keeper.",
].join("\n");

const TITLE_EQUALS_HEADING_NOTE = [
  "---",
  "title: Beacon maintenance",
  "---",
  "",
  "# Beacon maintenance",
  "",
  "The beacon on the pier was cleaned.",
  "",
  "Another beacon line follows.",
].join("\n");

const PLAN_TASK_NOTE = [
  "---",
  "title: Harbor",
  "---",
  "",
  "# Beacon maintenance plan",
  "",
  "- [x] Approve the beacon maintenance plan by Friday",
].join("\n");

const HEADING_TASK_NOTE = [
  "---",
  "title: Beacon maintenance plan",
  "---",
  "",
  "# Beacon maintenance plan",
  "",
  "- [x] check the lamp",
  "- [ ] paint the beacon",
].join("\n");

const HEADING_LINK_NOTE = [
  "# Beacon manual",
  "",
  "See [the guide](https://example.com/guide) for the beacon.",
].join("\n");

const FIRST_PARA_LINK_NOTE = [
  "Beacon lamps cleaned, see [log](https://example.com/a) and notes.",
  "",
  "The beacon was checked again.",
].join("\n");

const SHORT_FM_NOTE = ["---", "title: Beacon", "---", "", "Beacon", ""].join("\n");

const SHORT_NOTE = "Beacon lit at dusk.";

const LAST_WORD_NOTE =
  "The keeper checked the lens and left the light on the beacon";

const LAST_WORD_REF_NOTE = [
  "The keeper left the light on the beacon[1]",
  "",
  "[1]: https://example.com/keeper",
].join("\n");

const LAST_WORD_COMMENT_NOTE = [
  "The keeper left the light on the beacon",
  "",
  "<!-- todo later -->",
].join("\n");

const K2_NOTE = [
  "---",
  "title: 灯台の点検記録",
  "---",
  "",
  "# 灯台の点検記録",
  "",
  "北の灯台を清掃した。",
].join("\n");

const K3_NOTE = ["# 灯台", "", "1. レンズを拭く", "2. 灯台の記録をつける"].join("\n");

const SHORT_ORDER_NOTE = [
  "# Field notes",
  "",
  "1. Check beacon",
  "2. Paint beacon",
  "3. Log beacon",
].join("\n");

const LINK_URL_NOTE = [
  "# Field notes",
  "",
  "See the [beacon](https://example.com/beacon-manual) for detail.",
  "",
  "The beacon manual is on the shelf.",
].join("\n");

const LINK_URL_LIST_NOTE = [
  "# Field notes",
  "",
  "- [beacon](https://example.com/beacon) first",
  "- beacon second",
].join("\n");

const ENTITY_NOTE = [
  "# Field notes",
  "",
  "Tom &amp; Jerry found the beacon in the hall.",
  "",
  "Later the beacon was moved next to the sign.",
].join("\n");

const EMOJI_FM_NOTE = [
  "---",
  "title: Field notes",
  "---",
  "",
  "# Beacon alert",
  "",
  "🚨 the beacon failed",
].join("\n");

const REPEAT_NOTE = [
  "# Repeats",
  "",
  ...Array.from({ length: 10 }, () => "check the beacon"),
].join("\n");

const CAPTURE_NOTE = [
  "# Beacon",
  "",
  "## Captures",
  "",
  "- [log.pdf](loft://abcdefghijkl?page=3) - p. 3",
  "",
  "> see beacon captures log pdf",
].join("\n");

const CAPTURE_MAINT_NOTE = [
  "# Beacon maintenance",
  "",
  "## Captures",
  "",
  "- [log.pdf](loft://abcdefghijkl?page=3) - p. 3",
].join("\n");

const DISTILL_NOTE = [
  "# Beacon upkeep",
  "",
  "- Clean the lens",
  "- Check the beacon",
].join("\n");

const DISTILL_LINK_NOTE = [
  "# Beacon upkeep",
  "",
  "See [the map](https://example.com/map) for the beacon.",
].join("\n");

const V_NOTE = [
  "---",
  "title: 港",
  "---",
  "",
  "# 灯台の点検と清掃の記録",
  "",
  "[地図](https://example.com/map) を見て灯台へ行く。",
].join("\n");

const LONG_ORDER_NOTE = [
  "# Field notes",
  "",
  "1. Walk to the north pier and check the beacon every morning.",
  "2. Then record the beacon hours in the log after lunch.",
  "3. Finally paint the beacon door before the winter storm.",
].join("\n");

const SHORT_MEMO_NOTE = "Call the beacon guy";

const WEB_CLIP_NOTE = [
  "---",
  "title: Beacon Maintenance Guide",
  "url: https://example.com/blog/beacon-maintenance-guide",
  "---",
  "",
  "# Beacon Maintenance Guide",
  "",
  "The beacon needs care.",
].join("\n");

const WEB_CLIP_LINK_NOTE = [
  "---",
  "title: Beacon Maintenance Guide",
  "url: https://example.com/blog/beacon-maintenance-guide",
  "---",
  "",
  "# Beacon Maintenance Guide",
  "",
  "By [Jane](https://example.com/jane)",
  "",
  "The beacon needs care.",
].join("\n");

const WEB_CLIP_PARA_NOTE = [
  "---",
  "title: Beacon history",
  "url: https://example.com/blog/beacon-history",
  "---",
  "",
  "Beacon history begins at the north pier.",
  "",
  "The beacon was rebuilt later.",
].join("\n");

const FIRST_LINE_NOTE = [
  "---",
  "title: First line log",
  "id: '20261105044628'",
  "---",
  "",
  "Beacon checks start here and continue on the pier.",
].join("\n");

const FRONTMATTER_BODY_NOTE = [
  "---",
  "title: needle notes",
  "---",
  "The opening paragraph runs long enough that the snippet starts below the frontmatter and ends here.",
  "",
  "needle starts the second paragraph.",
  "",
  "Later text needle end.",
].join("\n");

describe("SPEC-CORE-028 I5 find marks in a rendered MarkdownPreview", () => {
  it("marks every occurrence, ASCII case folded, while the answer has rows, and none after closing", async () => {
    shared.markdown = NOTE;
    reply = () => answer(NOTE_ROWS());
    await openPage(PDF);
    const body = await screen.findByTestId("markdown-body");
    await waitFor(() => expect(body.textContent).toContain("foxtrot"));
    expect(occurrences(body, TERM)).toEqual([null, null, null]);

    const input = await openBar();
    typeInto(input, TERM);
    await findCount("3 件");

    await waitFor(() => expect(occurrences(body, TERM).every((el) => el !== null)).toBe(true));
    expect(occurrences(body, TERM)).toHaveLength(3);
    expect(body.textContent).toContain("ＮＥＥＤＬＥ in full width");

    fireEvent.keyDown(input, { key: "Escape" });

    await waitFor(() => expect(occurrences(body, TERM)).toEqual([null, null, null]));
  });

  it("drops every mark on the keystroke that leaves the answer", async () => {
    shared.markdown = NOTE;
    reply = (q) => (q === TERM ? answer(NOTE_ROWS()) : answer([], { indexed: false, query: q }));
    await openPage(PDF);
    const body = await screen.findByTestId("markdown-body");
    const input = await openBar();
    typeInto(input, TERM);
    await waitFor(() => expect(occurrences(body, TERM).every((el) => el !== null)).toBe(true));

    typeInto(input, "needle ");

    expect(occurrences(body, TERM)).toEqual([null, null, null]);
  });

  it("gives no current mark when the snippet is not found in the source", async () => {
    shared.markdown = NOTE;
    reply = () =>
      answer([
        row("text", "unrelated words then needle and more unrelated words", { ordinal: 3 }),
      ]);
    const scrolled: Element[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
      scrolled.push(this);
    };
    try {
      await openPage(PDF);
      const body = await screen.findByTestId("markdown-body");
      const input = await openBar();
      typeInto(input, TERM);
      await findCount("1 件");

      enter(input);

      await waitFor(() => {
        expect(body.querySelector("mark.find-mark-current")).toBeNull();
        expect(scrolled.filter((el) => body.contains(el))).toEqual([]);
      });
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });
});

const INLINE_TAG_NOTE = [
  "# Beacon notes",
  "",
  "Some text with #beacon and #harbor tags.",
].join("\n");

describe("SPEC-CORE-028 I5 the current mark follows the row's source position", () => {
  it.each([
    ["beacon-note", BEACON_NOTE, BEACON_TERM, []],
    ["beacon-plain", BEACON_PLAIN_NOTE, BEACON_TERM, []],
    ["title equal to the heading", TITLE_EQUALS_HEADING_NOTE, BEACON_TERM, []],
    ["heading then task list", HEADING_TASK_NOTE, BEACON_TERM, []],
    ["heading then link", HEADING_LINK_NOTE, BEACON_TERM, []],
    ["first paragraph with a link", FIRST_PARA_LINK_NOTE, BEACON_TERM, []],
    ["short note with frontmatter", SHORT_FM_NOTE, BEACON_TERM, []],
    ["short memo", SHORT_NOTE, BEACON_TERM, []],
    ["last word", LAST_WORD_NOTE, BEACON_TERM, []],
    ["last word with a reference definition", LAST_WORD_REF_NOTE, BEACON_TERM, []],
    ["last word with a trailing comment", LAST_WORD_COMMENT_NOTE, BEACON_TERM, []],
    ["Japanese note", TODAI_NOTE, TODAI_TERM, []],
    ["Japanese title equal to the heading", K2_NOTE, TODAI_TERM, []],
    ["Japanese numbered list", K3_NOTE, TODAI_TERM, []],
    ["numbered list", ORDERED_NOTE, BEACON_TERM, []],
    ["short numbered list", SHORT_ORDER_NOTE, BEACON_TERM, []],
    ["task list", TASK_NOTE, BEACON_TERM, []],
    ["links", LINK_NOTE, BEACON_TERM, []],
    ["link whose URL holds the term", LINK_URL_NOTE, BEACON_TERM, [1]],
    ["list link whose URL holds the term", LINK_URL_LIST_NOTE, BEACON_TERM, []],
    ["fence with a language name", FENCE_NOTE, BEACON_TERM, []],
    ["entity", ENTITY_NOTE, BEACON_TERM, []],
    ["emoji", EMOJI_NOTE, BEACON_TERM, []],
    ["emoji under a heading with frontmatter", EMOJI_FM_NOTE, BEACON_TERM, []],
    ["identical lines at the end", REPEAT_NOTE, BEACON_TERM, []],
    ["capture note", CAPTURE_NOTE, BEACON_TERM, []],
    ["capture maintenance note", CAPTURE_MAINT_NOTE, BEACON_TERM, []],
    ["distill note", DISTILL_NOTE, BEACON_TERM, []],
    ["distill note with a link", DISTILL_LINK_NOTE, BEACON_TERM, []],
    ["Japanese note with a link", V_NOTE, TODAI_TERM, []],
    ["long numbered items", LONG_ORDER_NOTE, BEACON_TERM, []],
    ["short memo with ten letters after", SHORT_MEMO_NOTE, BEACON_TERM, []],
    ["web clip", WEB_CLIP_NOTE, BEACON_TERM, []],
    ["web clip with a byline link", WEB_CLIP_LINK_NOTE, BEACON_TERM, []],
    ["web clip with the first paragraph as the body", WEB_CLIP_PARA_NOTE, BEACON_TERM, []],
    ["maintenance plan with a task item", PLAN_TASK_NOTE, BEACON_TERM, []],
    ["first body line", FIRST_LINE_NOTE, BEACON_TERM, []],
    ["frontmatter holds the term too", FRONTMATTER_BODY_NOTE, TERM, []],
    ["inline tags", INLINE_TAG_NOTE, BEACON_TERM, []],
  ] as [string, string, string, number[]][])(
    "%s: each row lands on its own source line, or gets no mark in the frontmatter",
    async (_name, note, term, noMarkRows) => {
      await walkFindRows(note, term, addonRows(note, term), noMarkRows);
    },
  );

  it("puts rows 6 and 7 of backend-dev.md on the occurrences their context matches", async () => {
    const term = "backend";
    const rows = addonRows(BACKEND_DEV_NOTE, term);
    shared.markdown = BACKEND_DEV_NOTE;
    reply = () => answer(rows, { query: term });
    await openPage(PDF);
    const body = await screen.findByTestId("markdown-body");
    const input = await openBar();
    typeInto(input, term);
    await findCount(`${rows.length} 件`);
    const marks = () => Array.from(body.querySelectorAll("mark.find-mark"));
    // Rows 1-5 are visible occurrences before the paragraph; row 6 is the
    // hidden link URL and row 7 is the visible use it precedes.
    const expected: Record<number, number> = { 6: 4, 7: 5 };
    for (let step = 1; step <= 7; step += 1) {
      enter(input);
      await findCount(`${step} / ${rows.length}`);
      const index = expected[step];
      if (index === undefined) continue;
      await waitFor(() => {
        const current = body.querySelector("mark.find-mark-current");
        expect(current).not.toBeNull();
        expect(marks().indexOf(current as Element)).toBe(index);
      });
    }
  });
});

describe("SPEC-CORE-028 I5 find marks with an emoji before the term", () => {
  it("marks the term itself in the list and lands the current mark on its occurrence", async () => {
    const rows = addonRows(EMOJI_NOTE, BEACON_TERM);
    shared.markdown = EMOJI_NOTE;
    reply = () => answer(rows, { query: BEACON_TERM });
    await openPage(PDF);
    const body = await screen.findByTestId("markdown-body");
    const input = await openBar();
    typeInto(input, BEACON_TERM);
    await findCount(`${rows.length} 件`);

    for (const answerRow of rows) {
      const snippet = rowWith(answerRow.snippet);
      const term = Array.from(snippet.querySelectorAll("mark")).find((element) =>
        element.className.includes("bg-highlight-bg"),
      );
      expect(term?.textContent).toBe(BEACON_TERM);
    }

    enter(input);

    await waitFor(() => {
      const current = body.querySelector("mark.find-mark-current");
      expect(current).not.toBeNull();
      expect(current!.textContent).toBe(BEACON_TERM);
      expect(current!.closest("p")?.textContent ?? "").toContain("beacon failed");
    });
  });
});

describe("SPEC-CORE-028 I5 the knowledge editor's preview", () => {
  it.each([
    ["rows within 80 characters after the frontmatter", BEACON_NOTE, BEACON_TERM],
    ["a short note", SHORT_FM_NOTE, BEACON_TERM],
  ])(
    "places each body row on its own occurrence when it renders the body without frontmatter: %s",
    async (_name, note, term) => {
      await walkKnowledgeRows(note, term);
    },
  );

  it("gets the current mark from the shell's own body provider", async () => {
    shared.knowledgeMarkdown = "alpha needle bravo";
    reply = () => answer([row("text", "alpha needle bravo", { ordinal: 1 })]);
    const scrolled: Element[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
      scrolled.push(this);
    };
    try {
      await openPage(MARKDOWN);
      const slot = await screen.findByTestId("knowledge-edit-slot");
      const input = await openBar();
      typeInto(input, TERM);
      await findCount("1 件");

      enter(input);

      await waitFor(() => {
        const current = slot.querySelector("mark.find-mark-current");
        expect(current).not.toBeNull();
        expect(scrolled.filter((el) => slot.contains(el))).toContain(current);
      });
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });
});

describe("SPEC-CORE-028 I5 find marks in the inline PDF viewer", () => {
  function textLayerOf(pageNumber: number): HTMLElement {
    const page = Array.from(
      document.querySelectorAll<HTMLElement>(".react-pdf__Page"),
    ).find((el) => el.dataset.pageNumber === String(pageNumber));
    if (!page) throw new Error(`no rendered page ${pageNumber}`);
    const layer = page.querySelector<HTMLElement>(
      ".react-pdf__Page__textContent",
    );
    if (!layer) throw new Error(`page ${pageNumber} has no text layer`);
    return layer;
  }

  const marksIn = (root: ParentNode, current = false) =>
    Array.from(
      root.querySelectorAll(
        current ? "mark.find-mark-current" : "mark.find-mark",
      ),
    );

  it("marks the text layer, outlines the row's own page, and clears on close", async () => {
    shared.pdfViewer = true;
    shared.pdfText = [
      "page one has a needle here",
      "page two has another needle there",
    ];
    const pageTwo = shared.pdfText[1];
    reply = () => answer([row("page", pageTwo, { page: 2 })]);
    const scrolled: Element[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
      scrolled.push(this);
    };
    try {
      await openPage(PDF);
      const input = await openBar();
      typeInto(input, TERM);
      await findCount("1 件");

      await waitFor(() => expect(marksIn(textLayerOf(1))).toHaveLength(1));
      expect(marksIn(textLayerOf(1), true)).toHaveLength(0);

      enter(input);
      await findCount("1 / 1");

      await waitFor(() => {
        const layer = textLayerOf(2);
        expect(marksIn(layer)).toHaveLength(1);
        const current = marksIn(layer, true);
        expect(current).toHaveLength(1);
        expect(scrolled.at(-1)).toBe(current[0]);
      });

      fireEvent.click(screen.getByRole("button", { name: "検索を閉じる" }));

      await waitFor(() => expect(marksIn(textLayerOf(2))).toHaveLength(0));
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it("falls back to the row's ordinal when a page row's snippet does not match", async () => {
    shared.pdfViewer = true;
    shared.pdfText = ["page one has a needle here and a needle there"];
    reply = () => answer([row("page", "zzz needle www", { page: 1, ordinal: 2 })]);

    await openPage(PDF);
    const input = await openBar();
    typeInto(input, TERM);
    await findCount("1 件");

    enter(input);
    await findCount("1 / 1");

    await waitFor(() => {
      const layer = textLayerOf(1);
      const current = marksIn(layer, true);
      expect(current).toHaveLength(1);
      expect(current[0].nextSibling?.textContent ?? "").toMatch(/^\s+there/);
    });
  });
});

describe("SPEC-CORE-028 I5 find marks in other viewers and beside other marks", () => {
  it("marks every occurrence in a loaded, decorated TextLines, and none after closing", async () => {
    shared.plainText = ["first needle line", "second line has Needle", "third line has none"].join("\n");
    reply = () =>
      answer([
        row("text", "first needle line", { ordinal: 1 }),
        row("text", "second line has Needle", { ordinal: 2 }),
      ]);
    await openPage(PDF);
    const body = await screen.findByTestId("text-lines-body");
    await waitFor(() => expect(body.textContent).toContain("third line"));
    expect(occurrences(body, TERM)).toEqual([null, null]);

    const input = await openBar();
    typeInto(input, TERM);
    await findCount("2 件");

    await waitFor(() => expect(occurrences(body, TERM).every((el) => el !== null)).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "検索を閉じる" }));

    await waitFor(() => expect(occurrences(body, TERM)).toEqual([null, null]));
  });

  it.each([
    ["identical lines", Array.from({ length: 6 }, () => "check the beacon").join("\n")],
    ["the first and last word", "beacon first line\nmiddle\nlast line beacon"],
  ])("puts each row's current mark on its own line in %s", async (_name, text) => {
    shared.plainText = text;
    const rows = addonRows(text, BEACON_TERM);
    reply = () => answer(rows, { query: BEACON_TERM });
    await openPage(PDF);
    const body = await screen.findByTestId("text-lines-body");
    const input = await openBar();
    typeInto(input, BEACON_TERM);
    await findCount(`${rows.length} 件`);
    const allMarks = () => Array.from(body.querySelectorAll("mark.find-mark"));
    for (let index = 0; index < rows.length; index += 1) {
      enter(input);
      await findCount(`${index + 1} / ${rows.length}`);
      await waitFor(() => {
        const current = body.querySelector("mark.find-mark-current");
        expect(current).not.toBeNull();
        expect(allMarks().indexOf(current as Element)).toBe(index);
        expect(current!.closest(".code-line")?.textContent ?? "").toContain("beacon");
      });
    }
  });

  it("marks a match that spans two text nodes in each of them", async () => {
    shared.markdown = "a split nee**dle** here, and a whole needle there.";
    reply = () =>
      answer([
        row("text", "a split needle here, and a whole needle there.", { ordinal: 1 }),
        row("text", "a split needle here, and a whole needle there.", {
          ordinal: 2,
          match_start: "a split needle here, and a whole needle there.".indexOf(TERM, 10),
        }),
      ]);
    await openPage(PDF);
    const body = await screen.findByTestId("markdown-body");
    const strong = await waitFor(() => {
      const el = body.querySelector("strong");
      expect(el?.textContent).toBe("dle");
      return el!;
    });
    const textNodeOf = (text: string): Text => {
      const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.textContent === text) return n as Text;
      }
      throw new Error(`no text node ${text}`);
    };

    const input = await openBar();
    typeInto(input, TERM);
    await findCount("2 件");

    await waitFor(() => {
      expect(textNodeOf("nee").parentElement?.textContent).toBe("nee");
      const dle = textNodeOf("dle");
      expect(dle.parentElement).not.toBe(strong);
      expect(strong.contains(dle)).toBe(true);
    });
  });

  it("keeps the ?highlight= citation mark while find marks come and go", async () => {
    shared.markdown = NOTE;
    shared.citation = "charlie charlie charlie";
    reply = () => answer(NOTE_ROWS());
    await openPage(PDF);
    const body = await screen.findByTestId("markdown-body");
    const citation = () =>
      Array.from(body.querySelectorAll(".ask-citation-highlight"))
        .map((el) => el.textContent)
        .join("");
    await waitFor(() => expect(citation()).toBe("charlie charlie charlie"));

    const input = await openBar();
    typeInto(input, TERM);
    await findCount("3 件");
    await waitFor(() => expect(occurrences(body, TERM).every((el) => el !== null)).toBe(true));
    expect(citation()).toBe("charlie charlie charlie");

    fireEvent.click(screen.getByRole("button", { name: "検索を閉じる" }));

    await waitFor(() => expect(occurrences(body, TERM)).toEqual([null, null, null]));
    expect(citation()).toBe("charlie charlie charlie");
  });
});

describe("SPEC-CORE-028 I3 I8 the bar's buttons", () => {
  const next = () => screen.getByRole("button", { name: "次の箇所" });
  const previous = () => screen.getByRole("button", { name: "前の箇所" });

  it("次の箇所 steps forward and wraps from the last place to the first", async () => {
    reply = () => answer(THREE_UTTERANCES());
    await openPage(VIDEO);
    typeInto(await openBar(), TERM);
    await findCount("3 件");

    for (const [count, start] of [
      ["1 / 3", 5],
      ["2 / 3", 65],
      ["3 / 3", 3665],
      ["1 / 3", 5],
    ] as const) {
      fireEvent.click(next());
      await findCount(count);
      expect(player.seek).toHaveBeenLastCalledWith(start);
    }
  });

  it("前の箇所 goes to the last place with nothing current and wraps from the first to the last", async () => {
    reply = () => answer(THREE_UTTERANCES());
    await openPage(VIDEO);
    typeInto(await openBar(), TERM);
    await findCount("3 件");

    for (const [count, start] of [
      ["3 / 3", 3665],
      ["2 / 3", 65],
      ["1 / 3", 5],
      ["3 / 3", 3665],
    ] as const) {
      fireEvent.click(previous());
      await findCount(count);
      expect(player.seek).toHaveBeenLastCalledWith(start);
    }
  });

  it("検索を閉じる closes the bar as Escape does", async () => {
    withRelations(1);
    reply = () => answer(THREE_UTTERANCES());
    await openPage(VIDEO);
    await findButton();
    const [info] = tabs();
    const input = await openBar();
    typeInto(input, TERM);
    await findCount("3 件");
    fireEvent.click(next());
    await waitFor(() => expect(player.seek).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "検索を閉じる" }));

    await waitFor(() => expect(screen.queryByDisplayValue(TERM)).toBeNull());
    expect(tabs()).not.toContain("検索");
    expect(selectedTab()).toBe(info);
    expect(player.seek).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "次の箇所" })).toBeNull();
  });
});

describe("SPEC-CORE-028 I3 the chip text", () => {
  const chipTexts = () =>
    ["すべて", "発話", "画面内の文字", "本文", "画像の文字"].flatMap((label) =>
      queryChip(new RegExp(`^${label}`)).map((b) => b.textContent?.trim()),
    );

  it("reads the label, a space and the count", async () => {
    reply = () =>
      answer([
        row("utterance", "said needle once", { start: 5 }),
        row("scene", "screen needle", { start: 6 }),
        row("utterance", "said needle twice", { start: 7 }),
      ]);
    await openPage(VIDEO);
    typeInto(await openBar(), TERM);
    await findCount("3 件");

    expect(chipTexts()).toEqual(["すべて 3", "発話 2", "画面内の文字 1"]);
  });

  it("appends + to every count when the answer is truncated", async () => {
    const rows = Array.from({ length: 2000 }, (_, i) =>
      row(i % 4 === 0 ? "scene" : "utterance", `place ${i} needle`, { start: i }),
    );
    reply = () => answer(rows, { total: 2400, truncated: true });
    await openPage(VIDEO);
    typeInto(await openBar(), TERM);
    await findCount("2000+ 件");

    expect(chipTexts()).toEqual(["すべて 2000+", "発話 1500+", "画面内の文字 500+"]);
  });
});

/* ---------- the stacked inspector ---------- */

describe("SPEC-CORE-083 083.9 find in a stacked row with the inspector closed", () => {
  beforeEach(() => {
    // A tablet with a narrow row: the form is stacked, and the closed
    // inspector leaves the panels under the player.
    setViewport(1024);
    window.localStorage.setItem(`inspector-open:${DRIVE}`, "false");
    claimSlot("player-side", [
      { id: "transcript", label: "Transcript", priority: 10, addonName: "intelligence" },
    ]);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(900);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(700);
  });

  afterEach(() => {
    slotMocks.occupied.clear();
    slotMocks.entries.clear();
    vi.restoreAllMocks();
  });

  const panels = () => screen.queryByRole("group", { name: "パネル" });
  const transcriptNode = () => screen.getByTestId("slot-entry-transcript");
  const fit = () => screen.getByTestId("inspector-fit-host").dataset.inspectorFit;

  it("SPEC-CORE-083 turns the stacked layout on while find is open, and back off when it closes, without writing the panel list", async () => {
    reply = () => answer(THREE_UTTERANCES());
    await openPage(VIDEO);
    await waitFor(() => expect(fit()).toBe("stacked"));
    await waitFor(() => expect(panels()).not.toBeNull());
    expect(transcriptNode().closest("[hidden]")).not.toBeNull();

    const input = await openBar();
    typeInto(input, TERM);

    await waitFor(() => expect(panels()).toBeNull());
    expect(screen.getAllByTestId("slot-entry-transcript")).toHaveLength(1);
    expect(screen.getByTestId("inspector-pane")).toContainElement(
      transcriptNode(),
    );

    fireEvent.keyDown(focusedInput(), { key: "Escape" });

    await waitFor(() => expect(panels()).not.toBeNull());
    expect(fit()).toBe("stacked");
    expect(screen.queryByTestId("inspector-pane")).toBeNull();
    expect(transcriptNode().closest("[hidden]")).not.toBeNull();
    expect(window.localStorage.getItem(`inspector-open:${DRIVE}`)).toBe("false");
    expect(window.localStorage.getItem("workbench-panels")).toBeNull();
  });
});
