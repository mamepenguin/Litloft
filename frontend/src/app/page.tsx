import { cookies } from "next/headers";
import Link from "next/link";
import { HardDrive, Lock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { AuthStatus, Drive } from "@/types";
import { COOKIE_NAME, sanitizeNickname } from "@/lib/nickname";
import { driveHref } from "@/lib/driveViews";
import { HomeHeader } from "./HomeHeader";

async function fetchDrives(cookieHeader: string | undefined): Promise<Drive[]> {
  const headers: HeadersInit = {};
  if (cookieHeader) {
    headers["Cookie"] = cookieHeader;
  }

  try {
    const res = await fetch("http://backend:8000/api/drives", {
      cache: "no-store",
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

async function fetchAuthStatus(
  cookieHeader: string | undefined,
): Promise<AuthStatus | null> {
  const headers: HeadersInit = {};
  if (cookieHeader) {
    headers["Cookie"] = cookieHeader;
  }

  try {
    const res = await fetch("http://backend:8000/api/auth/status", {
      cache: "no-store",
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// A hand-crafted / malformed cookie must never throw.
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
  // `is_admin` is what the backend calls a viewer who may see every
  // protected drive, and such a viewer has nothing left to unlock.
  //
  // Those are not quite the same viewer: a password carrying `__admin__` but
  // not every `access_group` sees locked drives and is offered no way in.
  // Widening `is_admin` would change who reaches `/admin`.
  const showLockedEntry =
    (authStatus?.has_protected_drives ?? false) && !(authStatus?.is_admin ?? false);

  return (
    <div className="w-full flex-1 pb-6">
      <HomeHeader
        greeting={nickname ? t("greeting", { name: nickname }) : undefined}
      />

      <div className="px-4 pt-2">
        {drives.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <HardDrive size={48} className="mb-4 text-text-muted" />
            <h3 className="text-lg font-semibold text-text-primary">
              {t("empty")}
            </h3>
            <p className="mt-1 text-sm text-text-muted">
              {t("emptyDescription")}
            </p>
          </div>
        )}

        {(drives.length > 0 || showLockedEntry) && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {drives.map((drive) => (
              <Link
                key={drive.name}
                href={driveHref(drive.name, "home")}
                // `border-transparent`, not "no border": the unlock cell
                // beside it is outlined, and a 1px border grows the box.
                className="group flex items-center gap-3 rounded-2xl border border-transparent bg-bg-card p-4 shadow-card transition-colors duration-200 hover:bg-bg-elevated"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-bg-elevated">
                  <HardDrive size={24} className="text-text-muted" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-text-primary group-hover:text-accent">
                    {drive.name}
                  </div>
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

            {/* It says nothing about what is behind it: no name, no count,
                no group. A locked drive is hidden by 404 and not merely
                closed, so a card that leaked "3 drives" would undo that
                from the front page. */}
            {showLockedEntry && (
              <Link
                href="/unlock"
                className="group flex items-center gap-3 rounded-2xl border border-dashed border-bg-border p-4 transition-colors duration-200 hover:bg-bg-elevated"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-bg-elevated">
                  <Lock size={24} className="text-text-muted" />
                </div>
                <div className="flex-1 font-semibold text-text-primary group-hover:text-accent">
                  {t("unlockAccess")}
                </div>
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
