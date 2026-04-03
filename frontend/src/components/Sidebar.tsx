"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LockOpen, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { lock as lockApi } from "@/lib/api";
import { getEnabledAddons, type AddonMeta } from "@/lib/addons";
import { useSidebar } from "./SidebarProvider";
import { useCurrentDrive, useSetOverrideDrive } from "./CurrentDriveProvider";
import { useSidebarData } from "./sidebar/useSidebarData";
import { usePlaylistManagement } from "./sidebar/usePlaylistManagement";
import { SidebarLibrarySection } from "./sidebar/SidebarLibrarySection";
import { SidebarPlaylistsSection } from "./sidebar/SidebarPlaylistsSection";
import { SidebarPinsSection } from "./sidebar/SidebarPinsSection";
import { SidebarTagsSection } from "./sidebar/SidebarTagsSection";
import { SidebarDrivesSection } from "./sidebar/SidebarDrivesSection";

function SidebarNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { close, refreshKey } = useSidebar();

  const currentDrive = useCurrentDrive();
  const setOverrideDrive = useSetOverrideDrive();
  const activeView = searchParams.get("view");
  const activeTag = searchParams.get("tag");

  const [addons, setAddons] = useState<Record<string, AddonMeta>>({});

  const { drives, tags, pins, playlistList, setPlaylistList, authStatus } =
    useSidebarData(currentDrive, refreshKey);

  useEffect(() => {
    getEnabledAddons().then(setAddons);
  }, []);

  const playlist = usePlaylistManagement({
    currentDrive,
    playlistList,
    setPlaylistList,
    close,
    router,
    setOverrideDrive,
  });

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    if (href === "/admin") return pathname === "/admin";
    if (!currentDrive) return false;

    const base = `/drive/${encodeURIComponent(currentDrive)}`;

    if (href === `${base}?view=favorites`) {
      return pathname === base && activeView === "favorites";
    }
    if (href === `${base}?view=recent`) {
      return pathname === base && activeView === "recent";
    }
    if (href === `${base}?view=recent-added`) {
      return pathname === base && activeView === "recent-added";
    }
    if (href === `${base}?view=all`) {
      return pathname === base && activeView === "all";
    }
    if (href.includes("?tag=")) {
      const hrefTag = new URL(href, "http://x").searchParams.get("tag");
      return pathname === base && activeTag === hrefTag && !activeView;
    }
    if (href === base) {
      return pathname === base && !activeView && !activeTag;
    }
    if (href.startsWith("/drive/")) {
      return pathname === decodeURIComponent(href) || pathname === href;
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
      <SidebarLibrarySection driveBase={driveBase} linkClass={linkClass} close={close} addons={addons} />

      {driveBase && (
        <SidebarPlaylistsSection driveBase={driveBase} currentDrive={currentDrive} setPlaylistList={setPlaylistList} {...playlist} />
      )}

      {driveBase && (
        <SidebarPinsSection driveBase={driveBase} pins={pins} linkClass={linkClass} close={close} />
      )}

      {driveBase && (
        <SidebarTagsSection driveBase={driveBase} tags={tags} linkClass={linkClass} close={close} />
      )}

      <SidebarDrivesSection drives={drives} currentDrive={currentDrive} close={close} />

      {authStatus?.has_protected_drives && authStatus.unlocked_groups.length > 0 && (
        <div className="mt-4 px-3">
          <button
            onClick={async () => {
              await lockApi();
              window.location.href = "/";
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
          >
            <LockOpen size={14} />
            Lock
          </button>
        </div>
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
  const { isOpen, close } = useSidebar();
  const t = useTranslations("common");

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
              aria-label={t("close")}
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
