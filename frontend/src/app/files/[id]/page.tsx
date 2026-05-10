import { redirect, notFound } from "next/navigation";
import { cookies } from "next/headers";

import { FileDetailFullScreen } from "@/components/FileDetailFullScreen";
import { buildCanonicalFileUrl } from "@/lib/canonicalFileUrl";
import type { FileItem } from "@/types";

/**
 * PR-5 of the right-pane full-detail merger spec
 * (docs/superpowers/specs/2026-05-09-right-pane-full-detail.md, hako
 * HI8TFfXzwyPVtgBqlR6P1, §4.7).
 *
 * Two paths through this Server Component:
 *
 * 1. ``?playlist=`` / ``?folder_play=1`` is set → render the legacy
 *    fullscreen surface via FileDetailFullScreen. Playlist mode is
 *    intentionally 2-pane-exempt (§4.6) — the PlaylistPanel and the
 *    player share the same column, which the right pane can't host
 *    cleanly.
 *
 * 2. Otherwise → 307 redirect to the canonical 2-pane URL
 *    ``/drive/{drive}/{folder}?file={id}``. ``redirect()`` from
 *    ``next/navigation`` returns 307 by default (Reality Checker B2:
 *    the spec previously claimed 302; the actual status is 307,
 *    which is fine for our use case — file moves invalidate the
 *    redirect target so we don't want 308/permanent caching).
 *
 * Internal links (PropertiesPanel, RelatedFiles, MarkdownPreview wiki
 * links, MatchOverlay, etc., 16+ sites) keep using ``/files/{id}`` —
 * they land here, get redirected to the canonical URL, and end up in
 * the correct 2-pane host without any link-site changes.
 */

async function fetchFile(id: string): Promise<FileItem | null> {
  // Use the Docker-internal backend URL directly from the Server
  // Component — same pattern as src/app/page.tsx's fetchDrives.
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("access_token");

  const headers: HeadersInit = {};
  if (accessToken) {
    headers["Cookie"] = `access_token=${accessToken.value}`;
  }

  const res = await fetch(
    `http://backend:8000/api/files/${encodeURIComponent(id)}`,
    {
      cache: "no-store",
      headers,
    },
  );
  if (!res.ok) return null;
  return res.json();
}

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function FileRoute({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;

  // Playlist mode: stay on /files/{id} as the legacy fullscreen
  // surface. We still render <FileDetailContent> internally — the
  // right pane equivalence applies to the body, not the surrounding
  // chrome (PlaylistPanel + back button + overlay sidebar).
  const hasPlaylist =
    typeof sp.playlist === "string" || sp.folder_play === "1";
  if (hasPlaylist) {
    return <FileDetailFullScreen fileId={id} />;
  }

  // Resolve the file's drive + folder_path so we can hand the user
  // the canonical 2-pane URL. Failure surfaces as 404 — the legacy
  // page also failed gracefully with a loading-then-blank state, but
  // a hard 404 is a better signal here since the route's only job
  // is redirection.
  const file = await fetchFile(id);
  if (!file) notFound();

  redirect(buildCanonicalFileUrl(file, id, sp));
}
