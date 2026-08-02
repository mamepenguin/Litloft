/**
 * サイドバー Tags のフォルダスコープ絞り込み (2026-08-02, hako 0rX7bAY96gV4kGp3O9wZv)
 *
 * spec: docs/superpowers/specs/2026-08-02-sidebar-tags-folder-scope.md §4.4
 *
 * SidebarTagsSection 自体はサーバー側フィルタ（folder_path クエリ）を呼ばない
 * （それは useSidebarData の責務）。ここで検証するのは currentFolderPath の
 * 有無に応じてタグクリックのリンク先が変わることのみ。
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { SidebarTagsSection } from "../SidebarTagsSection";
import type { Tag as TagType } from "@/types";

vi.mock("next/link", () => ({
  default: ({ children, href, onClick, className }: {
    children: React.ReactNode;
    href: string;
    onClick?: () => void;
    className?: string;
  }) => (
    <a href={href} onClick={onClick} className={className}>
      {children}
    </a>
  ),
}));

const tags: TagType[] = [{ name: "Flutter", count: 3 }];

describe("SidebarTagsSection — folder-scoped link target", () => {
  it("links to the drive root when currentFolderPath is absent", () => {
    render(
      <SidebarTagsSection
        driveBase="/drive/main"
        drive="main"
        currentFolderPath={null}
        tags={tags}
        linkClass={() => ""}
        close={vi.fn()}
      />,
    );
    expect(screen.getByRole("link", { name: /Flutter/ })).toHaveAttribute(
      "href",
      "/drive/main?tag=Flutter",
    );
  });

  it("links to the current folder subtree when currentFolderPath is set", () => {
    render(
      <SidebarTagsSection
        driveBase="/drive/main"
        drive="main"
        currentFolderPath="dev/mobile"
        tags={tags}
        linkClass={() => ""}
        close={vi.fn()}
      />,
    );
    expect(screen.getByRole("link", { name: /Flutter/ })).toHaveAttribute(
      "href",
      "/drive/main/dev/mobile?tag=Flutter",
    );
  });

  it("encodes each folder segment when building the link", () => {
    render(
      <SidebarTagsSection
        driveBase="/drive/main"
        drive="main"
        currentFolderPath="旅行/2024"
        tags={tags}
        linkClass={() => ""}
        close={vi.fn()}
      />,
    );
    expect(screen.getByRole("link", { name: /Flutter/ })).toHaveAttribute(
      "href",
      `/drive/main/${encodeURIComponent("旅行")}/${encodeURIComponent("2024")}?tag=Flutter`,
    );
  });
});
