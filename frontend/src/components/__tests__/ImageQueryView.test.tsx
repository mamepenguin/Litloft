/**
 * SPEC-CORE-046: the results page with `img` — the image query view.
 *
 * Rendered in Japanese because the spec states the scope line only in Japanese.
 * Each test loads the page in a fresh module graph, so the image store and the
 * per-drive availability answer start empty.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AVAILABLE_PATH,
  IMG_URL,
  bodyBytes,
  clipboard,
  dataTransfer,
  imageFile,
  installCodec,
  installFetch,
  installObjectUrls,
  sizedFile,
  LIMIT_BYTES,
} from "@/__tests__/helpers/imageQuery";

vi.mock("next-intl", async () => {
  const messages = (await import("@/messages/ja.json")).default as Record<string, unknown>;
  const lookup = (path: string): unknown =>
    path.split(".").reduce<unknown>(
      (node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined),
      messages,
    );
  const useTranslations = (namespace?: string) => (key: string, values?: Record<string, unknown>) => {
    const path = namespace === undefined ? key : `${namespace}.${key}`;
    const raw = lookup(path);
    let text = typeof raw === "string" ? raw : path;
    for (const [k, v] of Object.entries(values ?? {})) text = text.replaceAll(`{${k}}`, String(v));
    return text;
  };
  return {
    useTranslations,
    useLocale: () => "ja",
    NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

const nav = vi.hoisted(() => ({
  params: new URLSearchParams(),
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ name: "media" }),
  useSearchParams: () => nav.params,
  useRouter: () => ({ push: nav.push, replace: nav.replace, back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/drive/media/search",
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const folder = vi.hoisted(() => ({ props: [] as Array<Record<string, unknown>> }));
vi.mock("@/components/FolderBrowser", () => ({
  FolderBrowser: (props: Record<string, unknown>) => {
    folder.props.push(props);
    return <div data-testid="folder-browser" />;
  },
}));

vi.mock("@/components/AddonSlot", () => ({
  AddonSlot: ({ id }: { id: string }) => <div data-testid={`slot-${id}`} />,
}));

vi.mock("@/components/SmartFolderSaveButton", () => ({
  SmartFolderSaveButton: () => <button>SAVE-SEARCH</button>,
}));

const GONE = "画像をもう一度選んでください";
const UNAVAILABLE = "このドライブでは画像で探せません";
const FAILED = "画像で探せませんでした";
const RETRY = "再試行";
const TOO_LARGE = "画像が大きすぎます（20 MB・5000 万画素まで）";
const UNREADABLE = "この画像は読み込めませんでした";
const LOCKED = "このドライブはロックされています";
const EMPTY = "似ているものは見つかりませんでした";
const TEXT_FAILED = "画像の文字を読み取れませんでした";
const PARTIAL = "このドライブのシーンを見逃している可能性があります";
const DROP = "ドロップして画像で探す";
const BUTTON = "画像で探す";
const REMOVE = "画像を外す";
const H1 = "画像で検索";
const DOCS = "同じ文字を含む文書";
const PICTURES = "似ている画像";
const SCENES = "似ている場面";
const ABSENT_ID = "0123456789ab";

type Answer = Record<string, unknown>;

function imageHit(id: string, score = 0.9) {
  return {
    file_id: id, drive: "media", filename: `${id}.jpg`, file_type: "image", score,
    match_types: ["clip_thumbnail"], file: null,
  };
}

function sceneHit(id: string, start = 65.4, end = 95.2) {
  return {
    file_id: id, drive: "media", filename: `${id}.mp4`, start, end, peak: start, score: 0.85,
    frame_url: `/api/addons/intelligence/files/${id}/frame?t=${Math.floor(start)}`, file: null,
  };
}

function documentHit(id: string, page = 7, text = "budget appendix") {
  return {
    file_id: id, drive: "media", filename: `${id}.pdf`, file_type: "document", score: 0.8, file: null,
    passages: [
      {
        kind: "page", start: null, end: null, page, section: null, section_title: null,
        chunk_index: 0, text, score: 0.8, keyword: false, highlight_terms: [], frame_url: null,
      },
    ],
  };
}

function answer(overrides: Partial<Answer> = {}): Answer {
  return {
    images: [],
    scenes: [],
    scenes_partial: false,
    documents: [],
    text: { status: "too_short", excerpt: null },
    ...overrides,
  };
}

let Page: ComponentType;
let net: ReturnType<typeof installFetch>;
let urls: ReturnType<typeof installObjectUrls>;

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function load() {
  vi.resetModules();
  Page = (await import("@/app/drive/[name]/search/page")).default as ComponentType;
}

async function open(id: string) {
  nav.params = new URLSearchParams(`img=${id}`);
  const view = render(<Page />);
  await flush();
  return view;
}

async function goTo(view: ReturnType<typeof render>, id: string) {
  nav.params = new URLSearchParams(`img=${id}`);
  view.rerender(<Page />);
  await flush();
}

const field = () => screen.getByRole("textbox");

function lastPush(): string | undefined {
  const call = nav.push.mock.calls.at(-1);
  return call ? String(call[0]) : undefined;
}

async function giveByPaste(file: File = imageFile()): Promise<string> {
  const before = nav.push.mock.calls.length;
  fireEvent.paste(field(), { clipboardData: clipboard([file]) });
  await flush();
  expect(nav.push.mock.calls.length).toBe(before + 1);
  const match = IMG_URL.exec(lastPush() ?? "");
  expect(match).not.toBeNull();
  expect(match![1]).toBe("media");
  return match![2];
}

/** A new image query entered from the view: given, then the URL moved to its id. */
async function enterNew(view: ReturnType<typeof render>, file?: File) {
  const id = await giveByPaste(file);
  await goTo(view, id);
  return id;
}

