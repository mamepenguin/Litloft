"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Clock, FilePlus, Files, Folder, HardDrive, Home, ListMusic, Lock, LockOpen, Pencil, Plus, Star, Tag, Trash2, Warehouse, X } from "lucide-react";

import { getDrives, getDriveTags, getPins, getPlaylists, getPlaylist, createPlaylist, updatePlaylist, deletePlaylist, getAuthStatus, lock as lockApi } from "@/lib/api";
import type { AuthStatus, Drive, PinnedFolder, PlaylistSummary, Tag as TagType } from "@/types";
import { useSidebar } from "./SidebarProvider";
import { useCurrentDrive } from "./CurrentDriveProvider";

function SidebarNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { close, refreshKey } = useSidebar();

  const currentDrive = useCurrentDrive();
  const activeView = searchParams.get("view");
  const activeTag = searchParams.get("tag");

  const [drives, setDrives] = useState<Drive[]>([]);
  const [tags, setTags] = useState<TagType[]>([]);
  const [pins, setPins] = useState<PinnedFolder[]>([]);
  const [playlistList, setPlaylistList] = useState<PlaylistSummary[]>([]);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);

  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const createInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getDrives().then(setDrives).catch(() => setDrives([]));
    getAuthStatus().then(setAuthStatus).catch(() => setAuthStatus(null));
  }, [refreshKey]);

  useEffect(() => {
    if (currentDrive) {
      getDriveTags(currentDrive).then(setTags).catch(() => setTags([]));
      getPins(currentDrive).then(setPins).catch(() => setPins([]));
      getPlaylists(currentDrive).then(setPlaylistList).catch(() => setPlaylistList([]));
    } else {
      setTags([]);
      setPins([]);
      setPlaylistList([]);
    }
  }, [currentDrive, refreshKey]);

  useEffect(() => {
    if (creatingPlaylist && createInputRef.current) {
      createInputRef.current.focus();
    }
  }, [creatingPlaylist]);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  useEffect(() => {
    if (!contextMenu) return;
    function handleClick() { setContextMenu(null); }
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [contextMenu]);

  const handleCreatePlaylist = useCallback(async () => {
    if (!currentDrive || !newPlaylistName.trim()) {
      setCreatingPlaylist(false);
      setNewPlaylistName("");
      return;
    }
    try {
      await createPlaylist(currentDrive, newPlaylistName.trim());
      const updated = await getPlaylists(currentDrive);
      setPlaylistList(updated);
    } catch {
      // name conflict or other error
    }
    setCreatingPlaylist(false);
    setNewPlaylistName("");
  }, [currentDrive, newPlaylistName]);

  const handleRenamePlaylist = useCallback(async () => {
    if (!currentDrive || !renamingId || !renameValue.trim()) {
      setRenamingId(null);
      setRenameValue("");
      return;
    }
    try {
      await updatePlaylist(currentDrive, renamingId, renameValue.trim());
      const updated = await getPlaylists(currentDrive);
      setPlaylistList(updated);
    } catch {
      // name conflict or other error
    }
    setRenamingId(null);
    setRenameValue("");
  }, [currentDrive, renamingId, renameValue]);

  const handleDeletePlaylist = useCallback(async (id: string) => {
    if (!currentDrive) return;
    try {
      await deletePlaylist(currentDrive, id);
      const updated = await getPlaylists(currentDrive);
      setPlaylistList(updated);
    } catch {
      // error
    }
    setContextMenu(null);
  }, [currentDrive]);

  const handlePlaylistClick = useCallback(async (pl: PlaylistSummary) => {
    if (!currentDrive || pl.item_count === 0) return;
    try {
      const detail = await getPlaylist(currentDrive, pl.id);
      if (detail.items.length > 0) {
        const firstFileId = detail.items[0].file.id;
        close();
        router.push(`/files/${firstFileId}?playlist=${pl.id}`);
      }
    } catch {
      // error
    }
  }, [currentDrive, close, router]);

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
      <div className="mb-2 px-3 py-2">
        <Link href="/" onClick={close} className="flex items-center gap-2 text-lg font-bold text-text-primary">
          <Warehouse size={20} className="text-accent-cta" />
          HomeVault
        </Link>
      </div>

      <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        Library
      </div>
      <Link href={driveBase ?? "/"} onClick={close} className={linkClass(driveBase ?? "/")}>
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

      {driveBase && (
        <>
          <div className="mb-1 mt-4 flex items-center justify-between px-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Playlists
            </span>
            <button
              onClick={() => {
                setCreatingPlaylist(true);
                setNewPlaylistName("");
              }}
              className="text-text-muted hover:text-text-primary"
              aria-label="プレイリスト作成"
            >
              <Plus size={14} />
            </button>
          </div>

          {creatingPlaylist && (
            <div className="px-3">
              <input
                ref={createInputRef}
                type="text"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreatePlaylist();
                  if (e.key === "Escape") {
                    setCreatingPlaylist(false);
                    setNewPlaylistName("");
                  }
                }}
                onBlur={handleCreatePlaylist}
                placeholder="プレイリスト名..."
                className="w-full rounded-lg bg-bg-card px-2 py-1.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          )}

          {playlistList.map((pl) => (
            <div key={pl.id} className="relative">
              {renamingId === pl.id ? (
                <div className="px-3">
                  <input
                    ref={renameInputRef}
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenamePlaylist();
                      if (e.key === "Escape") {
                        setRenamingId(null);
                        setRenameValue("");
                      }
                    }}
                    onBlur={handleRenamePlaylist}
                    className="w-full rounded-lg bg-bg-card px-2 py-1.5 text-sm text-text-primary outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              ) : (
                <button
                  onClick={() => handlePlaylistClick(pl)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ id: pl.id, x: e.clientX, y: e.clientY });
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                    pl.item_count === 0
                      ? "text-text-muted/50 cursor-default"
                      : "text-text-muted hover:bg-bg-elevated hover:text-text-primary cursor-pointer"
                  }`}
                >
                  <ListMusic size={16} />
                  <span className="flex-1 truncate text-left">{pl.name}</span>
                  <span className="text-xs opacity-60">{pl.item_count}</span>
                </button>
              )}

              {contextMenu?.id === pl.id && (
                <div
                  className="fixed z-50 min-w-[140px] rounded-lg border border-bg-border bg-bg-primary py-1 shadow-lg"
                  style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                  <button
                    onClick={() => {
                      setRenamingId(pl.id);
                      setRenameValue(pl.name);
                      setContextMenu(null);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-text-muted hover:bg-bg-elevated hover:text-text-primary"
                  >
                    <Pencil size={14} />
                    リネーム
                  </button>
                  <button
                    onClick={() => handleDeletePlaylist(pl.id)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red-400 hover:bg-red-400/10"
                  >
                    <Trash2 size={14} />
                    削除
                  </button>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {driveBase && pins.length > 0 && (
        <>
          <div className="mb-1 mt-4 px-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Pins
          </div>
          {pins.map((pin) => {
            const pinHref = `${driveBase}/${pin.path.split("/").map(encodeURIComponent).join("/")}`;
            const pinName = pin.path.split("/").pop() ?? pin.path;
            return (
              <Link
                key={pin.path}
                href={pinHref}
                onClick={close}
                className={linkClass(pinHref)}
              >
                <Folder size={16} />
                <span className="flex-1 truncate">{pinName}</span>
              </Link>
            );
          })}
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
                {drive.protected && <Lock size={12} className="opacity-40" />}
              </Link>
            );
          })}
        </>
      )}

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
