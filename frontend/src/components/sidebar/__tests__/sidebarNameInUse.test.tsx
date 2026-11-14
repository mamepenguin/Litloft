/**
 * SPEC-CORE-108 steps 4–6 (I9, I10) at the sidebar's three name paths: the
 * heading ＋ create, the inline rename of a collection row, and the rename
 * dialog of a Smart Collection row. The `409` is produced at `fetch`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";

import {
  type Col,
  type Smart,
  renderSidebar,
  rowsFor,
  sidebarApi,
  sidebarElement,
} from "@/__tests__/helpers/sidebarHarness";
import {
  deferred,
  expectNameInUse,
  expectNoNameInUse,
  json,
  nameInUse,
} from "@/__tests__/helpers/nameInUse";
import en from "@/messages-core/en.json";

const drive = vi.hoisted(() => ({ current: "main" }));

vi.mock("next/navigation", () => ({
  usePathname: () => `/drive/${drive.current}`,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/components/SidebarProvider", () => ({
  useSidebar: () => ({ isOpen: true, isOverlay: false, close: vi.fn(), refreshKey: 0 }),
}));
vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({
    addons: {},
    slots: {},
    loading: false,
    getSlotEntries: () => [],
    hasSlot: () => false,
    catalogueDrive: null,
  }),
}));
vi.mock("@/components/AddonSlot", () => ({ AddonSlot: () => null }));
vi.mock("@/components/sidebar/AddonNavRows", () => ({ AddonNavRows: () => null }));
vi.mock("@/components/CurrentDriveProvider", () => ({
  useCurrentDrive: () => drive.current,
  useCurrentFolderPath: () => null,
  useSetOverrideDrive: () => vi.fn(),
}));
vi.mock("@/hooks/useShortcuts", () => ({ useShortcuts: vi.fn() }));

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }));
vi.mock("@/components/ToastProvider", () => ({
  useToast: () => toast,
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const COLLECTIONS: Col[] = [{ id: "c1", name: "Trip", item_count: 2 }];
const SMART: Smart[] = [{ id: "s1", name: "Lectures" }];

let api: ReturnType<typeof sidebarApi>;

async function show() {
  api = sidebarApi({ collections: COLLECTIONS, smart: SMART });
  vi.stubGlobal("fetch", api.fetch);
  const view = renderSidebar();
  await waitFor(() => expect(rowsFor(["Trip", "Lectures"])).toHaveLength(2));
  return view;
}

const CREATE_PATH = /^\/api\/drives\/main\/collections$/;
const posts = () => api.count("POST", CREATE_PATH);
const createInput = () =>
  screen.queryByPlaceholderText(en.sidebar.collectionNamePlaceholder) as HTMLInputElement | null;
const plus = () => screen.getByRole("button", { name: en.sidebar.createCollection });

const settle = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0));
});

async function submitCreate(name: string) {
  if (!createInput()) fireEvent.click(plus());
  const input = await waitFor(() => {
    const el = createInput();
    expect(el).not.toBeNull();
    return el!;
  });
  fireEvent.change(input, { target: { value: name } });
  fireEvent.keyDown(input, { key: "Enter" });
}

async function reachInUse(name: string) {
  await submitCreate(name);
  await waitFor(() => expectNameInUse(createInput()!, name));
}

beforeEach(() => {
  localStorage.clear();
  drive.current = "main";
  toast.error.mockClear();
  toast.success.mockClear();
  toast.info.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SPEC-CORE-108 I9 the sidebar create input after a 409", () => {
  it("SPEC-CORE-108 I9 stays open holding the text, marked invalid, focused at the end, with no toast", async () => {
    await show();
    api.on("POST", CREATE_PATH, nameInUse);

    await reachInUse("trip");
    expect(posts()).toBe(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("SPEC-CORE-108 I9 a blur or an unchanged Enter sends nothing and keeps the state", async () => {
    await show();
    api.on("POST", CREATE_PATH, nameInUse);
    await reachInUse("trip");

    fireEvent.blur(createInput()!);
    await settle();
    expectNameInUse(createInput()!, "trip");

    fireEvent.keyDown(createInput()!, { key: "Enter" });
    await settle();
    expect(posts()).toBe(1);
    expectNameInUse(createInput()!, "trip");
  });

  it("SPEC-CORE-108 I9 a keystroke that changes the text clears the line, and the next Enter is sent", async () => {
    await show();
    api.on("POST", CREATE_PATH, nameInUse);
    await reachInUse("trip");

    fireEvent.change(createInput()!, { target: { value: "trip 2" } });
    expectNoNameInUse(createInput());

    api.on("POST", CREATE_PATH, () => json({ id: "c2", name: "trip 2", drive: "main", item_count: 0 }, 201));
    fireEvent.keyDown(createInput()!, { key: "Enter" });
    await waitFor(() => expect(posts()).toBe(2));
    expect(api.calls.filter((c) => c.method === "POST").map((c) => c.body)).toEqual([
      { name: "trip" },
      { name: "trip 2" },
    ]);
  });

  it("SPEC-CORE-108 I9 Escape discards the text, and the next open starts clean", async () => {
    await show();
    api.on("POST", CREATE_PATH, nameInUse);
    await reachInUse("trip");

    fireEvent.keyDown(createInput()!, { key: "Escape" });
    await waitFor(() => expect(createInput()).toBeNull());
    expectNoNameInUse();

    fireEvent.click(plus());
    const input = await waitFor(() => {
      expect(createInput()).not.toBeNull();
      return createInput()!;
    });
    expect(input.value).toBe("");
    expectNoNameInUse(input);
  });

  it("SPEC-CORE-108 I9 pressing ＋ again keeps the text and returns focus to the input", async () => {
    await show();
    api.on("POST", CREATE_PATH, nameInUse);
    await reachInUse("trip");

    fireEvent.click(plus());
    await settle();
    expectNameInUse(createInput()!, "trip");
    expect(posts()).toBe(1);
  });

  it("SPEC-CORE-108 I9 collapsing and expanding the section keeps the text and the line", async () => {
    await show();
    api.on("POST", CREATE_PATH, nameInUse);
    await reachInUse("trip");

    const heading = () =>
      Array.from(document.querySelectorAll<HTMLElement>("nav button[aria-expanded]")).find(
        (h) => (h.textContent ?? "").trim() === en.sidebar.collections,
      )!;
    fireEvent.click(heading());
    expect(createInput()).toBeNull();
    fireEvent.click(heading());

    const input = await waitFor(() => {
      expect(createInput()).not.toBeNull();
      return createInput()!;
    });
    expect(input.value).toBe("trip");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(document.body.textContent).toContain("A collection with this name already exists");
  });

  it("SPEC-CORE-108 I9 starting a rename on a row closes the in-use input and discards its text", async () => {
    await show();
    api.on("POST", CREATE_PATH, nameInUse);
    await reachInUse("trip");

    const [{ row }] = rowsFor(["Trip"]);
    fireEvent.contextMenu(row);
    fireEvent.click(await screen.findByRole("menuitem", { name: en.sidebar.renameCollection }));

    await waitFor(() => expect(screen.getByDisplayValue("Trip")).toBeInTheDocument());
    expect(createInput()).toBeNull();
    expectNoNameInUse();
  });

  it("SPEC-CORE-108 I9 a drive change closes the in-use input and discards its text", async () => {
    const view = await show();
    api.on("POST", CREATE_PATH, nameInUse);
    await reachInUse("trip");

    drive.current = "other";
    view.rerender(sidebarElement());
    await settle();
    expect(createInput()?.value ?? "").toBe("");
    expectNoNameInUse();
  });
});

describe("SPEC-CORE-108 I10 the sidebar create input while a submit is in flight", () => {
  it("SPEC-CORE-108 I10 is read-only, ignores Enter, blur and Escape, and then shows the 409", async () => {
    await show();
    const pending = deferred<Response>();
    api.on("POST", CREATE_PATH, () => pending.promise);

    await submitCreate("trip");
    await waitFor(() => expect(posts()).toBe(1));
    const input = createInput()!;
    expect(input).not.toBeNull();
    expect(input.readOnly).toBe(true);

    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    fireEvent.keyDown(input, { key: "Escape" });
    await settle();
    expect(posts()).toBe(1);
    expect(createInput()).not.toBeNull();

    await act(async () => {
      pending.resolve(nameInUse());
    });
    await waitFor(() => expectNameInUse(createInput()!, "trip"));
    expect(createInput()!.readOnly).toBe(false);
  });

  it("SPEC-CORE-108 I10 a failure other than 409 never shows the line; a later 409 does", async () => {
    await show();
    api.on("POST", CREATE_PATH, () => json({ detail: "boom" }, 500));

    await submitCreate("trip");
    await waitFor(() => expect(posts()).toBe(1));
    await settle();
    expectNoNameInUse(createInput());

    api.on("POST", CREATE_PATH, nameInUse);
    await submitCreate("trip");
    await waitFor(() => expect(posts()).toBe(2));
    await waitFor(() => expectNameInUse(createInput()!, "trip"));
  });
});

describe("SPEC-CORE-108 I9 the inline rename of a collection row", () => {
  const PUT = /^\/api\/drives\/main\/collections\/c1$/;

  async function startRename() {
    await show();
    const [{ row }] = rowsFor(["Trip"]);
    fireEvent.contextMenu(row);
    fireEvent.click(await screen.findByRole("menuitem", { name: en.sidebar.renameCollection }));
    return waitFor(() => screen.getByDisplayValue("Trip") as HTMLInputElement);
  }

  it("SPEC-CORE-108 I9 keeps the rename open after a 409; blur and unchanged Enter send nothing; Escape discards", async () => {
    const input = await startRename();
    api.on("PUT", PUT, nameInUse);

    fireEvent.change(input, { target: { value: "lectures" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(api.count("PUT", PUT)).toBe(1));
    const renaming = () => screen.getByDisplayValue("lectures") as HTMLInputElement;
    await waitFor(() => expectNameInUse(renaming(), "lectures"));
    expect(toast.error).not.toHaveBeenCalled();

    fireEvent.blur(renaming());
    fireEvent.keyDown(renaming(), { key: "Enter" });
    await settle();
    expect(api.count("PUT", PUT)).toBe(1);
    expectNameInUse(renaming(), "lectures");

    fireEvent.keyDown(renaming(), { key: "Escape" });
    await waitFor(() => expect(screen.queryByDisplayValue("lectures")).toBeNull());
    expectNoNameInUse();
    expect(rowsFor(["Trip"])).toHaveLength(1);
  });

  it("SPEC-CORE-108 I10 a rename in flight is read-only and is sent once", async () => {
    const input = await startRename();
    const pending = deferred<Response>();
    api.on("PUT", PUT, () => pending.promise);

    fireEvent.change(input, { target: { value: "Lectures" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(api.count("PUT", PUT)).toBe(1));
    const inFlight = screen.getByDisplayValue("Lectures") as HTMLInputElement;
    expect(inFlight.readOnly).toBe(true);
    fireEvent.keyDown(inFlight, { key: "Enter" });
    fireEvent.blur(inFlight);
    await settle();
    expect(api.count("PUT", PUT)).toBe(1);

    await act(async () => {
      pending.resolve(nameInUse());
    });
    await waitFor(() => expectNameInUse(screen.getByDisplayValue("Lectures") as HTMLInputElement, "Lectures"));
  });
});

/** The name field of the dialog whose title is on screen. */
function queryDialogInput(): HTMLInputElement | null {
  const title = screen.queryByText(en.smartFolder.renameTitle);
  let el: HTMLElement | null = title;
  while (el && !el.querySelector("input")) el = el.parentElement;
  return el?.querySelector("input") ?? null;
}

