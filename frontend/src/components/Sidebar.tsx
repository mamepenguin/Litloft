"use client";

import { Suspense, useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LockOpen } from "lucide-react";

import { lock as lockApi } from "@/lib/api";
import { useAddonSlots } from "./AddonSlotsProvider";
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
  const { isOverlay, close, refreshKey } = useSidebar();
  // In inline mode the sidebar stays open across navigations.
  // In overlay mode each nav click dismisses the overlay.
  const closeIfOverlay = useCallback(() => {
    if (isOverlay) close();
  }, [isOverlay, close]);

  const currentDrive = useCurrentDrive();
  const setOverrideDrive = useSetOverrideDrive();
  const activeView = searchParams.get("view");
  const activeTag = searchParams.get("tag");

  const { addons } = useAddonSlots();

  const { drives, tags, pins, playlistList, setPlaylistList, authStatus, driveSummary } =
    useSidebarData(currentDrive, refreshKey);

  const playlist = usePlaylistManagement({
    currentDrive,
    playlistList,
    setPlaylistList,
    close: closeIfOverlay,
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
    `flex items-center gap-2.5 rounded-2xl px-3 py-2 text-sm transition-colors ${
      isActive(href)
        ? "bg-accent text-white font-medium"
        : "text-text-muted hover:bg-bg-elevated hover:text-text-primary"
    }`;

  const driveBase = currentDrive
    ? `/drive/${encodeURIComponent(currentDrive)}`
    : null;

  return (
    <nav className="flex flex-col gap-1 overflow-y-auto p-3">
      <SidebarLibrarySection driveBase={driveBase} currentDrive={currentDrive} linkClass={linkClass} close={closeIfOverlay} addons={addons} driveSummary={driveSummary} />

      {driveBase && (
        <SidebarPlaylistsSection driveBase={driveBase} currentDrive={currentDrive} setPlaylistList={setPlaylistList} {...playlist} />
      )}

      {driveBase && (
        <SidebarPinsSection driveBase={driveBase} pins={pins} linkClass={linkClass} close={closeIfOverlay} />
      )}

      {driveBase && (
        <SidebarTagsSection driveBase={driveBase} tags={tags} linkClass={linkClass} close={closeIfOverlay} />
      )}

      <SidebarDrivesSection drives={drives} currentDrive={currentDrive} close={closeIfOverlay} />

      {authStatus?.has_protected_drives && authStatus.unlocked_groups.length > 0 && (
        <div className="mt-4 px-3">
          <button
            onClick={async () => {
              await lockApi();
              window.location.href = "/";
            }}
            className="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-xs text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
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
  const { isOpen, isOverlay, close } = useSidebar();

  useEffect(() => {
    if (!(isOverlay && isOpen)) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOverlay, isOpen, close]);

  useEffect(() => {
    if (!(isOverlay && isOpen)) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOverlay, isOpen]);

  return (
    <>
      {isOpen && isOverlay && (
        <div
          className="fixed inset-0 z-30 bg-black/50"
          onClick={close}
          aria-hidden
        />
      )}

      <aside
        className={`fixed top-0 left-0 z-40 h-dvh w-60 flex-shrink-0 border-r border-bg-border bg-bg-sidebar transition-transform duration-150 ease-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={!isOpen}
        aria-modal={isOverlay && isOpen ? true : undefined}
        role={isOverlay ? "dialog" : undefined}
      >
        <SidebarContent />
      </aside>
    </>
  );
}
