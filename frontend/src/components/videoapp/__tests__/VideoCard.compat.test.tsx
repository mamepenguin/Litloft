/**
 * `VideoCard` without the file-menu opt-in keeps the DOM it had, and a caller
 * that wraps it in its own menu still gets exactly one.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";

import { ClipboardProvider } from "@/components/ClipboardProvider";
import { ToastProvider } from "@/components/ToastProvider";
import { VideoCard } from "../VideoCard";
import ChannelVideos from "@/addons/media_import/ChannelVideos";
import buildEnMessages from "@/messages/en.json";
import type { ShelfItem } from "@/lib/api";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/d/addons/media_import",
  useParams: () => ({ name: "d" }),
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/components/ClipboardProvider", () => ({
  ClipboardProvider: ({ children }: { children: ReactNode }) => children,
  useClipboard: () => ({
    clipboard: null,
    copy: vi.fn(),
    cut: vi.fn(),
    paste: vi.fn(),
    clear: vi.fn(),
    isCut: () => false,
  }),
}));

const getShelves = vi.fn();
const listChannelVideos = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getShelves: (...args: unknown[]) => getShelves(...args),
  getSmartFolders: vi.fn().mockResolvedValue([]),
  getCollections: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/addons/media_import/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/addons/media_import/api")>()),
  listChannelVideos: (...args: unknown[]) => listChannelVideos(...args),
}));

function video(id: string, name: string): ShelfItem {
  return {
    id,
    filename: `${id}.mp4`,
    title: name,
    description: "",
    drive: "d",
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: "",
    has_thumbnail: true,
    file_size: 1,
    duration: 120,
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

function tree(node: Element): unknown {
  return {
    tag: node.tagName.toLowerCase(),
    class: node.getAttribute("class") ?? "",
    children: [...node.children].map(tree),
  };
}

beforeEach(() => {
  localStorage.clear();
  getShelves.mockReset();
  listChannelVideos.mockReset();
});

describe("I8 VideoCard without the opt-in", () => {
  it("renders the same element tree and classes as before", () => {
    const { container } = render(
      <VideoCard item={video("v1", "A card")} byline="byline" />,
    );

    expect(tree(container.firstElementChild!)).toEqual({
      tag: "a",
      class:
        "group block min-w-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
      children: [
        {
          tag: "div",
          class: "relative aspect-video overflow-hidden rounded-2xl bg-bg-elevated",
          children: [
            {
              tag: "img",
              class: "h-full w-full object-cover",
              children: [],
            },
            {
              tag: "span",
              class:
                "absolute bottom-2 right-2 rounded-lg bg-black/70 px-1.5 py-0.5 text-xs font-medium tabular-nums text-white",
              children: [],
            },
          ],
        },
        {
          tag: "span",
          class: "mt-3 line-clamp-2 text-base/[1.375rem] font-medium text-text-primary",
          children: [],
        },
        {
          tag: "span",
          class: "mt-1 block truncate text-sm text-text-muted",
          children: [],
        },
      ],
    });
  });

  it("wrapped by the media_import channel view, a right-click opens exactly one menu", async () => {
    listChannelVideos.mockResolvedValue([{ file_id: "v1", published_at: null }]);
    getShelves.mockResolvedValue({
      by: "all",
      total_shelves: 1,
      base: "",
      shelves: [{ key: "all", label: "", count: 1, items: [video("v1", "Channel one")] }],
    });

    render(
      <NextIntlClientProvider locale="en" messages={buildEnMessages}>
        <ToastProvider>
          <ClipboardProvider>
            <ChannelVideos drive="d" provider="youtube" channel="Chan" />
          </ClipboardProvider>
        </ToastProvider>
      </NextIntlClientProvider>,
    );
    const title = await screen.findByText("Channel one");

    fireEvent.contextMenu(title);
    await waitFor(() => expect(screen.getAllByRole("menuitem").length).toBeGreaterThan(0));

    expect(screen.getAllByRole("menu")).toHaveLength(1);
  });
});
