export interface PdfOutlineItem {
  depth: number;
  title: string;
  /** 1-origin, or `null` for a destination pdf.js could not resolve. */
  page: number | null;
}

export interface PdfDocumentState {
  src: string;
  numPages: number;
  page: number;
  /** `null` until the document has answered; `[]` means it has none. */
  outline: PdfOutlineItem[] | null;
}

/**
 * A store rather than a plain object because the page changes while both
 * sides are mounted, and a React state read through a prop would be one
 * render behind the panel that just wrote it.
 */
export interface PdfController {
  getState(): PdfDocumentState;
  goToPage(page: number): void;
  subscribe(listener: () => void): () => void;
}

export class PdfDocumentStore implements PdfController {
  private state: PdfDocumentState = { src: "", numPages: 0, page: 1, outline: null };
  private listeners = new Set<() => void>();

  getState(): PdfDocumentState {
    return this.state;
  }

  /**
   * Replace the state. A new object every time, so `useSyncExternalStore`'s
   * identity check is the whole comparison.
   */
  set(next: Partial<PdfDocumentState>) {
    const merged = { ...this.state, ...next };
    if (
      merged.src === this.state.src &&
      merged.numPages === this.state.numPages &&
      merged.page === this.state.page &&
      merged.outline === this.state.outline
    ) {
      return;
    }
    this.state = merged;
    for (const listener of this.listeners) listener();
  }

  /**
   * Out of range does nothing
   * at all — a reader who typed `999` into a 225-page document is better
   * served by the page not moving than by arriving at the end, because the
   * second reads as if the number were accepted.
   */
  goToPage(page: number) {
    if (!Number.isInteger(page)) return;
    if (page < 1 || page > this.state.numPages) return;
    this.onGoToPage?.(page);
  }

  onGoToPage: ((page: number) => void) | null = null;

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

/**
 * `resolvePage` is passed in rather than imported: turning a destination into
 * a page index is `PDFDocumentProxy` work, and this module must not depend on
 * pdf.js.
 */
export async function flattenOutline(
  raw: ReadonlyArray<{ title: string; items?: unknown[]; dest?: unknown }> | null,
  resolvePage: (dest: unknown) => Promise<number | null>,
): Promise<PdfOutlineItem[]> {
  if (!raw) return [];
  const out: PdfOutlineItem[] = [];
  const walk = async (
    nodes: ReadonlyArray<{ title: string; items?: unknown[]; dest?: unknown }>,
    depth: number,
  ) => {
    for (const node of nodes) {
      out.push({ depth, title: node.title, page: await resolvePage(node.dest) });
      if (Array.isArray(node.items) && node.items.length > 0) {
        await walk(
          node.items as ReadonlyArray<{ title: string; items?: unknown[]; dest?: unknown }>,
          depth + 1,
        );
      }
    }
  };
  await walk(raw, 0);
  return out;
}

/**
 * Nothing means "leave the page where it is". Out of range is nothing rather
 * than a clamp for the reason `goToPage` gives; so is `abc`, `0`, `-3`, an
 * empty box, and `1.5`.
 */
export function parsePageInput(raw: string, numPages: number): number | null {
  const trimmed = raw.trim();
  if (!/^[0-9]+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 1 || value > numPages) return null;
  return value;
}
