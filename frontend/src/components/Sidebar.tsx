"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Clock, FilePlus, Files, HardDrive, Home, Star, Tag, X } from "lucide-react";

import { getDrives, getDriveTags } from "@/lib/api";
import type { Drive, Tag as TagType } from "@/types";
import { useSidebar } from "./SidebarProvider";

function useCurrentDrive(): string | null {
  const pathname = usePathname();
  const match = pathname.match(/^\/drive\/([^/]+)/);
  if (!match) return null;
  return decodeURIComponent(match[1]);
}

function SidebarNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { close, refreshKey } = useSidebar();

  const currentDrive = useCurrentDrive();
  const activeView = searchParams.get("view");
  const activeTag = searchParams.get("tag");

  const [drives, setDrives] = useState<Drive[]>([]);
  const [tags, setTags] = useState<TagType[]>([]);

  useEffect(() => {
    getDrives().then(setDrives).catch(() => setDrives([]));
  }, [refreshKey]);

  useEffect(() => {
    if (currentDrive) {
      getDriveTags(currentDrive).then(setTags).catch(() => setTags([]));
    } else {
      setTags([]);
    }
  }, [currentDrive, refreshKey]);

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    if (!currentDrive) return false;

    const driveBase = `/drive/${encodeURIComponent(currentDrive)}`;

    if (href === `${driveBase}?view=favorites`) {
      return pathname === driveBase && activeView === "favorites";
    }
    if (href === `${driveBase}?view=recent`) {
      return pathname === driveBase && activeView === "recent";
    }
    if (href === `${driveBase}?view=recent-added`) {
      return pathname === driveBase && activeView === "recent-added";
    }
    if (href === `${driveBase}?view=all`) {
      return pathname === driveBase && activeView === "all";
    }
    if (href.includes("?tag=")) {
      const hrefTag = new URL(href, "http://x").searchParams.get("tag");
      return pathname === driveBase && activeTag === hrefTag && !activeView;
    }
    if (href === driveBase) {
      return pathname === driveBase && !activeView && !activeTag;
    }
    if (href.startsWith("/drive/")) {
      return pathname === href;
    }
    return false;
  }

  const linkClass = (href: string) =>
    `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
      isActive(href)
        ? "bg-accent text-white"
        : "text-text-muted hover:bg-bg-elevated hover:text-text-primary"
    }`;

  const driveBase = currentDrive
    ? `/drive/${encodeURIComponent(currentDrive)}`
    : null;

  return (
    <nav className="flex flex-col gap-1 overflow-y-auto p-3">
      <div className="mb-2 px-3 py-2">
        <Link href="/" onClick={close} className="text-lg font-bold text-text-primary">
          Video Share
        </Link>
      </div>

      <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        Library
      </div>
      <Link href="/" onClick={close} className={linkClass("/")}>
        <Home size={16} />
        ホーム
      </Link>
      {driveBase && (
        <>
          <Link href={`${driveBase}?view=favorites`} onClick={close} className={linkClass(`${driveBase}?view=favorites`)}>
            <Star size={16} />
            お気に入り
          </Link>
          <Link href={`${driveBase}?view=recent`} onClick={close} className={linkClass(`${driveBase}?view=recent`)}>
            <Clock size={16} />
            最近再生
          </Link>
          <Link href={`${driveBase}?view=recent-added`} onClick={close} className={linkClass(`${driveBase}?view=recent-added`)}>
            <FilePlus size={16} />
            最近追加
          </Link>
          <Link href={`${driveBase}?view=all`} onClick={close} className={linkClass(`${driveBase}?view=all`)}>
            <Files size={16} />
            すべてのファイル
          </Link>
        </>
      )}

      {driveBase && tags.length > 0 && (
        <>
          <div className="mb-1 mt-4 px-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Tags
          </div>
          {tags.map((t) => (
            <Link
              key={t.name}
              href={`${driveBase}?tag=${encodeURIComponent(t.name)}`}
              onClick={close}
              className={linkClass(`${driveBase}?tag=${encodeURIComponent(t.name)}`)}
            >
              <Tag size={16} />
              <span className="flex-1 truncate">{t.name}</span>
              <span className="text-xs opacity-60">{t.count}</span>
            </Link>
          ))}
        </>
      )}

      {drives.length > 0 && (
        <>
          <div className="mb-1 mt-4 px-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Drives
          </div>
          {drives.map((drive) => {
            const href = `/drive/${encodeURIComponent(drive.name)}`;
            const isCurrentDrive = drive.name === currentDrive;
            return (
              <Link
                key={drive.name}
                href={href}
                onClick={close}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isCurrentDrive
                    ? "bg-accent/20 text-accent"
                    : "text-text-muted hover:bg-bg-elevated hover:text-text-primary"
                }`}
              >
                <HardDrive size={16} />
                <span className="flex-1 truncate">{drive.name}</span>
              </Link>
            );
          })}
        </>
      )}
    </nav>
  );
}

function SidebarContent() {
  return (
    <Suspense fallback={<div className="p-6" />}>
      <SidebarNav />
    </Suspense>
  );
}

export function Sidebar() {
  const { isOpen, toggle, close } = useSidebar();

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={close}
        />
      )}

      <aside
        className={`fixed top-0 left-0 z-40 h-dvh w-60 flex-shrink-0 border-r border-bg-border bg-bg-primary transition-transform md:static md:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col md:hidden">
          <div className="flex justify-end p-2">
            <button
              onClick={close}
              className="rounded-lg p-2 text-text-muted hover:text-text-primary"
              aria-label="閉じる"
            >
              <X size={20} />
            </button>
          </div>
          <SidebarContent />
        </div>
        <div className="hidden h-full flex-col md:flex">
          <SidebarContent />
        </div>
      </aside>
    </>
  );
}
