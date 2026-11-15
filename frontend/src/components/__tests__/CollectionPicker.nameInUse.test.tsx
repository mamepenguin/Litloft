/**
 * SPEC-CORE-108 steps 4–6 (I9, I10) at the create field of `CollectionPicker`.
 * The `409` is produced at `fetch`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { CollectionPicker } from "../CollectionPicker";
import {
  createApiStub,
  deferred,
  expectNameInUse,
  expectNoNameInUse,
  json,
  nameInUse,
  NAME_IN_USE,
} from "@/__tests__/helpers/nameInUse";
import en from "@/messages-core/en.json";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }));
vi.mock("@/components/ToastProvider", () => ({
  useToast: () => toast,
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const CREATE = /^\/api\/drives\/main\/collections$/;
const ITEMS = /\/collections\/[^/]+\/items$/;

let api: ReturnType<typeof createApiStub>;

function picker(open = true) {
  return <CollectionPicker open={open} drive="main" fileIds={["f1"]} onClose={vi.fn()} />;
}

const createField = () =>
  screen.queryByPlaceholderText(en.collection.newCollectionPlaceholder) as HTMLInputElement | null;
const createButton = () => screen.getByRole("button", { name: en.common.create });

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

async function startCreating() {
  await waitFor(() => expect(api.count("GET", CREATE)).toBeGreaterThan(0));
  fireEvent.click(await screen.findByText(en.collection.newCollection));
  return waitFor(() => {
    expect(createField()).not.toBeNull();
    return createField()!;
  });
}

async function submit(name: string, how: "button" | "enter" = "button") {
  const input = createField() ?? (await startCreating());
  fireEvent.change(input, { target: { value: name } });
  if (how === "enter") fireEvent.keyDown(input, { key: "Enter" });
  else fireEvent.click(createButton());
}

beforeEach(() => {
  toast.error.mockClear();
  api = createApiStub(() => json([]));
  api.on("GET", CREATE, () => json([{ id: "c1", name: "Trip", drive: "main", item_count: 0 }]));
  vi.stubGlobal("fetch", api.fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-108 I9 the CollectionPicker create field after a 409", () => {
  it("SPEC-CORE-108 I9 stays open with the text, invalid and focused, adds nothing, and puts the line under the input's row", async () => {
    api.on("POST", CREATE, nameInUse);
    render(picker());
    await startCreating();

    await submit("trip");
    await waitFor(() => expect(api.count("POST", CREATE)).toBe(1));
    await waitFor(() => expectNameInUse(createField()!, "trip"));
    expect(api.count("POST", ITEMS)).toBe(0);
    expect(toast.error).not.toHaveBeenCalled();

    const input = createField()!;
    let row: HTMLElement = input.parentElement!;
    while (!row.contains(createButton())) row = row.parentElement!;
    const line = screen.getByText(NAME_IN_USE);
    expect(row.contains(line)).toBe(false);
    expect(row.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("SPEC-CORE-108 I9 a blur, an unchanged Enter or Create sends nothing; a changed text clears the line and is sent", async () => {
    api.on("POST", CREATE, nameInUse);
    render(picker());
    await startCreating();
    await submit("trip", "enter");
    await waitFor(() => expectNameInUse(createField()!, "trip"));

    fireEvent.blur(createField()!);
    fireEvent.keyDown(createField()!, { key: "Enter" });
    fireEvent.click(createButton());
    await settle();
    expect(api.count("POST", CREATE)).toBe(1);
    expectNameInUse(createField()!, "trip");
    expect(createButton()).not.toBeDisabled();

    fireEvent.change(createField()!, { target: { value: "trip 2" } });
    expectNoNameInUse(createField());
    api.on("POST", CREATE, () => json({ id: "c2", name: "trip 2", drive: "main", item_count: 0 }, 201));
    fireEvent.click(createButton());
    await waitFor(() => expect(api.count("POST", CREATE)).toBe(2));
  });

  it("SPEC-CORE-108 I9 closing the host discards the text, and the next open starts clean", async () => {
    api.on("POST", CREATE, nameInUse);
    const view = render(picker());
    await startCreating();
    await submit("trip");
    await waitFor(() => expectNameInUse(createField()!, "trip"));

    view.rerender(picker(false));
    await settle();
    view.rerender(picker(true));
    const input = createField() ?? (await startCreating());
    expect(input.value).toBe("");
    expectNoNameInUse(input);
  });
});

describe("SPEC-CORE-108 I9 the CollectionPicker create field and Escape", () => {
  it("SPEC-CORE-108 I9 Escape in the in-use state discards the text, and the next open starts clean", async () => {
    api.on("POST", CREATE, nameInUse);
    const onClose = vi.fn();
    const view = render(<CollectionPicker open drive="main" fileIds={["f1"]} onClose={onClose} />);
    await startCreating();
    await submit("trip");
    await waitFor(() => expectNameInUse(createField()!, "trip"));

    fireEvent.keyDown(createField()!, { key: "Escape" });
    await settle();
    expect(createField()?.value ?? "").not.toBe("trip");
    expectNoNameInUse();

    if (onClose.mock.calls.length > 0) {
      view.rerender(<CollectionPicker open={false} drive="main" fileIds={["f1"]} onClose={onClose} />);
      view.rerender(<CollectionPicker open drive="main" fileIds={["f1"]} onClose={onClose} />);
    }
    const input = createField() ?? (await startCreating());
    expect(input.value).toBe("");
    expectNoNameInUse(input);
    expect(api.count("POST", CREATE)).toBe(1);
  });
});

describe("SPEC-CORE-108 I10 the CollectionPicker create field in flight", () => {
  it("SPEC-CORE-108 I10 is read-only and sends one request, then shows the 409", async () => {
    const pending = deferred<Response>();
    api.on("POST", CREATE, () => pending.promise);
    render(picker());
    await startCreating();

    await submit("trip");
    await waitFor(() => expect(api.count("POST", CREATE)).toBe(1));
    expect(createField()!.readOnly).toBe(true);
    fireEvent.click(createButton());
    fireEvent.keyDown(createField()!, { key: "Enter" });
    fireEvent.blur(createField()!);
    await settle();
    expect(api.count("POST", CREATE)).toBe(1);

    await act(async () => {
      pending.resolve(nameInUse());
    });
    await waitFor(() => expectNameInUse(createField()!, "trip"));
  });

  it("SPEC-CORE-108 I10 a failure other than 409 never shows the line; a later 409 does", async () => {
    api.on("POST", CREATE, () => json({ detail: "boom" }, 500));
    render(picker());
    await startCreating();
    await submit("trip");
    await waitFor(() => expect(api.count("POST", CREATE)).toBe(1));
    await settle();
    expectNoNameInUse(createField());

    api.on("POST", CREATE, nameInUse);
    await submit("trip");
    await waitFor(() => expect(api.count("POST", CREATE)).toBe(2));
    await waitFor(() => expectNameInUse(createField()!, "trip"));
  });
});
