import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";

import { PdfDocumentStore } from "@/lib/pdfController";
import {
  INITIAL_THUMBNAIL_WINDOW,
  PdfPagesPanel,
} from "../PdfPagesPanel";

/** Whether the fake pages report a completed paint. */
let reportPaint = true;

/** The page numbers currently mounted in the rail, in order. */
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
    // pdf.js reports each page when it has actually painted. The rail waits
    // for that before it will grow, so a fake that never reports would leave
    // the growth path untestable — and one that always reports would hide
    // the gate.
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

    // The number is fixed, not a bound: `toBe`, because "at most 10" is also
    // satisfied by a rail that mounts one and a rail that mounts none.
    expect(mounted().length).toBe(INITIAL_THUMBNAIL_WINDOW);
    expect(INITIAL_THUMBNAIL_WINDOW).toBe(8);
    expect(mounted()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("holds the window until the pages in it have painted", () => {
    // An unpainted `<Page>` is a zero-height box, so eight of them do not
    // fill the column and the sentinel would be in view at t=0. Measured in
    // Chromium: 16 thumbnails mounted on load before this gate, 8 after.
    reportPaint = false;
    render(<PdfPagesPanel controller={storeWith({ numPages: 225, page: 1 })} />);
    // No sentinel means nothing to observe, so nothing can ask for more.
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

    // The sentinel is `aria-hidden`, so it is not one of these.
    expect(screen.getAllByRole("listitem").length).toBe(
      INITIAL_THUMBNAIL_WINDOW * 2,
    );
    expect(mounted()).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
  });

  it("never draws past the end of the document", () => {
    render(<PdfPagesPanel controller={storeWith({ numPages: 3, page: 1 })} />);
    expect(mounted()).toEqual([1, 2, 3]);
    // And no sentinel, because there is nothing left to reach.
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
    expect(row).toBeDisabled();
    fireEvent.click(row);
    expect(go).not.toHaveBeenCalled();
  });

  it("draws no outline section for a document without one", () => {
    render(<PdfPagesPanel controller={storeWith({ numPages: 10, page: 1, outline: [] })} />);
    expect(screen.queryByRole("navigation")).toBeNull();
    // The rail is still there — that is the half this panel always has.
    expect(screen.getByTestId("pdf-thumbnails")).toBeInTheDocument();
  });
});
