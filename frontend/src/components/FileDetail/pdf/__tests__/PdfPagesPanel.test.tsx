import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";

import { PdfDocumentStore } from "@/lib/pdfController";
import {
  INITIAL_THUMBNAIL_WINDOW,
  PdfPagesPanel,
  PdfPagesTab,
} from "../PdfPagesPanel";

let reportPaint = true;

const mounted = () =>
  [...document.querySelectorAll("[data-thumb]")].map((el) =>
    Number(el.getAttribute("data-thumb")),
  );

vi.mock("react-pdf", () => ({
  Page: ({
    pageNumber,
    onRenderSuccess,
  }: {
    pageNumber: number;
    onRenderSuccess?: () => void;
  }) => {
    useEffect(() => {
      if (reportPaint) onRenderSuccess?.();
    }, [onRenderSuccess]);
    return <div data-thumb={pageNumber} />;
  },
  Document: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

let observers: Array<{ cb: IntersectionObserverCallback; el: Element | null }> = [];

beforeEach(() => {
  reportPaint = true;
  observers = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(private cb: IntersectionObserverCallback) {
        observers.push({ cb, el: null });
      }
      observe(el: Element) {
        observers[observers.length - 1].el = el;
      }
      disconnect() {}
      unobserve() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
});

function storeWith(state: Parameters<PdfDocumentStore["set"]>[0]) {
  const store = new PdfDocumentStore();
  store.set(state);
  return store;
}

describe("PdfPagesPanel", () => {
  it("draws a bounded window of a long document, not all of it", () => {
    render(<PdfPagesPanel controller={storeWith({ numPages: 225, page: 1 })} />);

    expect(mounted().length).toBe(INITIAL_THUMBNAIL_WINDOW);
    expect(INITIAL_THUMBNAIL_WINDOW).toBe(8);
    expect(mounted()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("holds the window until the pages in it have painted", () => {
    // An unpainted `<Page>` is a zero-height box, so eight of them do not
    // fill the column and the sentinel would be in view at t=0.
    reportPaint = false;
    render(<PdfPagesPanel controller={storeWith({ numPages: 225, page: 1 })} />);
    expect(observers.length).toBe(0);
    expect(mounted().length).toBe(INITIAL_THUMBNAIL_WINDOW);
  });

  it("grows the window as the rail is scrolled", () => {
    render(<PdfPagesPanel controller={storeWith({ numPages: 225, page: 1 })} />);

    act(() => {
      observers[0].cb(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    expect(screen.getAllByRole("listitem").length).toBe(
      INITIAL_THUMBNAIL_WINDOW * 2,
    );
    expect(mounted()).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
  });

  it("never draws past the end of the document", () => {
    render(<PdfPagesPanel controller={storeWith({ numPages: 3, page: 1 })} />);
    expect(mounted()).toEqual([1, 2, 3]);
    expect(screen.getAllByRole("listitem").length).toBe(3);
  });

  it("moves the viewer when a thumbnail is pressed", () => {
    const store = storeWith({ numPages: 225, page: 1 });
    const go = vi.fn();
    store.onGoToPage = go;
    render(<PdfPagesPanel controller={store} />);

    fireEvent.click(screen.getByRole("button", { name: "Go to page 4" }));
    expect(go).toHaveBeenCalledWith(4);
  });

  it("marks the page the viewer is on, and follows it", () => {
    const store = storeWith({ numPages: 225, page: 1 });
    const { rerender } = render(<PdfPagesPanel controller={store} />);
    expect(
      screen.getByRole("button", { name: "Go to page 1" }).getAttribute("aria-current"),
    ).toBe("true");

    act(() => store.set({ page: 5 }));
    rerender(<PdfPagesPanel controller={store} />);
    expect(
      screen.getByRole("button", { name: "Go to page 5" }).getAttribute("aria-current"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "Go to page 1" }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("draws the outline when the document has one, indented by its nesting", () => {
    const store = storeWith({
      numPages: 225,
      page: 3,
      outline: [
        { depth: 0, title: "Part I", page: 1 },
        { depth: 1, title: "Chapter 1", page: 3 },
        { depth: 0, title: "Nowhere", page: null },
      ],
    });
    const go = vi.fn();
    store.onGoToPage = go;
    render(<PdfPagesPanel controller={store} />);

    const nav = screen.getByRole("navigation", { name: "Contents" });
    const rows = within(nav).getAllByRole("button");
    expect(rows.map((r) => r.textContent)).toEqual([
      "Part I1",
      "Chapter 13",
      "Nowhere",
    ]);
    expect(rows[1].style.paddingLeft).toBe("20px");

    fireEvent.click(rows[0]);
    expect(go).toHaveBeenCalledWith(1);
  });

  it("gives an unresolvable outline row no jump", () => {
    const store = storeWith({
      numPages: 10,
      page: 1,
      outline: [{ depth: 0, title: "Nowhere", page: null }],
    });
    const go = vi.fn();
    store.onGoToPage = go;
    render(<PdfPagesPanel controller={store} />);

    const row = within(screen.getByRole("navigation", { name: "Contents" })).getByRole(
      "button",
    );
    // `aria-disabled`, not `disabled`: a `disabled` button leaves the tab
    // order, so a keyboard reader would find the contents shorter than shown.
    expect(row.getAttribute("aria-disabled")).toBe("true");
    expect(row).not.toBeDisabled();
    fireEvent.click(row);
    expect(go).not.toHaveBeenCalled();
  });

  it("draws no outline section for a document without one", () => {
    render(<PdfPagesPanel controller={storeWith({ numPages: 10, page: 1, outline: [] })} />);
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.getByTestId("pdf-thumbnails")).toBeInTheDocument();
  });
});

describe("PdfPagesPanel, following the document", () => {
  it("moves the window to hold the page the canvas is on, without growing it", () => {
    // Extending the window to reach page 180 would mount 180 rasters at once.
    render(<PdfPagesPanel controller={storeWith({ numPages: 225, page: 180 })} />);

    expect(mounted().length).toBe(INITIAL_THUMBNAIL_WINDOW);
    expect(mounted()[0]).toBe(179);
    expect(
      screen.getByRole("button", { name: "Go to page 180" }).getAttribute("aria-current"),
    ).toBe("true");
  });

  it("re-seats when the page leaves the window, and only then", () => {
    const store = storeWith({ numPages: 225, page: 1 });
    const { rerender } = render(<PdfPagesPanel controller={store} />);
    expect(mounted()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    act(() => store.set({ page: 5 }));
    rerender(<PdfPagesPanel controller={store} />);
    expect(mounted()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    act(() => store.set({ page: 9 }));
    rerender(<PdfPagesPanel controller={store} />);
    expect(mounted()).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it("stops the window at the end of the document", () => {
    render(<PdfPagesPanel controller={storeWith({ numPages: 225, page: 225 })} />);
    expect(mounted()).toEqual([224, 225]);
  });

  it("starts the window over when the document changes", () => {
    const store = storeWith({ numPages: 225, page: 1, src: "/a.pdf" });
    const { rerender } = render(<PdfPagesPanel controller={store} />);
    act(() => {
      observers[0].cb(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
    expect(mounted().length).toBe(INITIAL_THUMBNAIL_WINDOW * 2);

    act(() => store.set({ src: "/b.pdf", numPages: 225, page: 1 }));
    rerender(<PdfPagesPanel controller={store} />);
    expect(mounted().length).toBe(INITIAL_THUMBNAIL_WINDOW);
  });

  it("marks the outline entry the reader is inside, not only its first page", () => {
    const store = storeWith({
      numPages: 225,
      page: 7,
      outline: [
        { depth: 0, title: "Part I", page: 1 },
        { depth: 0, title: "Chapter 1", page: 3 },
        { depth: 0, title: "Chapter 2", page: 40 },
      ],
    });
    render(<PdfPagesPanel controller={store} />);

    const rows = within(
      screen.getByRole("navigation", { name: "Contents" }),
    ).getAllByRole("button");
    expect(rows.map((r) => r.getAttribute("aria-current"))).toEqual([
      null,
      "true",
      null,
    ]);
  });

  it("names the thumbnail rail", () => {
    render(<PdfPagesPanel controller={storeWith({ numPages: 3, page: 1 })} />);
    expect(screen.getByRole("list", { name: "Page thumbnails" })).toBeInTheDocument();
  });
});

describe("PdfPagesTab", () => {
  it("opens no document until the tab has been on screen", () => {
    // `InspectorShell` mounts every panel and hides the unselected ones, so an
    // eager `<Document>` would parse and rasterise behind `display: none`.
    let intersect: ((visible: boolean) => void) | null = null;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: IntersectionObserverCallback) {
          intersect = (visible) =>
            cb(
              [{ isIntersecting: visible } as IntersectionObserverEntry],
              this as unknown as IntersectionObserver,
            );
        }
        observe() {}
        disconnect() {}
        unobserve() {}
      },
    );

    const store = storeWith({ numPages: 225, page: 1, src: "/a.pdf" });
    render(<PdfPagesTab controller={store} />);
    expect(mounted().length).toBe(0);

    act(() => intersect!(true));
    expect(mounted().length).toBe(INITIAL_THUMBNAIL_WINDOW);
  });

  it("keeps the document open once the reader has left the tab", () => {
    let intersect: ((visible: boolean) => void) | null = null;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: IntersectionObserverCallback) {
          intersect = (visible) =>
            cb(
              [{ isIntersecting: visible } as IntersectionObserverEntry],
              this as unknown as IntersectionObserver,
            );
        }
        observe() {}
        disconnect() {}
        unobserve() {}
      },
    );

    render(<PdfPagesTab controller={storeWith({ numPages: 225, page: 1, src: "/a.pdf" })} />);
    act(() => intersect!(true));
    act(() => intersect!(false));
    expect(mounted().length).toBe(INITIAL_THUMBNAIL_WINDOW);
  });
});