/** The dialog's submit button; in rename mode it reads Change. */
const submitButton = () => screen.getByRole("button", { name: en.common.change });

function dialogInput(): HTMLInputElement {
  const input = queryDialogInput();
  if (!input) throw new Error("the rename dialog is not open");
  return input;
}

describe("SPEC-CORE-108 I9 the rename dialog of a Smart Collection row", () => {
  const PATCH = /^\/api\/drives\/main\/smart-folders\/s1$/;

  async function openDialog() {
    const [{ row }] = rowsFor(["Lectures"]);
    fireEvent.contextMenu(row);
    fireEvent.click(await screen.findByRole("menuitem", { name: en.smartFolder.rename }));
    return waitFor(() => dialogInput());
  }

  it("SPEC-CORE-108 I9 keeps the dialog open after a 409, Save enabled, no banner and no toast; Cancel discards", async () => {
    await show();
    api.on("PATCH", PATCH, nameInUse);
    const input = await openDialog();

    fireEvent.change(input, { target: { value: "TRIP" } });
    fireEvent.click(submitButton());
    await waitFor(() => expect(api.count("PATCH", PATCH)).toBe(1));
    const field = () => dialogInput();
    await waitFor(() => expectNameInUse(field(), "TRIP"));

    expect(submitButton()).not.toBeDisabled();
    expect(document.body.textContent).not.toContain(en.smartFolder.renameFailed);
    expect(document.body.textContent).not.toContain(en.smartFolder.saveFailed);
    expect(toast.error).not.toHaveBeenCalled();

    fireEvent.blur(field());
    fireEvent.click(submitButton());
    fireEvent.keyDown(field(), { key: "Enter" });
    await settle();
    expect(api.count("PATCH", PATCH)).toBe(1);
    expectNameInUse(field(), "TRIP");

    fireEvent.click(screen.getByRole("button", { name: en.common.cancel }));
    await waitFor(() => expect(queryDialogInput()).toBeNull());

    const reopened = await openDialog();
    expect(reopened.value).toBe("Lectures");
    expectNoNameInUse(reopened);
  });

  it("SPEC-CORE-108 I10 a rename in flight ignores Save, Cancel and Escape and is sent once", async () => {
    await show();
    const pending = deferred<Response>();
    api.on("PATCH", PATCH, () => pending.promise);
    const input = await openDialog();

    fireEvent.change(input, { target: { value: "Trip" } });
    fireEvent.click(submitButton());
    await waitFor(() => expect(api.count("PATCH", PATCH)).toBe(1));
    const field = () => dialogInput();
    expect(field().readOnly).toBe(true);

    fireEvent.click(submitButton());
    fireEvent.keyDown(field(), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: en.common.cancel }));
    fireEvent.keyDown(field(), { key: "Escape" });
    await settle();
    expect(api.count("PATCH", PATCH)).toBe(1);
    expect(queryDialogInput()).not.toBeNull();

    await act(async () => {
      pending.resolve(nameInUse());
    });
    await waitFor(() => expectNameInUse(field(), "Trip"));
  });

  it("SPEC-CORE-108 I10 a failure other than 409 shows today's feedback and never the line", async () => {
    await show();
    api.on("PATCH", PATCH, () => json({ detail: "boom" }, 500));
    const input = await openDialog();

    fireEvent.change(input, { target: { value: "Elsewhere" } });
    fireEvent.click(submitButton());
    await waitFor(() => expect(api.count("PATCH", PATCH)).toBe(1));
    await settle();
    expectNoNameInUse();

    if (!queryDialogInput()) await openDialog();
    api.on("PATCH", PATCH, nameInUse);
    fireEvent.change(dialogInput(), { target: { value: "trip" } });
    fireEvent.click(submitButton());
    await waitFor(() => expect(api.count("PATCH", PATCH)).toBe(2));
    await waitFor(() =>
      expectNameInUse(dialogInput(), "trip"),
    );
  });
});
