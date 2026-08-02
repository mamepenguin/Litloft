"use client";

import { Suspense, useCallback, useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LockOpen } from "lucide-react";
import { useShortcuts } from "@/hooks/useShortcuts";

import { lock as lockApi } from "@/lib/api";
import { useAddonSlots } from "./AddonSlotsProvider";
import { useSidebar } from "./SidebarProvider";
import { useCurrentDrive, useCurrentFolderPath, useSetOverrideDrive } from "./CurrentDriveProvider";
import { useSidebarData } from "./sidebar/useSidebarData";
import { useCollectionManagement } from "./sidebar/useCollectionManagement";
import { SidebarLibrarySection } from "./sidebar/SidebarLibrarySection";
import { SidebarCollectionsSection } from "./sidebar/SidebarCollectionsSection";
import { SidebarPinsSection } from "./sidebar/SidebarPinsSection";
import { SidebarSmartFoldersSection } from "./sidebar/SidebarSmartFoldersSection";
import { SidebarTagsSection } from "./sidebar/SidebarTagsSection";
import { SidebarDrivesSection } from "./sidebar/SidebarDrivesSection";
import { SectionDragHandle } from "./sidebar/SectionDragHandle";
import { useSidebarSectionOrder } from "./sidebar/useSidebarSectionOrder";
import { useReorderableDnD } from "./sidebar/useReorderableDnD";

/**
 * Stable IDs for the four reorderable sections (canonical order = default display order).
 * These IDs match the keys used by useSidebarSectionCollapsed to keep namespaces consistent.
 */
const REORDERABLE_SECTIONS = ["collections", "pins", "smart-folders", "tags"] as const;
type ReorderableSectionId = (typeof REORDERABLE_SECTIONS)[number];

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
  const currentFolderPath = useCurrentFolderPath();
  const setOverrideDrive = useSetOverrideDrive();
  const activeView = searchParams.get("view");
  const activeTag = searchParams.get("tag");

  const { addons } = useAddonSlots();

  const { drives, tags, pins, collectionList, setCollectionList, authStatus, driveSummary } =
    useSidebarData(currentDrive, currentFolderPath, refreshKey);

  const collection = useCollectionManagement({
    currentDrive,
    collectionList,
    setCollectionList,
    close: closeIfOverlay,
    router,
    setOverrideDrive,
  });

  const driveBase = currentDrive
    ? `/drive/${encodeURIComponent(currentDrive)}`
    : null;

  // Stable available-section list. Only include sections that will actually
  // render (mirrors the conditional rendering below). useMemo with a stable
  // reference avoids re-creating the array on every render, which would
  // disturb the identity check inside useSidebarSectionOrder.
  const availableSections = useMemo<readonly ReorderableSectionId[]>(() => {
    const ids: ReorderableSectionId[] = [];
    if (driveBase) ids.push("collections");
    if (driveBase) ids.push("pins");
    if (currentDrive) ids.push("smart-folders");
    if (driveBase) ids.push("tags");
    return ids;
  // driveBase / currentDrive change only when the drive changes, so this
  // memo is very stable in practice.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!driveBase, !!currentDrive]);

  const { order, setOrder } = useSidebarSectionOrder(availableSections);
  const dnd = useReorderableDnD({
    kind: "sidebar-section",
    ids: order,
    onReorder: setOrder,
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
      const url = new URL(href, "http://x");
      const hrefTag = url.searchParams.get("tag");
      const hrefPath = decodeURIComponent(url.pathname);
      return pathname === hrefPath && activeTag === hrefTag && !activeView;
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
        ? "bg-bg-elevated text-text-primary font-medium"
        : "text-text-muted hover:bg-bg-elevated hover:text-text-primary"
    }`;

  return (
    <nav className="scrollbar-hover flex h-full flex-col gap-1 overflow-y-auto p-3">
      {/* Library section: fixed at top, never reordered */}
      <SidebarLibrarySection driveBase={driveBase} currentDrive={currentDrive} linkClass={linkClass} close={closeIfOverlay} addons={addons} driveSummary={driveSummary} isAdmin={authStatus?.is_admin === true} />

      {/* Reorderable sections */}
      {order.map((id) => {
        const dropIndicator = dnd.dropTarget?.id === id ? (
          <div
            className="pointer-events-none absolute inset-x-2 h-0.5 bg-accent z-10"
            style={{ [dnd.dropTarget.position === "before" ? "top" : "bottom"]: 0 }}
          />
        ) : null;

        const handle = (
          <SectionDragHandle {...dnd.getHandleProps(id)} />
        );

        if (id === "collections" && driveBase) {
          return (
            <div key={id} className="relative" {...dnd.getRowProps(id)}>
              {dropIndicator}
              <SidebarCollectionsSection
                driveBase={driveBase}
                currentDrive={currentDrive}
                setCollectionList={setCollectionList}
                dragHandle={handle}
                {...collection}
              />
            </div>
          );
        }

        if (id === "pins" && driveBase) {
          return (
            <div key={id} className="relative" {...dnd.getRowProps(id)}>
              {dropIndicator}
              <SidebarPinsSection
                driveBase={driveBase}
                drive={currentDrive}
                pins={pins}
                linkClass={linkClass}
                close={closeIfOverlay}
                dragHandle={handle}
              />
            </div>
          );
        }

        if (id === "smart-folders" && currentDrive) {
          return (
            <div key={id} className="relative" {...dnd.getRowProps(id)}>
              {dropIndicator}
              <SidebarSmartFoldersSection
                drive={currentDrive}
                close={closeIfOverlay}
                dragHandle={handle}
              />
            </div>
          );
        }

        if (id === "tags" && driveBase) {
          return (
            <div key={id} className="relative" {...dnd.getRowProps(id)}>
              {dropIndicator}
              <SidebarTagsSection
                driveBase={driveBase}
                drive={currentDrive}
                currentFolderPath={currentFolderPath}
                tags={tags}
                linkClass={linkClass}
                close={closeIfOverlay}
                dragHandle={handle}
              />
            </div>
          );
        }

        return null;
      })}

      {/* Drives + Lock: fixed at bottom, never reordered */}
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

function SidebarShortcuts() {
  const { isOpen, isOverlay, close } = useSidebar();
  const isOverlayOpen = isOverlay && isOpen;

  useShortcuts(
    "sidebar-overlay",
    "",
    [{ key: "escape", label: "Close", handler: close, hidden: true }],
    isOverlayOpen,
  );

  return null;
}

export function Sidebar() {
  const { isOpen, isOverlay, close } = useSidebar();

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
      <SidebarShortcuts />

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
