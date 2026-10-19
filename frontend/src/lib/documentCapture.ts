export interface DocumentCaptureLocator {
  page?: number;
  label?: string;
}

export interface DocumentCaptureAnchor {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface DocumentCaptureCandidate {
  kind: "selection" | "page";
  quote?: string;
  locator?: DocumentCaptureLocator;
  anchor?: DocumentCaptureAnchor;
}

export interface DocumentCaptureController {
  getSnapshot(): DocumentCaptureCandidate | null;
  subscribe(listener: () => void): () => void;
}

export class DocumentCaptureStore implements DocumentCaptureController {
  private capture: DocumentCaptureCandidate | null = null;
  private readonly listeners = new Set<() => void>();

  getSnapshot = (): DocumentCaptureCandidate | null => this.capture;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setCapture(capture: DocumentCaptureCandidate | null): void {
    this.capture = capture;
    this.listeners.forEach((listener) => listener());
  }
}

interface SelectionOptions {
  includeHeading?: boolean;
  includePdfPage?: boolean;
}

function asElement(node: Node): Element | null {
  return node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : node.parentElement;
}

function isInside(root: HTMLElement, node: Node): boolean {
  return node === root || root.contains(node);
}

function nearestHeading(root: HTMLElement, startNode: Node): string | undefined {
  const start = asElement(startNode);
  if (!start) return undefined;
  const ownHeading = start.closest("h1, h2, h3, h4, h5, h6");
  if (ownHeading && root.contains(ownHeading)) {
    return ownHeading.textContent?.trim() || undefined;
  }

  let result: string | undefined;
  for (const heading of root.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
    const position = heading.compareDocumentPosition(start);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
      result = heading.textContent?.trim() || result;
      continue;
    }
    break;
  }
  return result;
}

function pdfPage(startNode: Node): number | undefined {
  const raw = asElement(startNode)?.closest<HTMLElement>("[data-pdf-page]")
    ?.dataset.pdfPage;
  if (!raw) return undefined;
  const page = Number(raw);
  return Number.isInteger(page) && page > 0 ? page : undefined;
}

function selectionAnchor(range: Range): DocumentCaptureAnchor | undefined {
  if (typeof range.getBoundingClientRect !== "function") return undefined;
  const rect = range.getBoundingClientRect();
  if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top)) return undefined;
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

export function readDocumentSelection(
  root: HTMLElement,
  selection: Selection | null,
  options: SelectionOptions = {},
): DocumentCaptureCandidate | null {
  if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) {
    return null;
  }
  const range = selection.getRangeAt(0);
  if (!isInside(root, range.startContainer) || !isInside(root, range.endContainer)) {
    return null;
  }
  const quote = selection.toString().replace(/\s+/g, " ").trim();
  if (!quote) return null;

  const page = options.includePdfPage ? pdfPage(range.startContainer) : undefined;
  const label = options.includeHeading
    ? nearestHeading(root, range.startContainer)
    : undefined;
  const locator = page != null || label ? { page, label } : undefined;

  return {
    kind: "selection",
    quote,
    locator,
    anchor: selectionAnchor(range),
  };
}
