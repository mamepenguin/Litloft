import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";

import { FileDetailContent } from "../../FileDetailContent";
import { ShortcutsProvider } from "../../ShortcutsProvider";
import { useProfile } from "@/components/ProfileProvider";
import { makeFile, relationMocks, setApiResponses, setViewport, shellLoaded, usePolicyMock } from "./harness";

const shared = vi.hoisted(() => ({ intelligenceInSlots: true }));

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
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: () => {}, push: () => {}, back: () => {}, prefetch: () => {} }),
}));
vi.mock("@/components/ProfileProvider", () => ({ useProfile: vi.fn() }));
vi.mock("@/components/player/hooks/useFullscreen", () => ({
  useFullscreen: () => ({ isFullscreen: false, isPseudo: false, toggle: vi.fn(), exit: vi.fn() }),
}));
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
  return { AddonSlot: harness.AddonSlotStub, SlotEntryRenderer: harness.SlotEntryRendererStub };
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
const apiMocks = vi.hoisted(() => ({ getFile: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getFile: apiMocks.getFile,
  getFileShared: (id: string) => apiMocks.getFile(id),
  recordFileView: vi.fn(),
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
  getDownloadUrl: (id: string) => `/api/files/${id}/download`,
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
  getWatchProgress: vi.fn().mockResolvedValue({ position: 0.4, duration: 1 }),
  saveWatchProgress: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/recentlyPlayed", () => ({
  addRecentlyPlayed: vi.fn(),
  getSavedPlayback: vi.fn().mockReturnValue({ position: 0, duration: 1 }),
  getSavedProgress: vi.fn().mockReturnValue(0),
  saveProgress: vi.fn(),
}));
vi.mock("../../SidebarProvider", async () => {
  const harness = await import("./harness");
  return { useSidebar: harness.useSidebarStub, useOverlaySidebar: harness.overlaySidebarSpy };
});

