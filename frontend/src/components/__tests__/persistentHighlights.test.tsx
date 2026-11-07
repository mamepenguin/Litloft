/**
 * Highlights drawn over MarkdownPreview and TextLines (SPEC-CORE-052 frontend
 * side, SPEC-CORE-053). The fetch boundary is faked as a small server so the
 * tests observe what the page sends and keeps, not how it is built.
 * PDF, click ordering and find / quote-button coexistence need a layout
 * engine: see e2e-components/persistent-highlights-desktop.spec.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { TextLines } from "@/components/TextLines";
import { HighlightFileContext } from "@/lib/highlightStore";
import { useProfile } from "@/components/ProfileProvider";

vi.mock("@/components/ProfileProvider", () => ({ useProfile: vi.fn() }));
const mockUseProfile = vi.mocked(useProfile);

const FILE = "file0000001";
const KEY = `highlights:${FILE}`;
const MESSAGES = {
  text: { loading: "Loading...", loadFailed: "Failed {error}" },
  highlight: {
    add: "Highlight",
    remove: "Remove",
    saveFailed: "Could not save the highlight",
    removeFailed: "Could not remove the highlight",
    limitReached: "Highlight limit reached",
  },
};

interface Rec {
  id: string;
  page: number | null;
  quote: string;
  prefix: string;
  suffix: string;
  created_at: string;
}

function profile(nickname: string | null) {
  mockUseProfile.mockReturnValue({
    nickname,
    setNickname: vi.fn(),
    clearNickname: vi.fn(),
  });
}

/** A fake of the three routes. `fail` makes the named method answer a status. */
const server = {
  rows: [] as Rec[],
  calls: [] as { method: string; url: string; body?: Record<string, unknown> }[],
  fail: {} as Record<string, number>,
  gate: null as null | Promise<void>,
  next: 1,
};

function installFetch() {
  server.rows = [];
  server.calls = [];
  server.fail = {};
  server.gate = null;
  server.next = 1;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      server.calls.push({ method, url, body });
      if (!url.includes("/highlights")) return new Response("{}", { status: 200 });
      if (server.gate && method === "POST") await server.gate;
      const status = server.fail[method];
      if (status) return new Response("{}", { status });
      if (method === "GET") return json(server.rows, 200);
      if (method === "POST") {
        const dup = server.rows.find(
          (r) => r.quote === body.quote && r.prefix === body.prefix && r.suffix === body.suffix,
        );
        if (dup) return json(dup, 200);
        const rec: Rec = {
          id: `srv${String(server.next++).padStart(9, "0")}`,
          page: body.page ?? null,
          quote: body.quote,
          prefix: body.prefix,
          suffix: body.suffix,
          created_at: new Date().toISOString(),
        };
        server.rows.push(rec);
        return json(rec, 201);
      }
      const id = url.split("/").pop()!;
      server.rows = server.rows.filter((r) => r.id !== id);
      return new Response(null, { status: 204 });
    }),
  );
}

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const highlightCalls = () => server.calls.filter((c) => c.url.includes("/highlights"));
const ofMethod = (m: string) => highlightCalls().filter((c) => c.method === m);

function rec(quote: string, prefix = "", suffix = "", id = `r-${quote}`): Rec {
  return { id, page: null, quote, prefix, suffix, created_at: "2026-11-07T00:00:00Z" };
}

function intl(ui: React.ReactElement) {
  return (
    <NextIntlClientProvider locale="en" messages={MESSAGES}>
      {ui}
    </NextIntlClientProvider>
  );
}

function md(source: string, ...fileIdArg: [] | [string | null | undefined]) {
  const fileId = fileIdArg.length === 0 ? FILE : fileIdArg[0];
  const preview = <MarkdownPreview source={source} />;
  return intl(
    fileId === undefined ? (
      preview
    ) : (
      <HighlightFileContext.Provider value={fileId}>{preview}</HighlightFileContext.Provider>
    ),
  );
}

function txt(text: string, ...fileIdArg: [] | [string | null | undefined]) {
  const fileId = fileIdArg.length === 0 ? FILE : fileIdArg[0];
  const view = <TextLines text={text} />;
  return intl(
    fileId === undefined ? (
      view
    ) : (
      <HighlightFileContext.Provider value={fileId}>{view}</HighlightFileContext.Provider>
    ),
  );
}

