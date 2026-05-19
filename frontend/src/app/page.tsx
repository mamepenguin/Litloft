import { cookies } from "next/headers";
import Link from "next/link";
import { HardDrive, KeyRound, Lock, Warehouse } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { AuthStatus, Drive } from "@/types";
import { COOKIE_NAME, sanitizeNickname } from "@/lib/nickname";

async function fetchDrives(cookieHeader: string | undefined): Promise<Drive[]> {
  const headers: HeadersInit = {};
  if (cookieHeader) {
    headers["Cookie"] = cookieHeader;
  }

  const res = await fetch("http://backend:8000/api/drives", {
    cache: "no-store",
    headers,
  });
  if (!res.ok) return [];
  return res.json();
}

async function fetchAuthStatus(
  cookieHeader: string | undefined,
): Promise<AuthStatus | null> {
  const headers: HeadersInit = {};
  if (cookieHeader) {
    headers["Cookie"] = cookieHeader;
  }

  const res = await fetch("http://backend:8000/api/auth/status", {
    cache: "no-store",
    headers,
  });
  if (!res.ok) return null;
  return res.json();
}

// The lit_viewer cookie holds a raw, URL-encoded nickname (personal
// identity — orthogonal to the access_token JWT that gates drives, per
// design-decisions.md). Decode + sanitize on the server so the greeting
// is part of the SSR output (no client island, no layout shift). A
// hand-crafted / malformed cookie must never throw.
function readNickname(raw: string | undefined): string | null {
  if (!raw) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return sanitizeNickname(decoded);
}

export default async function Home() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("access_token");
  const cookieHeader = accessToken
    ? `access_token=${accessToken.value}`
    : undefined;
  const [drives, authStatus] = await Promise.all([
    fetchDrives(cookieHeader),
    fetchAuthStatus(cookieHeader),
  ]);
  const t = await getTranslations("drive");
  const nickname = readNickname(cookieStore.get(COOKIE_NAME)?.value);
  const showUnlockAction = authStatus?.has_protected_drives ?? false;

  return (
    <div className="w-full flex-1 px-4 py-6">
      {/* Zone 1: welcome band — subtle, utilitarian. Same warm-card
          jig as the first-run WelcomeStep so the very first screen
          after GUI-first setup is visually continuous. */}
      <div className="mb-6 rounded-2xl border border-bg-border bg-bg-card p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <Warehouse size={28} className="text-accent-cta" />
          <h1 className="text-2xl font-bold text-text-primary sm:text-3xl">
            Litloft
          </h1>
        </div>
        <p className="mt-3 text-base text-text-muted">{t("tagline")}</p>
        {nickname && (
          <p className="mt-1 text-sm text-text-muted">
            {t("greeting", { name: nickname })}
          </p>
        )}
      </div>

      {/* Zone 2: drives */}
      <h2 className="mb-3 text-lg font-semibold text-text-primary">
        {t("title")}
      </h2>

      {drives.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <HardDrive size={48} className="mb-4 text-text-muted" />
          <h3 className="text-lg font-semibold text-text-primary">
            {t("empty")}
          </h3>
          <p className="mt-1 text-sm text-text-muted">
            {t("emptyDescription")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {drives.map((drive) => (
            <Link
              key={drive.name}
              href={`/drive/${encodeURIComponent(drive.name)}`}
              className="group flex items-center gap-3 rounded-2xl bg-bg-card p-4 shadow-card transition-colors duration-200 hover:bg-bg-elevated"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-bg-elevated">
                <HardDrive size={24} className="text-text-muted" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-text-primary group-hover:text-accent">
                  {drive.name}
                </h3>
                <p className="mt-0.5 text-sm text-text-muted">
                  {drive.file_count > 0
                    ? t("fileCount", { count: drive.file_count })
                    : t("emptyDrive")}
                </p>
              </div>
              {drive.protected && (
                <Lock size={14} className="text-text-muted" aria-hidden />
              )}
            </Link>
          ))}
        </div>
      )}
      {showUnlockAction && (
        <div className="mt-5 flex justify-end">
          <Link
            href="/unlock"
            className="inline-flex items-center gap-1.5 text-xs text-text-muted transition-colors hover:text-accent"
          >
            <KeyRound size={13} aria-hidden />
            {t("unlockAccess")}
          </Link>
        </div>
      )}
    </div>
  );
}
