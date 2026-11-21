/**
 * A shelf holds more items than it draws: a removal closes the gap and the
 * next held item comes into view, and a drawn count drops with each item.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createPortal } from "react-dom";
import { NextIntlClientProvider } from "next-intl";

import { ClipboardProvider } from "@/components/ClipboardProvider";
import { ToastProvider } from "@/components/ToastProvider";
import { ShelfBlock } from "@/components/appshell/ShelfBlock";
import {
  CardFileMenuProvider,
  useCardFileMenu,
} from "@/components/appshell/CardFileMenu";
import { ReadingCard } from "@/components/readingapp/ReadingCard";
import { VideoCard } from "@/components/videoapp/VideoCard";
import enMessages from "@/messages-core/en.json";
import type { ShelfItem } from "@/lib/api";
import type { ReactNode } from "react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/lib/cardGrid", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cardGrid")>()),
  useCardColumns: () => ({ ref: () => {}, columns: 2 }),
}));

const deleteFile = vi.fn();
const getShelves = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  deleteFile: (...args: unknown[]) => deleteFile(...args),
  getShelves: (...args: unknown[]) => getShelves(...args),
}));

vi.mock("@/components/ConfirmDialog", () => ({
  ConfirmDialog: ({ open, onConfirm }: { open: boolean; onConfirm: () => unknown }) =>
    open ? createPortal(<button onClick={() => void onConfirm()}>submit-trash</button>, document.body) : null,
}));

vi.mock("@/components/CollectionPicker", () => ({ CollectionPicker: () => null }));

function shelfItem(id: string, kind: "video" | "document"): ShelfItem {
  return {
    id,
    filename: kind === "video" ? `${id}.mp4` : `${id}.pdf`,
    title: `Vid ${id}`,
    description: "",
    drive: "d",
    folder_path: "Shelf",
    file_type: kind,
    mime_type: kind === "video" ? "video/mp4" : "application/pdf",
    thumbnail_url: "",
    has_thumbnail: true,
    file_size: 1,
    duration: kind === "video" ? 120 : null,
    image_width: null,
    image_height: null,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier: "verified",
    trust_reviewed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    modified_at: null,
  };
}

const ITEMS = ["a0", "a1", "a2", "a3", "a4"].map((id) => shelfItem(id, "video"));

function Host({ kind }: { kind: "video" | "document" }) {
  const cards = useCardFileMenu({ scope: "shelf", hasProfile: true });
  const listKey = "group";
  const items = cards.filter(listKey, ITEMS);
  const count = ITEMS.length - cards.removedCount(listKey, ITEMS);
  return (
    <CardFileMenuProvider value={cards.context}>
      <ShelfBlock
        title="Shelf"
        count={String(count)}
        view={{ status: "loaded", items }}
        onRetry={() => {}}
        book={kind === "document"}
        renderItem={(item) =>
          kind === "video" ? (
            <VideoCard item={item} fileMenu={{ listKey }} />
          ) : (
            <ReadingCard item={item} drive="d" fileMenu={{ listKey }} />
          )
        }
      />
      {cards.menu}
    </CardFileMenuProvider>
  );
}

async function trash(id: string) {
  const text = screen.getByText(`Vid ${id}`);
  await act(async () => {
    fireEvent.contextMenu((text.closest("a") as HTMLElement | null) ?? text);
  });
  const row = await screen.findByRole("menuitem", { name: "Move to Trash" });
  await act(async () => {
    fireEvent.click(row);
  });
  const button = await screen.findByText("submit-trash");
  await act(async () => {
    fireEvent.click(button);
  });
}

const drawn = () => screen.queryAllByText(/^Vid a\d+$/).map((el) => el.textContent);

beforeEach(() => {
  deleteFile.mockReset().mockResolvedValue(undefined);
  getShelves.mockReset().mockResolvedValue({ by: "all", total_shelves: 1, base: "", shelves: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mount(kind: "video" | "document") {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ToastProvider>
        <ClipboardProvider>
          <Host kind={kind} />
        </ClipboardProvider>
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("I3 a held but undrawn shelf item", () => {
  it("comes into view when a drawn card is trashed", async () => {
    mount("video");
    expect(drawn()).toEqual(["Vid a0", "Vid a1", "Vid a2", "Vid a3"]);

    await trash("a1");

    expect(drawn()).toEqual(["Vid a0", "Vid a2", "Vid a3", "Vid a4"]);
  });

  it("drops the Reading shelf's drawn count by one", async () => {
    mount("document");
    expect(screen.getByText("5")).toBeInTheDocument();

    await trash("a1");

    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.queryByText("5")).toBeNull();
  });
});
