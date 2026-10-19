import { describe, it, expect, vi } from "vitest";

import {
  flattenOutline,
  parsePageInput,
  PdfDocumentStore,
} from "../pdfController";

describe("parsePageInput", () => {
  // Out of range does not clamp. A reader who typed `999` into a 225-page
  // document and landed on 225 cannot tell that from the number having been
  // accepted; the page not moving says the input was rejected.
  it("takes a page inside the document", () => {
    expect(parsePageInput("12", 225)).toBe(12);
    expect(parsePageInput("  12 ", 225)).toBe(12);
    expect(parsePageInput("1", 225)).toBe(1);
    expect(parsePageInput("225", 225)).toBe(225);
  });

  it("refuses everything else, rather than folding it to an edge", () => {
    for (const raw of ["0", "226", "-3", "abc", "", "  ", "1.5", "1e2", "١٢"]) {
      expect(parsePageInput(raw, 225)).toBeNull();
    }
  });
});

describe("PdfDocumentStore", () => {
  it("notifies subscribers when the state changes, and not when it does not", () => {
    const store = new PdfDocumentStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.set({ numPages: 225 });
    expect(listener).toHaveBeenCalledTimes(1);
    store.set({ numPages: 225 });
    expect(listener).toHaveBeenCalledTimes(1);
    store.set({ page: 12 });
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    store.set({ page: 13 });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("keeps 'not asked yet' apart from 'has none'", () => {
    const store = new PdfDocumentStore();
    expect(store.getState().outline).toBeNull();
    store.set({ outline: [] });
    expect(store.getState().outline).toEqual([]);
  });

  it("passes only a page the document has to the viewer", () => {
    const store = new PdfDocumentStore();
    const go = vi.fn();
    store.onGoToPage = go;
    store.set({ numPages: 225 });

    store.goToPage(12);
    expect(go).toHaveBeenCalledWith(12);

    for (const bad of [0, 226, -1, 1.5, NaN]) {
      store.goToPage(bad);
    }
    expect(go).toHaveBeenCalledTimes(1);
  });

  it("moves nothing before the document has loaded", () => {
    // `numPages` is 0 until `onLoadSuccess`, so every page is out of range.
    const store = new PdfDocumentStore();
    const go = vi.fn();
    store.onGoToPage = go;
    store.goToPage(1);
    expect(go).not.toHaveBeenCalled();
  });
});

describe("flattenOutline", () => {
  const resolve = async (dest: unknown) =>
    typeof dest === "number" ? dest : null;

  it("answers [] for a document with no outline", async () => {
    expect(await flattenOutline(null, resolve)).toEqual([]);
  });

  it("flattens the tree, keeping the depth the nesting carried", async () => {
    const raw = [
      { title: "Part I", dest: 1, items: [{ title: "Chapter 1", dest: 3 }] },
      { title: "Part II", dest: 40 },
    ];
    expect(await flattenOutline(raw, resolve)).toEqual([
      { depth: 0, title: "Part I", page: 1 },
      { depth: 1, title: "Chapter 1", page: 3 },
      { depth: 0, title: "Part II", page: 40 },
    ]);
  });

  it("keeps a row whose destination does not resolve", async () => {
    // Dropping it would silently shorten a table of contents its author
    // wrote. The row stays; the panel gives it no jump.
    expect(
      await flattenOutline([{ title: "Missing", dest: "nowhere" }], resolve)
    ).toEqual([{ depth: 0, title: "Missing", page: null }]);
  });

  it("descends more than one level", async () => {
    const raw = [
      {
        title: "A",
        dest: 1,
        items: [{ title: "B", dest: 2, items: [{ title: "C", dest: 3 }] }],
      },
    ];
    expect((await flattenOutline(raw, resolve)).map((i) => i.depth)).toEqual([
      0, 1, 2,
    ]);
  });
});