async function respond(index: number, status: number, body?: unknown) {
  await act(async () => {
    net.searches[index].respond(status, body);
  });
  await flush();
}

function regionNames(): string[] {
  return screen
    .queryAllByRole("region")
    .map((r) => r.getAttribute("aria-label") ?? (r.getAttribute("aria-labelledby") ? document.getElementById(r.getAttribute("aria-labelledby")!)?.textContent ?? "" : ""))
    .map((n) => n.trim())
    .filter((n) => [DOCS, PICTURES, SCENES].some((h) => n.startsWith(h)))
    .map((n) => [DOCS, PICTURES, SCENES].find((h) => n.startsWith(h))!);
}

function region(heading: string): HTMLElement {
  const found = screen
    .getAllByRole("region")
    .find((r) => within(r).queryByRole("heading", { level: 2 })?.textContent?.trim().startsWith(heading));
  expect(found, `no section headed ${heading}`).toBeTruthy();
  return found!;
}

function headingText(heading: string): string {
  return within(region(heading)).getByRole("heading", { level: 2 }).textContent!.replace(/\s+/g, " ").trim();
}

beforeEach(async () => {
  nav.params = new URLSearchParams();
  folder.props = [];
  nav.push.mockReset();
  nav.replace.mockReset();
  net = installFetch({ status: 200, body: {} });
  urls = installObjectUrls();
  localStorage.clear();
  sessionStorage.clear();
  await load();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-046 step 4: img selects the image query view", () => {
  it("renders the view, not FolderBrowser, the scene toggle or the top slot, whatever else the URL holds", async () => {
    nav.params = new URLSearchParams(
      `q=cats&type=video&sort=title&order=asc&show=passages&smart_folder_id=sf1&include_scene_clip=true&img=${ABSENT_ID}`,
    );
    render(<Page />);
    await flush();

    expect(screen.getByRole("heading", { level: 1, name: H1 })).toBeInTheDocument();
    expect(screen.queryByTestId("folder-browser")).toBeNull();
    expect(screen.queryByTestId("slot-search-results-top")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("hands FolderBrowser onImageQuery while image search is available, and it starts a query", async () => {
    nav.params = new URLSearchParams("q=cats&type=video");
    render(<Page />);
    await flush();

    const onImageQuery = folder.props.at(-1)?.onImageQuery as ((f: File) => void) | undefined;
    expect(typeof onImageQuery).toBe("function");
    await act(async () => onImageQuery!(imageFile()));
    await flush();
    expect(lastPush()).toMatch(IMG_URL);
  });

  it.each([
    ["404", { status: 404, body: {} }],
    ["available false", { status: 200, body: { available: false } }],
    ["pending", { status: 0, never: true }],
  ])("gives FolderBrowser no onImageQuery while unavailable (%s)", async (_name, availability) => {
    net.setAvailability(availability);
    nav.params = new URLSearchParams("q=cats");
    render(<Page />);
    await flush();

    expect(folder.props.length).toBeGreaterThan(0);
    expect(folder.props.at(-1)?.onImageQuery).toBeUndefined();
    expect(net.asked).toEqual([{ drive: "media" }]);
  });
});

describe("SPEC-CORE-046 I9: the gone state", () => {
  it("shows the gone message and the image button for an id the store does not hold, and sends nothing", async () => {
    await open(ABSENT_ID);

    expect(screen.getByText(GONE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: BUTTON })).toBeInTheDocument();
    expect(net.searches).toHaveLength(0);
    expect(screen.queryByText("0 件")).toBeNull();
  });

  it("asks the availability route once, for the page's drive", async () => {
    const view = await open(ABSENT_ID);
    await goTo(view, "aaaaaaaaaaaa");

    expect(net.asked).toEqual([{ drive: "media" }]);
    expect(net.fetchMock.mock.calls.filter(([u]) => String(u).includes(AVAILABLE_PATH))).toHaveLength(1);
  });

  it.each([
    ["404", { status: 404, body: { detail: "Not Found" } }],
    ["403", { status: 403, body: { detail: "Drive not accessible" } }],
    ["available false", { status: 200, body: { available: false } }],
    ["network error", { status: 0, network: true }],
  ])("while image search is unavailable (%s) it says so, with no button, and a paste is left alone", async (_name, availability) => {
    net.setAvailability(availability);
    await open(ABSENT_ID);

    expect(screen.getByText(UNAVAILABLE)).toBeInTheDocument();
    expect(screen.queryByText(GONE)).toBeNull();
    expect(screen.queryByRole("button", { name: BUTTON })).toBeNull();

    const paste = fireEvent.paste(field(), { clipboardData: clipboard([imageFile()]) });
    await flush();
    expect(paste).toBe(true);
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("while availability is pending it shows the gone state without the button", async () => {
    net.setAvailability({ status: 0, never: true });
    await open(ABSENT_ID);

    expect(screen.getByRole("heading", { level: 1, name: H1 })).toBeInTheDocument();
    expect(screen.getByText(UNAVAILABLE)).toBeInTheDocument();
    expect(screen.queryByText(GONE)).toBeNull();
    expect(screen.queryByRole("button", { name: BUTTON })).toBeNull();
  });
});

describe("SPEC-CORE-046 I9: one request per pending entry", () => {
  it("sends one POST with the drive, the file's type and its bytes when the view is entered", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 9, 8, 7, 6]);
    const view = await open(ABSENT_ID);
    await enterNew(view, imageFile("shot.png", "image/png", bytes));

    expect(net.searches).toHaveLength(1);
    const [sent] = net.searches;
    expect(sent.method).toBe("POST");
    expect(new URL(sent.url, "http://localhost").pathname).toBe("/api/addons/intelligence/search/by-image");
    expect(sent.headers.get("X-Lit-Drive")).toBe("media");
    expect(sent.headers.get("Content-Type")).toBe("image/png");
    expect(Array.from(await bodyBytes(sent.body))).toEqual(Array.from(bytes));
  });

  it("does not send a second request when the same id renders again while loading", async () => {
    const view = await open(ABSENT_ID);
    const id = await enterNew(view);
    await goTo(view, id);
    view.rerender(<Page />);
    await flush();

    expect(net.searches).toHaveLength(1);
  });

  it("hides the scope line while loading", async () => {
    const view = await open(ABSENT_ID);
    await enterNew(view);

    expect(screen.queryByText("0 件")).toBeNull();
    expect(screen.queryByText(EMPTY)).toBeNull();
  });

  it("aborts the request when the view is left and sends again when it is entered again", async () => {
    const view = await open(ABSENT_ID);
    const id = await enterNew(view);
    const first = net.searches[0];

    view.unmount();
    await flush();
    expect(first.signal?.aborted).toBe(true);

    await open(id);
    expect(net.searches).toHaveLength(2);
  });

  it("aborts the request when a new image is given and never writes the late answer to its entry", async () => {
    net.answerAfterAbort();
    const view = await open(ABSENT_ID);
    const a = await enterNew(view);
    const b = await enterNew(view, imageFile("other.png"));
    expect(net.searches[0].signal?.aborted).toBe(true);
    expect(net.searches).toHaveLength(2);

    await respond(0, 200, answer({ images: [imageHit("late")] }));
    expect(screen.queryByRole("link", { name: /late\.jpg/ })).toBeNull();

    await goTo(view, a);
    expect(net.searches).toHaveLength(3);
    expect(screen.queryByRole("link", { name: /late\.jpg/ })).toBeNull();
    expect(b).not.toBe(a);
  });

  it("renders an answered entry from the store on re-entry and sends nothing", async () => {
    const view = await open(ABSENT_ID);
    const id = await enterNew(view);
    await respond(0, 200, answer({ images: [imageHit("p1")] }));
    expect(screen.getByRole("link", { name: /p1\.jpg/ })).toBeInTheDocument();

    view.unmount();
    await open(id);

    expect(net.searches).toHaveLength(1);
    expect(screen.getByRole("link", { name: /p1\.jpg/ })).toBeInTheDocument();
  });
});

describe("SPEC-CORE-046 §8: failures", () => {
  it.each<[string, number | "network", unknown, string, boolean]>([
    ["400", 400, { detail: "Drive context required" }, UNAVAILABLE, false],
    ["403", 403, { detail: "Drive not accessible" }, LOCKED, false],
    ["404", 404, { detail: "Not Found" }, UNAVAILABLE, false],
    ["413", 413, { detail: "too large" }, TOO_LARGE, false],
    ["415", 415, { detail: "type" }, UNREADABLE, false],
    ["422", 422, { detail: "undecodable" }, UNREADABLE, false],
    ["500", 500, {}, FAILED, true],
    ["502", 502, {}, FAILED, true],
    ["503", 503, { detail: "Embedding unavailable" }, FAILED, true],
    ["available false", 200, { available: false }, FAILED, true],
    ["network", "network", undefined, FAILED, true],
  ])("%s shows its message as an alert, with 再試行 only when retryable", async (_name, status, body, message, retryable) => {
    const view = await open(ABSENT_ID);
    await enterNew(view);

    if (status === "network") {
      await act(async () => net.searches[0].fail());
      await flush();
    } else {
      await respond(0, status, body);
    }

    expect(screen.getAllByRole("alert").some((a) => a.textContent?.includes(message))).toBe(true);
    expect(screen.queryByText(EMPTY)).toBeNull();
    expect(screen.queryByText("0 件")).toBeNull();
    const retry = screen.queryByRole("button", { name: RETRY });
    expect(retry !== null).toBe(retryable);

    if (retry) {
      fireEvent.click(retry);
      await flush();
      expect(net.searches).toHaveLength(2);
    } else {
      expect(net.searches).toHaveLength(1);
    }
  });

  it("renders a stored failure on re-entry and sends nothing", async () => {
    const view = await open(ABSENT_ID);
    const id = await enterNew(view);
    await respond(0, 502, {});
    view.unmount();

    await open(id);

    expect(net.searches).toHaveLength(1);
    expect(screen.getByText(FAILED)).toBeInTheDocument();
  });
});

describe("SPEC-CORE-046 I11: the groups", () => {
  async function answered(body: Answer) {
    const view = await open(ABSENT_ID);
    await enterNew(view);
    await respond(0, 200, body);
    return view;
  }

  it("puts documents first when they have a hit, then images, then scenes", async () => {
    await answered(answer({
      images: [imageHit("p1")], scenes: [sceneHit("v1")], documents: [documentHit("d1")],
      text: { status: "read", excerpt: "the read text" },
    }));

    expect(regionNames()).toEqual([DOCS, PICTURES, SCENES]);
  });

  it("renders images then scenes when no document hit, and no documents section", async () => {
    await answered(answer({ images: [imageHit("p1")], scenes: [sceneHit("v1")] }));

    expect(regionNames()).toEqual([PICTURES, SCENES]);
  });

  it("does not render a group without hits", async () => {
    await answered(answer({ scenes: [sceneHit("v1")] }));

    expect(regionNames()).toEqual([SCENES]);
  });

  it("puts a failed text reading last as a documents slot with its line and no count", async () => {
    await answered(answer({
      images: [imageHit("p1")], scenes: [sceneHit("v1")],
      text: { status: "failed", excerpt: null },
    }));

    expect(regionNames()).toEqual([PICTURES, SCENES, DOCS]);
    expect(within(region(DOCS)).getByText(TEXT_FAILED)).toBeInTheDocument();
    expect(headingText(DOCS)).toBe(DOCS);
    expect(screen.getByText("画像 1・場面 1")).toBeInTheDocument();
  });

  it("shows a scenes slot with the partial line when scenes_partial and no scene hit", async () => {
    await answered(answer({ images: [imageHit("p1")], scenes_partial: true }));

    expect(regionNames()).toEqual([PICTURES, SCENES]);
    expect(within(region(SCENES)).getByText(PARTIAL)).toBeInTheDocument();
    expect(headingText(SCENES)).toBe(SCENES);
    expect(screen.getByText("画像 1")).toBeInTheDocument();
  });

  it("shows the partial line under scenes with hits too", async () => {
    await answered(answer({ scenes: [sceneHit("v1")], scenes_partial: true }));

    expect(within(region(SCENES)).getByText(PARTIAL)).toBeInTheDocument();
  });

  it("counts files, pictures and segments in the headings and the scope line, in rendered order", async () => {
    await answered(answer({
      images: [imageHit("p1"), imageHit("p2"), imageHit("p3")],
      scenes: [sceneHit("v1")],
      documents: [documentHit("d1"), documentHit("d2", 3, "second")],
      text: { status: "read", excerpt: "the read text" },
    }));

    expect(headingText(DOCS)).toBe(`${DOCS} 2`);
    expect(headingText(PICTURES)).toBe(`${PICTURES} 3`);
    expect(headingText(SCENES)).toBe(`${SCENES} 1`);
    expect(screen.getByText("文書 2・画像 3・場面 1")).toBeInTheDocument();
  });

  it("shows the empty state and 0 件 for an answer with nothing", async () => {
    await answered(answer());

    expect(screen.getByText(EMPTY)).toBeInTheDocument();
    expect(screen.getByText("0 件")).toBeInTheDocument();
    expect(regionNames()).toEqual([]);
  });

  it("reads 0 件 without the empty state when only a slot without hits renders", async () => {
    await answered(answer({ text: { status: "failed", excerpt: null } }));

    expect(regionNames()).toEqual([DOCS]);
    expect(screen.getByText("0 件")).toBeInTheDocument();
    expect(screen.queryByText(EMPTY)).toBeNull();
  });

  it("shows the excerpt in 「」 with the full excerpt in title, and links each passage where A3 does", async () => {
    await answered(answer({
      documents: [documentHit("d1", 7, "budget appendix")],
      text: { status: "read", excerpt: "the read text of the screenshot" },
    }));

    const docs = region(DOCS);
    const excerpt = within(docs).getByText((_c, el) => el?.textContent === "「the read text of the screenshot」");
    expect(excerpt.closest("[title]")?.getAttribute("title")).toContain("the read text of the screenshot");
    const link = within(docs).getByRole("link", { name: /d1\.pdf/ });
    expect(link).toHaveAttribute("href", "/files/d1?page=7");
    expect(link.textContent).toContain("budget appendix");
    expect(within(docs).getByRole("list")).toBeInTheDocument();
  });

  it("links each picture to its file, named by the file name", async () => {
    await answered(answer({ images: [imageHit("p1"), imageHit("p2")] }));

    const pictures = within(region(PICTURES)).getAllByRole("link");
    expect(pictures.map((a) => a.getAttribute("href"))).toEqual(["/files/p1", "/files/p2"]);
    expect(within(region(PICTURES)).getByRole("link", { name: "p1.jpg" })).toBeInTheDocument();
  });

  it("links each scene row to its start second, with the start–end locator", async () => {
    await answered(answer({ scenes: [sceneHit("v1", 65.4, 95.2)] }));

    const link = within(region(SCENES)).getByRole("link", { name: /v1\.mp4/ });
    expect(link).toHaveAttribute("href", "/files/v1?t=65");
    expect(link.textContent).toMatch(/1:05\s*–\s*1:35/);
  });
});

describe("SPEC-CORE-046 step 5 / 8: the header", () => {
  it("holds the image chip with the picture, the label and its remover, and an empty field", async () => {
    const view = await open(ABSENT_ID);
    await enterNew(view);

    const picture = document.querySelector(`img[src="${urls.created.at(-1)}"]`);
    expect(picture).not.toBeNull();
    expect(picture!.getAttribute("alt")).toBe("");
    expect(screen.getByText("画像")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: REMOVE })).toBeInTheDocument();
    expect((field() as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("heading", { level: 1, name: H1 })).toBeInTheDocument();
  });

  it("renders no operator chips, no add-filter, no Smart Folder button and no search-modes slot", async () => {
    const view = await open(ABSENT_ID);
    await enterNew(view);

    expect(screen.queryByRole("group", { name: "条件" })).toBeNull();
    expect(screen.queryByRole("button", { name: /条件を追加|＋\s*条件/ })).toBeNull();
    expect(screen.queryByText("SAVE-SEARCH")).toBeNull();
    expect(screen.queryByTestId("slot-search-modes")).toBeNull();
  });

  it("✕ on the chip opens the drive's library view", async () => {
    const view = await open(ABSENT_ID);
    await enterNew(view);
    nav.push.mockClear();

    fireEvent.click(screen.getByRole("button", { name: REMOVE }));

    expect(nav.push.mock.calls).toEqual([["/drive/media"]]);
  });

  it("Enter on text pushes a text search with no other parameter", async () => {
    const view = await open(ABSENT_ID);
    await enterNew(view);
    nav.push.mockClear();

    fireEvent.change(field(), { target: { value: "hello world" } });
    fireEvent.keyDown(field(), { key: "Enter" });

    expect(nav.push).toHaveBeenCalledTimes(1);
    const url = new URL(lastPush()!, "http://localhost");
    expect(url.pathname).toBe("/drive/media/search");
    expect([...url.searchParams.keys()]).toEqual(["q"]);
    expect(url.searchParams.get("q")).toBe("hello world");
  });

  it("Enter on blank text does nothing", async () => {
    const view = await open(ABSENT_ID);
    await enterNew(view);
    nav.push.mockClear();

    fireEvent.change(field(), { target: { value: "   " } });
    fireEvent.keyDown(field(), { key: "Enter" });

    expect(nav.push).not.toHaveBeenCalled();
  });

  it("the image button opens an image file picker, and a chosen file starts a new query", async () => {
    await open(ABSENT_ID);
    const picker = document.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(picker).not.toBeNull();
    expect(picker!.getAttribute("accept")).toBe("image/*");
    const click = vi.spyOn(picker!, "click");

    fireEvent.click(screen.getByRole("button", { name: BUTTON }));
    expect(click).toHaveBeenCalled();

    fireEvent.change(picker!, { target: { files: [imageFile()] } });
    await flush();
    expect(lastPush()).toMatch(IMG_URL);
  });
});

