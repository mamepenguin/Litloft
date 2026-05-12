"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Optional override for ``<FileCard>``'s default navigation behaviour.
 *
 * Default (no provider in the tree): ``FileCard`` renders a
 * ``<Link href="/files/{id}">`` that goes through the
 * ``app/files/[id]`` Server Component, which redirects to the
 * canonical 2-pane URL (``/drive/{drive}/{folder}?file={id}``) — i.e.
 * the file's containing folder.
 *
 * When a provider is set (currently only by ``CollectionDetail``), the
 * card intercepts the click and calls ``onNavigate(fileId)`` instead.
 * The collection detail page passes ``selectFile`` so the click keeps
 * the user on the collection URL and surfaces the file through
 * ``?file=`` selection — same UX as the left-pane click.
 *
 * Folder / search / watch-history / image-gallery rendering paths do
 * not wrap their content in this provider, so their existing behaviour
 * is untouched. Spec ``2026-05-12-playlist-to-collection.md`` PR-B
 * follow-up (main-pane navigation parity with the left pane).
 */
const FileNavigationContext = createContext<((fileId: string) => void) | null>(
  null,
);

export function FileNavigationOverrideProvider({
  onNavigate,
  children,
}: {
  onNavigate: (fileId: string) => void;
  children: ReactNode;
}) {
  return (
    <FileNavigationContext.Provider value={onNavigate}>
      {children}
    </FileNavigationContext.Provider>
  );
}

export function useFileNavigationOverride(): ((fileId: string) => void) | null {
  return useContext(FileNavigationContext);
}
