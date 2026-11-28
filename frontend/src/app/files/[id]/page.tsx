import { redirect, notFound } from "next/navigation";
import { cookies } from "next/headers";

import {
  buildCanonicalFileUrl,
  buildLegacyQueueUrl,
} from "@/lib/canonicalFileUrl";
import type { FileItem } from "@/types";

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

  const file = await fetchFile(id);
  if (!file) notFound();

  redirect(buildLegacyQueueUrl(file, id, sp) ?? buildCanonicalFileUrl(file, id, sp));
}