describe("SPEC-CORE-046 step 2 / 7: paste in the field", () => {
  it("a paste with non-blank text inserts it and starts nothing", async () => {
    await open(ABSENT_ID);

    const notPrevented = fireEvent.paste(field(), { clipboardData: clipboard([imageFile()], "copied words") });
    await flush();

    expect(notPrevented).toBe(true);
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("a paste of one image with blank text starts a query and inserts nothing", async () => {
    await open(ABSENT_ID);

    const notPrevented = fireEvent.paste(field(), { clipboardData: clipboard([imageFile()], "  \n ") });
    await flush();

    expect(notPrevented).toBe(false);
    expect(lastPush()).toMatch(IMG_URL);
  });

  it("a clipboard item whose file cannot be read starts nothing", async () => {
    await open(ABSENT_ID);

    fireEvent.paste(field(), { clipboardData: clipboard([null]) });
    await flush();

    expect(nav.push).not.toHaveBeenCalled();
  });

  it("an empty file starts nothing", async () => {
    await open(ABSENT_ID);

    fireEvent.paste(field(), { clipboardData: clipboard([imageFile("empty.png", "image/png", new Uint8Array(0))]) });
    await flush();

    expect(nav.push).not.toHaveBeenCalled();
  });
});

describe("SPEC-CORE-046 step 3 / I10: before sending", () => {
  it("sends a file of exactly the limit byte for byte", async () => {
    const codec = installCodec();
    const file = sizedFile(LIMIT_BYTES);
    const view = await open(ABSENT_ID);
    await enterNew(view, file);

    const sent = net.searches[0];
    expect(sent.headers.get("Content-Type")).toBe("image/jpeg");
    const bytes = await bodyBytes(sent.body);
    expect(bytes.byteLength).toBe(LIMIT_BYTES);
    expect(codec.encoded).toEqual([]);
  });

  it("re-encodes a larger file as JPEG at quality 0.9 with a long edge of at most 4096", async () => {
    const codec = installCodec({ size: { width: 8000, height: 6000 }, encodedBytes: 4321 });
    const view = await open(ABSENT_ID);
    await enterNew(view, sizedFile(LIMIT_BYTES + 1));

    expect(codec.encoded).toHaveLength(1);
    const [enc] = codec.encoded;
    expect(enc.type).toBe("image/jpeg");
    expect(enc.quality).toBe(0.9);
    expect(Math.max(enc.width, enc.height)).toBe(4096);
    expect(enc.height).toBe(3072);
    const sent = net.searches[0];
    expect(sent.headers.get("Content-Type")).toBe("image/jpeg");
    expect((await bodyBytes(sent.body)).byteLength).toBe(4321);
  });

  it("re-encodes a file of a type the addon does not take, whatever its size", async () => {
    const codec = installCodec({ size: { width: 300, height: 200 }, encodedBytes: 77 });
    const view = await open(ABSENT_ID);
    await enterNew(view, imageFile("pic.avif", "image/avif"));

    expect(codec.encoded).toHaveLength(1);
    expect(codec.encoded[0].type).toBe("image/jpeg");
    expect(Math.max(codec.encoded[0].width, codec.encoded[0].height)).toBeLessThanOrEqual(4096);
    expect(net.searches[0].headers.get("Content-Type")).toBe("image/jpeg");
    expect((await bodyBytes(net.searches[0].body)).byteLength).toBe(77);
  });

  it.each([
    ["undecodable", { decode: "fail" as const }],
    ["still over the limit", { encodedBytes: LIMIT_BYTES + 1 }],
  ])("refuses a large file that is %s with the size message under the field, until the next edit", async (_name, codecOpts) => {
    installCodec(codecOpts);
    await open(ABSENT_ID);

    fireEvent.paste(field(), { clipboardData: clipboard([sizedFile(LIMIT_BYTES + 1)]) });
    await flush();

    expect(nav.push).not.toHaveBeenCalled();
    expect(net.searches).toHaveLength(0);
    expect(screen.getAllByRole("alert").some((a) => a.textContent === TOO_LARGE)).toBe(true);

    fireEvent.change(field(), { target: { value: "x" } });
    await flush();
    expect(screen.queryByText(TOO_LARGE)).toBeNull();
  });

  it("refuses an undecodable file of another type with the unreadable message", async () => {
    installCodec({ decode: "fail" });
    await open(ABSENT_ID);

    fireEvent.paste(field(), { clipboardData: clipboard([imageFile("pic.tiff", "image/tiff")]) });
    await flush();

    expect(nav.push).not.toHaveBeenCalled();
    expect(screen.getAllByRole("alert").some((a) => a.textContent === UNREADABLE)).toBe(true);
  });

  it("clears the size message on the next image given", async () => {
    const codec = installCodec({ decode: "fail" });
    await open(ABSENT_ID);
    fireEvent.paste(field(), { clipboardData: clipboard([sizedFile(LIMIT_BYTES + 1)]) });
    await flush();
    expect(screen.getByText(TOO_LARGE)).toBeInTheDocument();
    expect(codec.decoded).toHaveLength(1);

    fireEvent.paste(field(), { clipboardData: clipboard([imageFile()]) });
    await flush();

    expect(screen.queryByText(TOO_LARGE)).toBeNull();
  });

  it("shows a busy spinner on the image button while preparing, and Enter on text cancels the image", async () => {
    installCodec({ decode: "never" });
    await open(ABSENT_ID);

    fireEvent.paste(field(), { clipboardData: clipboard([imageFile("pic.avif", "image/avif")]) });
    await flush();

    expect(screen.getByRole("button", { name: BUTTON })).toHaveAttribute("aria-busy", "true");
    expect(field()).not.toBeDisabled();
    expect(nav.push).not.toHaveBeenCalled();

    fireEvent.change(field(), { target: { value: "words" } });
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(nav.push.mock.calls.map(([u]) => String(u))).toEqual(["/drive/media/search?q=words"]);
  });

  it("a later image cancels one still being prepared", async () => {
    const decoding = { resolve: (_: unknown) => {} };
    installCodec();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(() => new Promise((resolve) => {
        decoding.resolve = resolve;
      })),
    );
    await open(ABSENT_ID);

    fireEvent.paste(field(), { clipboardData: clipboard([imageFile("first.avif", "image/avif")]) });
    await flush();
    const id = await giveByPaste(imageFile("second.png"));

    await act(async () => decoding.resolve({ width: 10, height: 10, close: () => {} }));
    await flush();

    expect(nav.push.mock.calls.map(([u]) => String(u))).toEqual([`/drive/media/search?img=${id}`]);
  });
});

describe("SPEC-CORE-046 I2: the image store", () => {
  it("holds at most 5 entries, drops the least recently used and revokes its object URL", async () => {
    const view = await open(ABSENT_ID);
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push(await giveByPaste(imageFile(`p${i}.png`)));
    await goTo(view, ids[0]);
    const firstUrl = urls.created[0];

    const sixth = await giveByPaste(imageFile("p5.png"));

    expect(urls.revoked).toEqual([urls.created[1]]);
    expect(urls.revoked).not.toContain(firstUrl);
    await goTo(view, ids[1]);
    expect(screen.getByText(GONE)).toBeInTheDocument();
    await goTo(view, ids[0]);
    expect(screen.queryByText(GONE)).toBeNull();
    await goTo(view, sixth);
    expect(screen.queryByText(GONE)).toBeNull();
  });

  it("gives every query its own 12-hex id", async () => {
    await open(ABSENT_ID);
    const a = await giveByPaste(imageFile("a.png"));
    const b = await giveByPaste(imageFile("b.png"));

    expect(a).toMatch(/^[0-9a-f]{12}$/);
    expect(b).not.toBe(a);
  });

  it("writes nothing to localStorage, sessionStorage or IndexedDB", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const idbOpen = vi.fn();
    vi.stubGlobal("indexedDB", { open: idbOpen, deleteDatabase: vi.fn() });

    const view = await open(ABSENT_ID);
    await enterNew(view);
    await respond(0, 200, answer({ images: [imageHit("p1")], text: { status: "read", excerpt: "secret text" } }));

    expect(setItem).not.toHaveBeenCalled();
    expect(idbOpen).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    setItem.mockRestore();
  });
});

