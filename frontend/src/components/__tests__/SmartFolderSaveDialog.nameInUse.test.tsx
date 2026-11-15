/**
 * SPEC-CORE-108 steps 5.5 and 5.6 (I9, I10): the Smart Collection dialog on
 * the search page, in save mode and in rename mode from the `…` menu. The
 * dialog and the hook are the real ones; the `409` is produced at `fetch`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { SmartFolderController, SmartFolderMenuItems } from "../SmartFolderSaveButton";
import {
  createApiStub,
  deferred,
  expectNameInUse,
  expectNoNameInUse,
  json,
  nameInUse,
} from "@/__tests__/helpers/nameInUse";
import en from "@/messages-core/en.json";

const routerReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: routerReplace }),
}));

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }));
vi.mock("@/components/ToastProvider", () => ({
  useToast: () => toast,
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const LIST = /^\/api\/drives\/main\/smart-folders$/;
const ONE = /^\/api\/drives\/main\/smart-folders\/sf1$/;

const SAVED = {
  id: "sf1",
  drive: "main",
  name: "Lectures",
  query: "foo",
  file_type: null,
  sort_by: null,
  sort_order: null,
  created_at: "2026-05-01T00:00:00Z",
  updated_at: null,
  on_home: false,
};

let api: ReturnType<typeof createApiStub>;

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

function page(smartFolderId: string | null) {
  return render(
    <SmartFolderController drive="main" query="foo" typeFilter={null} smartFolderId={smartFolderId}>
      <div role="menu">
        <SmartFolderMenuItems closeMenu={vi.fn()} />
      </div>
    </SmartFolderController>,
  );
}

/** The name field of the dialog whose title is on screen. */
function queryField(title: string): HTMLInputElement | null {
  let el: HTMLElement | null = screen.queryByText(title);
  while (el && !el.querySelector("input")) el = el.parentElement;
  return el?.querySelector("input") ?? null;
}

function field(title: string): HTMLInputElement {
  const input = queryField(title);
  if (!input) throw new Error(`no dialog titled ${title}`);
  return input;
}

const MODES = {
  save: {
    title: en.smartFolder.saveTitle,
    item: en.smartFolder.save,
    submit: en.smartFolder.saveAction,
    method: "POST",
    path: LIST,
    id: null,
  },
  rename: {
    title: en.smartFolder.renameTitle,
    item: en.smartFolder.rename,
    submit: en.common.change,
    method: "PATCH",
    path: ONE,
    id: "sf1",
  },
} as const;

type Mode = keyof typeof MODES;

async function openDialog(mode: Mode) {
  const m = MODES[mode];
  fireEvent.click(await screen.findByRole("menuitem", { name: m.item }));
  return waitFor(() => field(m.title));
}

const submitButton = (mode: Mode) => screen.getByRole("button", { name: MODES[mode].submit });
const sent = (mode: Mode) => api.count(MODES[mode].method, MODES[mode].path);

async function submit(mode: Mode, name: string) {
  const input = queryField(MODES[mode].title) ?? (await openDialog(mode));
  fireEvent.change(input, { target: { value: name } });
  fireEvent.click(submitButton(mode));
}

beforeEach(() => {
  toast.error.mockClear();
  routerReplace.mockReset();
  api = createApiStub(() => json([]));
  api.on("GET", LIST, () => json([SAVED]));
  vi.stubGlobal("fetch", api.fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each(["save", "rename"] as const)("SPEC-CORE-108 I9 the search page's dialog in %s mode", (mode) => {
  const m = MODES[mode];

  it(`SPEC-CORE-108 I9 ${mode}: after a 409 stays open with the text, Save enabled, no banner, no toast`, async () => {
    api.on(m.method, m.path, nameInUse);
    page(m.id);
    await openDialog(mode);
    if (mode === "save") expect(screen.getByText(en.smartFolder.saveDescription)).toBeInTheDocument();

    await submit(mode, "trip");
    await waitFor(() => expect(sent(mode)).toBe(1));
    await waitFor(() => expectNameInUse(field(m.title), "trip"));
    expect(submitButton(mode)).not.toBeDisabled();
    for (const banner of [en.smartFolder.saveFailed, en.smartFolder.renameFailed, en.smartFolder.updateFailed]) {
      expect(document.body.textContent).not.toContain(banner);
    }
    expect(toast.error).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it(`SPEC-CORE-108 I9 ${mode}: blur and an unchanged Save send nothing; a changed text clears the line`, async () => {
    api.on(m.method, m.path, nameInUse);
    page(m.id);
    await submit(mode, "trip");
    await waitFor(() => expectNameInUse(field(m.title), "trip"));

    fireEvent.blur(field(m.title));
    fireEvent.click(submitButton(mode));
    fireEvent.keyDown(field(m.title), { key: "Enter" });
    await settle();
    expect(sent(mode)).toBe(1);
    expectNameInUse(field(m.title), "trip");

    fireEvent.change(field(m.title), { target: { value: "trip 2" } });
    expectNoNameInUse(field(m.title));
    fireEvent.click(submitButton(mode));
    await waitFor(() => expect(sent(mode)).toBe(2));
  });

  it(`SPEC-CORE-108 I9 ${mode}: Cancel discards the text, and the next open starts clean`, async () => {
    api.on(m.method, m.path, nameInUse);
    page(m.id);
    await submit(mode, "trip");
    await waitFor(() => expectNameInUse(field(m.title), "trip"));

    fireEvent.click(screen.getByRole("button", { name: en.common.cancel }));
    await waitFor(() => expect(queryField(m.title)).toBeNull());

    const reopened = await openDialog(mode);
    expect(reopened.value).toBe(mode === "save" ? "" : "Lectures");
    expectNoNameInUse(reopened);
  });

  it(`SPEC-CORE-108 I10 ${mode}: in flight the field is read-only and Save, Enter, Cancel and Escape are ignored`, async () => {
    const pending = deferred<Response>();
    api.on(m.method, m.path, () => pending.promise);
    page(m.id);
    await submit(mode, "trip");
    await waitFor(() => expect(sent(mode)).toBe(1));

    expect(field(m.title).readOnly).toBe(true);
    fireEvent.click(submitButton(mode));
    fireEvent.keyDown(field(m.title), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: en.common.cancel }));
    fireEvent.keyDown(field(m.title), { key: "Escape" });
    await settle();
    expect(sent(mode)).toBe(1);
    expect(queryField(m.title)).not.toBeNull();

    await act(async () => {
      pending.resolve(nameInUse());
    });
    await waitFor(() => expectNameInUse(field(m.title), "trip"));
  });

  it(`SPEC-CORE-108 I10 ${mode}: a failure other than 409 never shows the line; a later 409 does`, async () => {
    api.on(m.method, m.path, () => json({ detail: "boom" }, 500));
    page(m.id);
    await submit(mode, "trip");
    await waitFor(() => expect(sent(mode)).toBe(1));
    await settle();
    expectNoNameInUse();

    api.on(m.method, m.path, nameInUse);
    await submit(mode, "trip");
    await waitFor(() => expect(sent(mode)).toBe(2));
    await waitFor(() => expectNameInUse(field(m.title), "trip"));
  });
});
