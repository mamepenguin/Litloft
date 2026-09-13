import { redirect, notFound } from "next/navigation";
import { cookies } from "next/headers";

import { FileDetailFullScreen } from "@/components/FileDetailFullScreen";
import { buildCanonicalFileUrl } from "@/lib/canonicalFileUrl";
import type { FileItem } from "@/types";

/**
 * Collection mode is 2-pane-exempt: the CollectionPanel and the player share
 * the same column, which the right pane can't host cleanly. The redirect is
 * 307, not 308: file moves invalidate the redirect target.
 */

async function fetchFile(id: string): Promise<FileItem | null> {
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

  const hasCollection =
    typeof sp.collection === "string" ||
    typeof sp.playlist === "string" ||
    sp.folder_play === "1";
  if (hasCollection) {
    return <FileDetailFullScreen fileId={id} />;
  }

  const file = await fetchFile(id);
  if (!file) notFound();

  redirect(buildCanonicalFileUrl(file, id, sp));
}