describe("SPEC-CORE-046 step 6 / I8: drops on the view", () => {
  const target = () => screen.getByRole("heading", { level: 1, name: H1 });

  it("classifies one image on dragenter, shows the overlay, and starts a query on drop", async () => {
    await open(ABSENT_ID);
    const file = imageFile();

    fireEvent.dragEnter(target(), { dataTransfer: dataTransfer({ files: [file] }) });
    expect(screen.getByText(DROP)).toBeInTheDocument();
    expect(screen.getByText(DROP).closest('[aria-live="polite"]')).not.toBeNull();

    fireEvent.drop(target(), { dataTransfer: dataTransfer({ files: [file] }) });
    await flush();
    expect(lastPush()).toMatch(IMG_URL);
  });

  it.each([
    ["several files", { files: [imageFile("a.png"), imageFile("b.png")] }],
    ["a non-image", { files: [new File(["x"], "notes.txt", { type: "text/plain" })] }],
    ["an unreported type", { items: [{ kind: "file" as const, type: "" }], files: [imageFile()] }],
  ])("for %s it shows no overlay, refuses the drop effect, keeps the browser from opening it, and does nothing", async (_name, drag) => {
    await open(ABSENT_ID);

    fireEvent.dragEnter(target(), { dataTransfer: dataTransfer(drag) });
    const over = dataTransfer(drag);
    over.dropEffect = "copy";
    const overAllowed = fireEvent.dragOver(target(), { dataTransfer: over });
    expect(screen.queryByText(DROP)).toBeNull();
    expect(overAllowed).toBe(false);
    expect(over.dropEffect).toBe("none");

    const dropAllowed = fireEvent.drop(target(), { dataTransfer: dataTransfer(drag) });
    await flush();
    expect(dropAllowed).toBe(false);
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("does nothing when a drag classed one image drops something else", async () => {
    await open(ABSENT_ID);

    fireEvent.dragEnter(target(), { dataTransfer: dataTransfer({ files: [imageFile()] }) });
    fireEvent.drop(target(), {
      dataTransfer: dataTransfer({ files: [imageFile("a.png"), imageFile("b.png")] }),
    });
    await flush();

    expect(nav.push).not.toHaveBeenCalled();
  });

  it("while unavailable a drop only keeps the browser from opening the file", async () => {
    net.setAvailability({ status: 404, body: {} });
    await open(ABSENT_ID);
    const file = imageFile();

    fireEvent.dragEnter(target(), { dataTransfer: dataTransfer({ files: [file] }) });
    expect(screen.queryByText(DROP)).toBeNull();
    const dropAllowed = fireEvent.drop(target(), { dataTransfer: dataTransfer({ files: [file] }) });
    await flush();

    expect(dropAllowed).toBe(false);
    expect(nav.push).not.toHaveBeenCalled();
  });
});