/** The text node holding `needle`, with the offsets of `needle` in it. */
function select(root: HTMLElement, needle: string) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const at = node.data.indexOf(needle);
    if (at >= 0) {
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + needle.length);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      fireEvent(document, new Event("selectionchange"));
      return;
    }
  }
  throw new Error(`no text node contains ${needle}`);
}

const addButton = () => screen.queryByRole("button", { name: "Highlight" });
const marks = (root: ParentNode = document) =>
  Array.from(root.querySelectorAll<HTMLElement>(".highlight-mark"));

async function save(root: HTMLElement, needle: string) {
  select(root, needle);
  const button = await screen.findByRole("button", { name: "Highlight" });
  await act(async () => {
    fireEvent.click(button);
  });
}

const stored = (): Rec[] => JSON.parse(localStorage.getItem(KEY) ?? "[]");

beforeEach(() => {
  localStorage.clear();
  window.getSelection()?.removeAllRanges();
  installFetch();
  profile(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe.each([
  ["MarkdownPreview", md, (c: HTMLElement) => c.querySelector("p") as HTMLElement],
  ["TextLines", txt, (c: HTMLElement) => c.querySelector("pre") as HTMLElement],
] as const)("%s", (_name, view, host) => {
  const SRC = "aaFOObb";

  describe("without a profile (localStorage)", () => {
    it("saves into highlights:<fileId> and never calls the server (I3, SPEC-CORE-052)", async () => {
      const { container } = render(view(SRC));
      await save(host(container), "FOO");
      expect(stored()).toHaveLength(1);
      expect(stored()[0]).toMatchObject({ quote: "FOO", prefix: "aa", suffix: "bb" });
      expect(stored()[0].id).toMatch(/^local-/);
      expect(highlightCalls()).toHaveLength(0);
    });

    it("draws the mark over the same text and clears the selection (SPEC-CORE-053)", async () => {
      const { container } = render(view(SRC));
      const before = host(container).textContent;
      await save(host(container), "FOO");
      expect(marks(container).map((m) => m.textContent)).toEqual(["FOO"]);
      expect(host(container).textContent).toBe(before);
      expect(window.getSelection()!.isCollapsed).toBe(true);
    });

    it("draws stored highlights again on the next visit (SPEC-CORE-053)", async () => {
      localStorage.setItem(KEY, JSON.stringify([rec("FOO", "aa", "bb")]));
      const { container } = render(view(SRC));
      await waitFor(() => expect(marks(container).map((m) => m.textContent)).toEqual(["FOO"]));
      expect(host(container).textContent).toBe(SRC);
    });

    it("removes from localStorage and the page (SPEC-CORE-053)", async () => {
      localStorage.setItem(KEY, JSON.stringify([rec("FOO", "aa", "bb")]));
      const { container } = render(view(SRC));
      await waitFor(() => expect(marks(container)).toHaveLength(1));
      fireEvent.click(marks(container)[0]);
      await act(async () => {
        fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
      });
      expect(marks(container)).toHaveLength(0);
      expect(stored()).toHaveLength(0);
    });

    it("a storage that throws is a failed save: nothing drawn, selection kept, message (I7)", async () => {
      const { container } = render(view(SRC));
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new DOMException("full", "QuotaExceededError");
      });
      await save(host(container), "FOO");
      expect(marks(container)).toHaveLength(0);
      expect(await screen.findByText(MESSAGES.highlight.saveFailed)).toBeTruthy();
      expect(window.getSelection()!.toString()).toBe("FOO");
    });

    it("refuses the 501st local highlight with limitReached (I2)", async () => {
      const many = Array.from({ length: 500 }, (_, i) => rec(`q${i}`, "", "", `local-${i}`));
      localStorage.setItem(KEY, JSON.stringify(many));
      const { container } = render(view(SRC));
      await save(host(container), "FOO");
      expect(await screen.findByText(MESSAGES.highlight.limitReached)).toBeTruthy();
      expect(stored()).toHaveLength(500);
      expect(marks(container)).toHaveLength(0);
    });

    it("a duplicate selection creates nothing new (I2)", async () => {
      const { container } = render(view(SRC));
      await save(host(container), "FOO");
      await save(host(container), "FOO");
      expect(stored()).toHaveLength(1);
      expect(marks(container)).toHaveLength(1);
    });

    it("a corrupt entry draws nothing, shows no message, and is not overwritten (SPEC-CORE-052)", async () => {
      localStorage.setItem(KEY, "{not json");
      const { container } = render(view(SRC));
      await new Promise((r) => setTimeout(r, 20));
      expect(marks(container)).toHaveLength(0);
      expect(screen.queryByText(/could not|limit/i)).toBeNull();
      expect(localStorage.getItem(KEY)).toBe("{not json");
      await save(host(container), "FOO");
      expect(stored()).toHaveLength(1);
    });
  });

  describe("with a profile (server)", () => {
    beforeEach(() => profile("alice"));

    it("loads from the server and never touches highlights:<fileId> (I3, SPEC-CORE-052)", async () => {
      server.rows = [rec("FOO", "aa", "bb", "srv000000001")];
      const getItem = vi.spyOn(Storage.prototype, "getItem");
      const setItem = vi.spyOn(Storage.prototype, "setItem");
      const { container } = render(view(SRC));
      await waitFor(() => expect(marks(container)).toHaveLength(1));
      await save(host(container), "bb");
      const keys = [...getItem.mock.calls, ...setItem.mock.calls].map((c) => String(c[0]));
      expect(keys.filter((k) => k.startsWith("highlights:"))).toEqual([]);
    });

    it("POSTs quote, prefix and suffix without a page for text (SPEC-CORE-052)", async () => {
      const { container } = render(view(SRC));
      await save(host(container), "FOO");
      const post = ofMethod("POST");
      expect(post).toHaveLength(1);
      expect(post[0].url).toContain(`/files/${FILE}/highlights`);
      expect(post[0].body).toMatchObject({ quote: "FOO", prefix: "aa", suffix: "bb" });
      expect((post[0].body as { page?: number | null }).page ?? null).toBeNull();
      await waitFor(() => expect(marks(container)).toHaveLength(1));
    });

    it("never sends a local id (SPEC-CORE-052)", async () => {
      localStorage.setItem(KEY, JSON.stringify([rec("FOO", "aa", "bb", "local-abc")]));
      const { container } = render(view(SRC));
      await save(host(container), "bb");
      expect(JSON.stringify(highlightCalls())).not.toContain("local-");
    });

    it("DELETEs the record id on remove and drops the mark (I7)", async () => {
      server.rows = [rec("FOO", "aa", "bb", "srv000000001")];
      const { container } = render(view(SRC));
      await waitFor(() => expect(marks(container)).toHaveLength(1));
      fireEvent.click(marks(container)[0]);
      await act(async () => {
        fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
      });
      expect(ofMethod("DELETE")[0].url).toMatch(/\/highlights\/srv000000001$/);
      await waitFor(() => expect(marks(container)).toHaveLength(0));
    });

    it("a failed remove keeps the mark and says removeFailed (I7)", async () => {
      server.rows = [rec("FOO", "aa", "bb", "srv000000001")];
      server.fail.DELETE = 500;
      const { container } = render(view(SRC));
      await waitFor(() => expect(marks(container)).toHaveLength(1));
      fireEvent.click(marks(container)[0]);
      await act(async () => {
        fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
      });
      expect(await screen.findByText(MESSAGES.highlight.removeFailed)).toBeTruthy();
      expect(marks(container)).toHaveLength(1);
    });

    it.each([500, 401, 404, 422])(
      "a %s on save draws nothing, keeps the selection, says saveFailed (I7)",
      async (status) => {
        server.fail.POST = status;
        const { container } = render(view(SRC));
        await save(host(container), "FOO");
        expect(await screen.findByText(MESSAGES.highlight.saveFailed)).toBeTruthy();
        expect(marks(container)).toHaveLength(0);
        expect(window.getSelection()!.toString()).toBe("FOO");
      },
    );

    it("a 409 on save says limitReached and draws nothing (I2)", async () => {
      server.fail.POST = 409;
      const { container } = render(view(SRC));
      await save(host(container), "FOO");
      expect(await screen.findByText(MESSAGES.highlight.limitReached)).toBeTruthy();
      expect(marks(container)).toHaveLength(0);
    });

    it("a failed load draws nothing and shows no message; the text stays readable (SPEC-CORE-052)", async () => {
      server.fail.GET = 500;
      const { container } = render(view(SRC));
      await new Promise((r) => setTimeout(r, 20));
      expect(marks(container)).toHaveLength(0);
      expect(host(container).textContent).toBe(SRC);
      expect(screen.queryByText(/could not|limit/i)).toBeNull();
      server.fail = {};
      await save(host(container), "FOO");
      await waitFor(() => expect(marks(container)).toHaveLength(1));
    });

    it("a duplicate answered 200 gives one mark (I2)", async () => {
      server.rows = [rec("FOO", "aa", "bb", "srv000000001")];
      const { container } = render(view(SRC));
      await waitFor(() => expect(marks(container)).toHaveLength(1));
      await save(host(container), "FOO");
      await new Promise((r) => setTimeout(r, 20));
      expect(marks(container)).toHaveLength(1);
    });

    it("drawing and saving record no reading position (I8, SPEC-CORE-050)", async () => {
      server.rows = [rec("FOO", "aa", "bb", "srv000000001")];
      const { container } = render(view(SRC));
      await waitFor(() => expect(marks(container)).toHaveLength(1));
      await save(host(container), "bb");
      expect(server.calls.filter((c) => c.url.includes("/progress"))).toHaveLength(0);
    });
  });

  describe("quote not found (I4, SPEC-CORE-053)", () => {
    it("is not drawn and not deleted, and is drawn again when the text returns", async () => {
      localStorage.setItem(KEY, JSON.stringify([rec("FOO", "aa", "bb")]));
      const { container, rerender } = render(view("other text"));
      await new Promise((r) => setTimeout(r, 20));
      expect(marks(container)).toHaveLength(0);
      expect(stored()).toHaveLength(1);
      expect(highlightCalls()).toHaveLength(0);
      rerender(view(SRC));
      await waitFor(() => expect(marks(container).map((m) => m.textContent)).toEqual(["FOO"]));
      rerender(view("gone again"));
      await waitFor(() => expect(marks(container)).toHaveLength(0));
      expect(stored()).toHaveLength(1);
    });
  });

  describe("what is offered (SPEC-CORE-053)", () => {
    it("offers Highlight on a non-collapsed selection of the text", async () => {
      const { container } = render(view(SRC));
      select(host(container), "FOO");
      expect(await screen.findByRole("button", { name: "Highlight" })).toBeTruthy();
    });

    it("offers nothing for a collapsed selection", async () => {
      const { container } = render(view(SRC));
      select(host(container), "FOO");
      expect(await screen.findByRole("button", { name: "Highlight" })).toBeTruthy();
      const text = document.createTreeWalker(host(container), NodeFilter.SHOW_TEXT).nextNode()!;
      const range = document.createRange();
      range.setStart(text, 2);
      range.collapse(true);
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(range);
      fireEvent(document, new Event("selectionchange"));
      await new Promise((r) => setTimeout(r, 20));
      expect(addButton()).toBeNull();
    });

    it("offers nothing for a selection outside the text", async () => {
      const { container } = render(
        <>
          <div id="elsewhere">outside words</div>
          {view(SRC)}
        </>,
      );
      select(host(container), "FOO");
      expect(await screen.findByRole("button", { name: "Highlight" })).toBeTruthy();
      select(container.querySelector("#elsewhere") as HTMLElement, "outside");
      await new Promise((r) => setTimeout(r, 20));
      expect(addButton()).toBeNull();
    });

    it("offers up to 2,000 characters and nothing beyond", async () => {
      const long = "x".repeat(2001);
      const { container, rerender } = render(view("a" + long.slice(0, 2000) + "b"));
      select(host(container), long.slice(0, 2000));
      expect(await screen.findByRole("button", { name: "Highlight" })).toBeTruthy();
      rerender(view("a" + long + "b"));
      select(host(container), long);
      await new Promise((r) => setTimeout(r, 20));
      expect(addButton()).toBeNull();
    });

    it("a selection starting inside a mark makes a new highlight (SPEC-CORE-053)", async () => {
      localStorage.setItem(KEY, JSON.stringify([rec("FOO", "aa", "bb")]));
      const { container } = render(view("aaFOObbcc"));
      await waitFor(() => expect(marks(container)).toHaveLength(1));
      const walker = document.createTreeWalker(host(container), NodeFilter.SHOW_TEXT);
      const first = walker.nextNode() as Text;
      const last = (() => {
        let n: Text = first;
        let next: Node | null;
        while ((next = walker.nextNode())) n = next as Text;
        return n;
      })();
      const range = document.createRange();
      range.setStart(marks(container)[0].firstChild as Text, 1);
      range.setEnd(last, last.data.length);
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(range);
      fireEvent(document, new Event("selectionchange"));
      await act(async () => {
        fireEvent.click(await screen.findByRole("button", { name: "Highlight" }));
      });
      expect(stored()).toHaveLength(2);
    });
  });

  describe("occurrence choice (I6, SPEC-CORE-053)", () => {
    it("marks the occurrence whose neighbours match", async () => {
      localStorage.setItem(KEY, JSON.stringify([rec("FOO", "cc", "dd")]));
      const { container } = render(view("aaFOObbccFOOdd"));
      await waitFor(() => expect(marks(container)).toHaveLength(1));
      const mark = marks(container)[0];
      const before = document.createRange();
      before.setStart(host(container), 0);
      before.setEndBefore(mark);
      expect(before.toString()).toBe("aaFOObbcc");
    });
  });

  describe("the profile changes while open (SPEC-CORE-052)", () => {
    it("reloads marks from the store the new state selects", async () => {
      localStorage.setItem(KEY, JSON.stringify([rec("FOO", "aa", "bb")]));
      server.rows = [rec("bb", "FOO", "", "srv000000001")];
      const { container, rerender } = render(view(SRC));
      await waitFor(() => expect(marks(container).map((m) => m.textContent)).toEqual(["FOO"]));
      profile("alice");
      rerender(view(SRC));
      await waitFor(() => expect(marks(container).map((m) => m.textContent)).toEqual(["bb"]));
      expect(stored()).toHaveLength(1);
    });

    it("discards the result of a save still in flight to the old store", async () => {
      profile("alice");
      let release!: () => void;
      server.gate = new Promise<void>((r) => (release = r));
      const { container, rerender } = render(view(SRC));
      await save(host(container), "FOO");
      profile(null);
      rerender(view(SRC));
      await act(async () => {
        release();
        await new Promise((r) => setTimeout(r, 20));
      });
      expect(marks(container)).toHaveLength(0);
      expect(localStorage.getItem(KEY)).toBeNull();
    });
  });
});

describe("outside HighlightFileContext (I9, SPEC-CORE-053)", () => {
  it.each([
    ["MarkdownPreview", md, (c: HTMLElement) => c.querySelector("p") as HTMLElement],
    ["TextLines", txt, (c: HTMLElement) => c.querySelector("pre") as HTMLElement],
  ] as const)("%s has no control and no mark, with no context or a null id", async (_n, view, host) => {
    localStorage.setItem(KEY, JSON.stringify([rec("FOO", "aa", "bb")]));
    profile("alice");
    server.rows = [rec("FOO", "aa", "bb", "srv000000001")];
    const inside = render(view("aaFOObb", FILE));
    select(host(inside.container), "FOO");
    expect(await screen.findByRole("button", { name: "Highlight" })).toBeTruthy();
    await waitFor(() => expect(marks(inside.container)).toHaveLength(1));
    inside.unmount();
    server.calls = [];
    for (const id of [undefined, null] as const) {
      const { container, unmount } = render(view("aaFOObb", id));
      select(host(container), "FOO");
      await new Promise((r) => setTimeout(r, 20));
      expect(addButton()).toBeNull();
      expect(marks(container)).toHaveLength(0);
      unmount();
    }
    expect(highlightCalls()).toHaveLength(0);
  });
});

describe("selection capture is unchanged by highlights (I9, SPEC-CORE-053)", () => {
  it("captures the same quote across a mark, and clicking a mark does not change it", async () => {
    localStorage.setItem(KEY, JSON.stringify([rec("installer", "the", ".")]));
    const onController = vi.fn();
    const { container } = render(
      intl(
        <HighlightFileContext.Provider value={FILE}>
          <MarkdownPreview
            source="Run the installer."
            onDocumentCaptureController={onController}
          />
        </HighlightFileContext.Provider>,
      ),
    );
    await waitFor(() => expect(marks(container)).toHaveLength(1));
    const p = container.querySelector("p") as HTMLElement;
    const range = document.createRange();
    range.selectNodeContents(p);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    fireEvent(document, new Event("selectionchange"));
    const controller = onController.mock.calls.at(-1)?.[0];
    const snapshot = controller?.getSnapshot();
    expect(snapshot).toMatchObject({ kind: "selection", quote: "Run the installer." });
    fireEvent.click(marks(container)[0]);
    expect(controller?.getSnapshot()).toEqual(snapshot);
  });
});

describe("messages (SPEC-CORE-053)", () => {
  it.each(["en", "ja"])("%s carries the five highlight.* lines", (locale) => {
    const messages = JSON.parse(
      readFileSync(resolve(__dirname, `../../messages-core/${locale}.json`), "utf8"),
    );
    for (const key of ["add", "remove", "saveFailed", "removeFailed", "limitReached"]) {
      expect(typeof messages.highlight?.[key]).toBe("string");
      expect(messages.highlight[key].length).toBeGreaterThan(0);
    }
  });
});
