import { vi } from "vitest";
import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { Library, ListFilter } from "lucide-react";

import { WebSocketContext } from "@/components/WebSocketProvider";
import { Sidebar } from "@/components/Sidebar";
import { createApiStub, json } from "./nameInUse";

/**
 * The full `Sidebar` with its requests answered at `fetch`. A test file using
 * it mocks `next/navigation`, `SidebarProvider`, the addon providers,
 * `CurrentDriveProvider` and `useShortcuts` (see the Sidebar tests for the
 * shape), so that this module only owns the data.
 */

export interface Col {
  id: string;
  name: string;
  item_count?: number;
}
export interface Smart {
  id: string;
  name: string;
}

export type ListAnswer<T> = T[] | "fail";

export function collectionRow(c: Col, drive = "main") {
  return {
    id: c.id,
    name: c.name,
    description: null,
    drive,
    item_count: c.item_count ?? 0,
    first_file_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

export function smartRow(s: Smart, drive = "main") {
  return {
    id: s.id,
    drive,
    name: s.name,
    query: `q-${s.id}`,
    file_type: null,
    sort_by: null,
    sort_order: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: null,
    on_home: false,
  };
}

export function sidebarApi(data: {
  collections: ListAnswer<Col>;
  smart: ListAnswer<Smart>;
  pins?: { path: string }[];
  drive?: string;
}) {
  const drive = data.drive ?? "main";
  const api = createApiStub((c) => {
    if (c.path.endsWith("/api/auth/status")) {
      return json({ unlocked_groups: [], has_protected_drives: false, is_admin: false });
    }
    if (c.path.endsWith("/summary")) return json({ name: drive, trash_count: 0, missing_count: 0 });
    if (c.path.endsWith("/inbox/count")) return json({ open: 0 });
    if (c.path.endsWith("/pins")) return json((data.pins ?? []).map((p) => ({ ...p, on_home: false })));
    return json([]);
  });
  api.on("GET", /^\/api\/drives\/[^/]+\/collections$/, () =>
    data.collections === "fail"
      ? json({ detail: "boom" }, 500)
      : json(data.collections.map((c) => collectionRow(c, drive))),
  );
  api.on("GET", /^\/api\/drives\/[^/]+\/smart-folders$/, () =>
    data.smart === "fail" ? json({ detail: "boom" }, 500) : json(data.smart.map((s) => smartRow(s, drive))),
  );
  return api;
}

export function sidebarElement() {
  return (
    <WebSocketContext.Provider value={{ lastEvent: null, connected: true }}>
      <Sidebar />
    </WebSocketContext.Provider>
  );
}

export function renderSidebar() {
  return render(sidebarElement());
}

export const iconOf = (el: Element | null | undefined) =>
  (el?.querySelector("svg")?.getAttribute("class") ?? "")
    .split(/\s+/)
    .filter((c) => c.startsWith("lucide-") && c !== "lucide-icon");

function iconClass(Icon: typeof ListFilter): string {
  const { container, unmount } = render(<Icon />);
  const [cls] = iconOf(container);
  unmount();
  return cls;
}

export function kindIcons() {
  return { collection: iconClass(Library), smart: iconClass(ListFilter) };
}

const before = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

/** The row a name is drawn in, one per drawn name, in document order. */
export function rowsFor(names: string[]): { name: string; row: HTMLElement }[] {
  const nav = document.querySelector("nav");
  if (!nav) return [];
  const found: { name: string; row: HTMLElement }[] = [];
  for (const name of new Set(names)) {
    for (const el of Array.from(nav.querySelectorAll<HTMLElement>("*"))) {
      if (el.children.length === 0 && el.textContent === name) {
        const row = el.closest<HTMLElement>("button, a") ?? el;
        if (!found.some((f) => f.row === row)) found.push({ name, row });
      }
    }
  }
  return found.sort((a, b) => (before(a.row, b.row) ? -1 : 1));
}

export const drawnOrder = (names: string[]) => rowsFor(names).map((r) => r.name);

/** The collapsible section heading that comes last before `el` in the column. */
export function headingOf(el: HTMLElement): string | null {
  const headings = Array.from(document.querySelectorAll<HTMLElement>("nav button[aria-expanded]"));
  const prior = headings.filter((h) => before(h, el));
  return prior.length ? (prior[prior.length - 1].textContent ?? "").trim() : null;
}

export const sectionHeadings = () =>
  Array.from(document.querySelectorAll<HTMLElement>("nav button[aria-expanded]")).map((h) =>
    (h.textContent ?? "").trim(),
  );

/** The item grip that comes last before `row` in the column. */
export function handleOf(row: HTMLElement): HTMLElement {
  const handles = screen.getAllByRole("button", { name: "Drag to reorder" });
  const prior = handles.filter((h) => before(h, row));
  return prior[prior.length - 1];
}

/** A pointer drag of `from`'s grip, dropped on the top half of `onto`'s row. */
export function dragBefore(from: HTMLElement, onto: HTMLElement) {
  const rect = vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    top: 0,
    height: 20,
    bottom: 20,
    left: 0,
    right: 100,
    width: 100,
    x: 0,
    y: 0,
    toJSON() {},
  } as DOMRect);
  const store = new Map<string, string>();
  const dataTransfer = {
    setData: (t: string, v: string) => void store.set(t, v),
    getData: (t: string) => store.get(t) ?? "",
    get types() {
      return [...store.keys()];
    },
    effectAllowed: "",
    dropEffect: "",
  };
  const source = handleOf(from);
  const target = handleOf(onto);
  fireEvent.dragStart(source, { dataTransfer });
  for (const kind of ["dragOver", "drop"] as const) {
    const event = createEvent[kind](target, { dataTransfer });
    Object.defineProperty(event, "clientY", { value: 2 });
    fireEvent(target, event);
  }
  fireEvent.dragEnd(source, { dataTransfer });
  rect.mockRestore();
}
