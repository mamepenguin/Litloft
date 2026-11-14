/**
 * SPEC-CORE-108 step 5.4 (I9, I10): the collection page's title edit stays
 * open and read-only while the rename runs, and holds the typed name after a
 * `409`. The requests are answered at `fetch`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { CollectionDetail } from "../CollectionDetail";
import {
  createApiStub,
  deferred,
  expectNameInUse,
  expectNoNameInUse,
  json,
  nameInUse,
} from "@/__tests__/helpers/nameInUse";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/drive/main",
}));

vi.mock("@/hooks/useSelectedFile", () => ({
  useSelectedFile: () => ({ fileId: null, selectFile: vi.fn(), clearFile: vi.fn() }),
}));

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }));
vi.mock("@/components/ToastProvider", () => ({
  useToast: () => toast,
}));

vi.mock("@/components/CurrentDriveProvider", () => ({
  useSetOverrideDrive: () => vi.fn(),
}));

vi.mock("@/components/folder/TwoPaneLayout", () => ({
  TwoPaneLayout: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
}));
vi.mock("@/components/CollectionItemsPane", () => ({ CollectionItemsPane: () => null }));
vi.mock("@/components/TreeToggle", () => ({ TreeToggle: () => null }));
vi.mock("@/components/FileGrid", () => ({ FileGrid: () => null }));
vi.mock("@/components/FileList", () => ({ FileList: () => null }));

const DETAIL = /^\/api\/drives\/main\/collections\/c1$/;
const NAME = "My Collection";

let api: ReturnType<typeof createApiStub>;
/** Records a rename the stub accepted, so a later GET returns it. */
let accepted: (name: string) => void = () => {};

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

async function openTitle() {
  render(<CollectionDetail drive="main" collectionId="c1" />);
  fireEvent.click(await screen.findByRole("button", { name: NAME }));
  return screen.getByDisplayValue(NAME) as HTMLInputElement;
}

const gets = () => api.count("GET", DETAIL);
const puts = () => api.count("PUT", DETAIL);

beforeEach(() => {
  toast.error.mockClear();
  let name = NAME;
  api = createApiStub(() => json([]));
  api.on("GET", DETAIL, () =>
    json({
      id: "c1",
      name,
      description: "Hand-picked",
      drive: "main",
      items: [],
      on_home: false,
      created_at: "",
      updated_at: "",
    }),
  );
  accepted = (next) => {
    name = next;
  };
  vi.stubGlobal("fetch", api.fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-108 I9 I10 the collection page's title edit", () => {
  it("SPEC-CORE-108 I10 stays open and read-only while the rename runs, and sends it once", async () => {
    const pending = deferred<Response>();
    api.on("PUT", DETAIL, () => pending.promise);
    const input = await openTitle();

    fireEvent.change(input, { target: { value: "Trip" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(puts()).toBe(1));

    const editing = screen.getByDisplayValue("Trip") as HTMLInputElement;
    expect(editing.readOnly).toBe(true);
    fireEvent.blur(editing);
    fireEvent.keyDown(editing, { key: "Enter" });
    fireEvent.keyDown(editing, { key: "Escape" });
    await settle();
    expect(puts()).toBe(1);
    expect(screen.getByDisplayValue("Trip")).toBeInTheDocument();

    await act(async () => {
      accepted("Trip");
      pending.resolve(json({ id: "c1", name: "Trip", drive: "main", description: "Hand-picked" }));
    });
    await waitFor(() => expect(screen.queryByDisplayValue("Trip")).toBeNull());
    expect(screen.getByRole("button", { name: "Trip" })).toBeInTheDocument();
  });

  it("SPEC-CORE-108 I9 after a 409 holds the typed name, no toast, no reload; blur and unchanged Enter send nothing", async () => {
    api.on("PUT", DETAIL, nameInUse);
    const input = await openTitle();
    const loads = gets();

    fireEvent.change(input, { target: { value: "trip" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(puts()).toBe(1));
    const field = () => screen.getByDisplayValue("trip") as HTMLInputElement;
    await waitFor(() => expectNameInUse(field(), "trip"));
    expect(toast.error).not.toHaveBeenCalled();
    expect(gets()).toBe(loads);

    fireEvent.blur(field());
    fireEvent.keyDown(field(), { key: "Enter" });
    await settle();
    expect(puts()).toBe(1);
    expectNameInUse(field(), "trip");
  });

  it("SPEC-CORE-108 I9 a changed text clears the line; Escape discards and the next open starts from the name", async () => {
    api.on("PUT", DETAIL, nameInUse);
    const input = await openTitle();
    fireEvent.change(input, { target: { value: "trip" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expectNameInUse(screen.getByDisplayValue("trip") as HTMLInputElement, "trip"));

    fireEvent.change(screen.getByDisplayValue("trip"), { target: { value: "trip!" } });
    expectNoNameInUse(screen.getByDisplayValue("trip!") as HTMLInputElement);

    fireEvent.keyDown(screen.getByDisplayValue("trip!"), { key: "Escape" });
    const heading = await screen.findByRole("button", { name: NAME });
    fireEvent.click(heading);
    const reopened = screen.getByDisplayValue(NAME) as HTMLInputElement;
    expectNoNameInUse(reopened);
  });

  it("SPEC-CORE-108 I10 a failure other than 409 never shows the line; a later 409 does", async () => {
    api.on("PUT", DETAIL, () => json({ detail: "boom" }, 500));
    const input = await openTitle();
    fireEvent.change(input, { target: { value: "Elsewhere" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(puts()).toBe(1));
    await settle();
    expectNoNameInUse();

    api.on("PUT", DETAIL, nameInUse);
    let again = screen.queryByDisplayValue("Elsewhere") as HTMLInputElement | null;
    if (!again) {
      const title =
        screen.queryByRole("button", { name: NAME }) ?? screen.getByRole("button", { name: "Elsewhere" });
      fireEvent.click(title);
      again = (screen.queryByDisplayValue(NAME) ?? screen.getByDisplayValue("Elsewhere")) as HTMLInputElement;
    }
    fireEvent.change(again, { target: { value: "trip" } });
    fireEvent.keyDown(again, { key: "Enter" });
    await waitFor(() => expect(puts()).toBe(2));
    await waitFor(() => expectNameInUse(screen.getByDisplayValue("trip") as HTMLInputElement, "trip"));
  });
});