const DRIVE = "main";
const BARE = "bare";
const BOOK = new Uint8Array([80, 75, 3, 4]);

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function installFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(raw, "http://litloft.local");
      if (url.pathname === "/api/addons/status") {
        const on = url.searchParams.get("drive") === DRIVE;
        return new Response(
          JSON.stringify({
            addons: on ? { intelligence: { label: "Intelligence", icon: "brain", scope: "drive" } } : {},
            slots: {},
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (/\/find$/.test(url.pathname)) {
        return new Response(
          JSON.stringify({ query: "x", indexed: true, total: 0, truncated: false, rows: [] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (/\/stream$/.test(url.pathname)) {
        return new Response(BOOK.slice().buffer, { status: 200 });
      }
      return new Response("{}", { status: 404 });
    }),
  );
}

const EPUB = (drive: string) =>
  makeFile({
    id: `${drive}epub00001`.slice(0, 12),
    drive,
    filename: "book.epub",
    file_type: "document",
    mime_type: "application/epub+zip",
    duration: null,
    description: "",
    has_chapters: false,
  });

async function fromReader(source: Window | null, data: unknown) {
  await act(async () => {
    window.dispatchEvent(new MessageEvent("message", { data, origin: window.location.origin, source }));
    await Promise.resolve();
  });
}

async function renderBook(drive = DRIVE) {
  const file = EPUB(drive);
  setApiResponses(file);
  const utils = render(
    <ShortcutsProvider>
      <FileDetailContent fileId={file.id} drive={drive} />
    </ShortcutsProvider>,
  );
  await shellLoaded();
  const frame = await waitFor(() => {
    const el = utils.container.querySelector("iframe");
    expect(el).not.toBeNull();
    return el!;
  });
  const posted = vi.spyOn(frame.contentWindow!, "postMessage").mockImplementation(() => {});
  return { ...utils, frame, posted };
}

function sent(posted: ReturnType<typeof vi.spyOn>, type: string) {
  return posted.mock.calls.map((c) => c[0] as { type: string; [k: string]: unknown }).filter((m) => m.type === type);
}

const barIsOpen = () => document.activeElement?.tagName === "INPUT" && screen.queryAllByRole("tab").some((t) => t.textContent?.trim() === "検索");

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
  installFetch();
  shared.intelligenceInSlots = true;
  relationMocks.value = [];
  usePolicyMock.mockReturnValue({ enabled: true, isLoading: false });
  vi.mocked(useProfile).mockReturnValue({ nickname: "kaori", setNickname: vi.fn(), clearNickname: vi.fn() });
  window.localStorage.clear();
  setViewport();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-028 I7 the parent tells the EPUB reader whether to take the find shortcut", () => {
  it("sends interceptFind true in open on a drive with intelligence, and false on one without", async () => {
    const first = await renderBook(DRIVE);
    await screen.findByRole("button", { name: "このファイル内を検索" });
    await fromReader(first.frame.contentWindow, { type: "boot" });
    await waitFor(() => expect(sent(first.posted, "open")).toHaveLength(1));
    expect(sent(first.posted, "open")[0].interceptFind).toBe(true);
    first.unmount();

    shared.intelligenceInSlots = false;
    const bare = await renderBook(BARE);
    await new Promise((r) => setTimeout(r, 50));
    await fromReader(bare.frame.contentWindow, { type: "boot" });
    await waitFor(() => expect(sent(bare.posted, "open")).toHaveLength(1));
    expect(sent(bare.posted, "open")[0].interceptFind).toBe(false);
  });

  it("sends set-find-intercept false when the layout turns to the phone, where there is no shortcut", async () => {
    const { frame, posted } = await renderBook(DRIVE);
    await screen.findByRole("button", { name: "このファイル内を検索" });
    await fromReader(frame.contentWindow, { type: "boot" });
    await waitFor(() => expect(sent(posted, "open")).toHaveLength(1));
    expect(sent(posted, "open")[0].interceptFind).toBe(true);

    act(() => {
      setViewport(500);
      window.dispatchEvent(new Event("resize"));
    });

    await waitFor(() =>
      expect(sent(posted, "set-find-intercept").at(-1)).toEqual({
        type: "set-find-intercept",
        interceptFind: false,
      }),
    );
  });
});

describe("SPEC-CORE-028 I10 find-shortcut from the EPUB reader opens the bar", () => {
  it("opens the bar, focused, with the 検索 tab selected", async () => {
    const { frame } = await renderBook(DRIVE);
    await screen.findByRole("button", { name: "このファイル内を検索" });

    await fromReader(frame.contentWindow, { type: "find-shortcut" });

    await waitFor(() => expect(barIsOpen()).toBe(true));
    const selected = screen.queryAllByRole("tab").find((t) => t.getAttribute("aria-selected") === "true");
    expect(selected?.textContent?.trim()).toBe("検索");
  });

  it("is ignored while an aria-modal element is open, and honoured once it closes", async () => {
    const { frame } = await renderBook(DRIVE);
    await screen.findByRole("button", { name: "このファイル内を検索" });
    const modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    document.body.appendChild(modal);

    await fromReader(frame.contentWindow, { type: "find-shortcut" });
    await new Promise((r) => setTimeout(r, 50));
    expect(barIsOpen()).toBe(false);

    modal.remove();
    await fromReader(frame.contentWindow, { type: "find-shortcut" });
    await waitFor(() => expect(barIsOpen()).toBe(true));
  });

  it("is ignored when it does not come from the reader frame", async () => {
    const { frame } = await renderBook(DRIVE);
    await screen.findByRole("button", { name: "このファイル内を検索" });

    await fromReader(window, { type: "find-shortcut" });
    await new Promise((r) => setTimeout(r, 50));
    expect(barIsOpen()).toBe(false);

    await fromReader(frame.contentWindow, { type: "find-shortcut" });
    await waitFor(() => expect(barIsOpen()).toBe(true));
  });
});
