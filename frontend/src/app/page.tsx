import { cookies } from "next/headers";
import Link from "next/link";
import { HardDrive, Lock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { AuthStatus, Drive } from "@/types";
import { COOKIE_NAME, sanitizeNickname } from "@/lib/nickname";
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
  // "Is there still something locked?" is already answerable here.
  // `is_admin` means "can see every protected drive" (`types/index.ts`,
  // and `routers/auth.py` agrees), so a viewer who holds them all has
  // nothing left to unlock and gets no entry. No backend change.
  const showLockedEntry =
    (authStatus?.has_protected_drives ?? false) && !(authStatus?.is_admin ?? false);

  return (
    <div className="w-full flex-1 pb-6">
      {/* One heading over the one thing on the page. The wordmark used
          to sit in a bordered card with a fixed tagline under it and
          "Drives" as a second heading immediately below — three lines
          of chrome introducing a grid the reader can already see. The
          greeting stays: a nickname is a different value on different
          visits, which is what the tagline never was.

          The header itself is a client component and this page is not, so
          only the greeting string crosses — see `HomeHeader` for what
          happens when a component reference crosses instead. */}
      <HomeHeader
        greeting={nickname ? t("greeting", { name: nickname }) : undefined}
      />

      {/* `PageHeader` brings its own `px-4`; this matches it rather than
          nesting inside a second one. */}
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
                href={`/drive/${encodeURIComponent(drive.name)}`}
                // `border-transparent`, not "no border": the unlock cell
                // beside it is outlined, and a 1px border grows the box.
                // In a multi-column row the grid stretches both to the
                // taller one and it never shows, but at one column each
                // row is its own height and the two cells came out 80 and
                // 82px. Measured at 375 / 400 / 430.
                className="group flex items-center gap-3 rounded-2xl border border-transparent bg-bg-card p-4 shadow-card transition-colors duration-200 hover:bg-bg-elevated"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-bg-elevated">
                  <HardDrive size={24} className="text-text-muted" />
                </div>
                <div className="flex-1">
                  {/* Not a heading. A grid of drive names is not a set of
                      document sections, and the name survives as the
                      accessible name of the link that holds it
                      (`card-titles.test.ts`). */}
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

            {/* The way in to what is still locked, as the last cell of the
                same grid — so it is a place you go rather than a footnote
                under the page.

                It says nothing about what is behind it: no name, no count,
                no group. A locked drive is hidden by 404 and not merely
                closed (`design-decisions.md`, Access control), so a card
                that leaked "3 drives" would undo that from the front page.
                Dashed and unfilled for the same reason it carries no
                figure — it is an entrance, not a thing you own yet, and
                the accent is spent elsewhere. */}
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
