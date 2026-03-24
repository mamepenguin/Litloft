import { cookies } from "next/headers";
import Link from "next/link";
import { HardDrive, Lock } from "lucide-react";
import type { Drive } from "@/types";

async function fetchDrives(): Promise<Drive[]> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("access_token");

  const headers: HeadersInit = {};
  if (accessToken) {
    headers["Cookie"] = `access_token=${accessToken.value}`;
  }

  const res = await fetch("http://backend:8000/api/drives", {
    cache: "no-store",
    headers,
  });
  if (!res.ok) return [];
  return res.json();
}

export default async function Home() {
  const drives = await fetchDrives();

  return (
    <div className="w-full flex-1 px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">ドライブ</h1>
      </div>

      {drives.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <HardDrive size={48} className="mb-4 text-text-muted" />
          <h2 className="text-lg font-semibold text-text-primary">
            ドライブがありません
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            drives.json を設定してドライブを追加してください。
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {drives.map((drive) => (
            <Link
              key={drive.name}
              href={`/drive/${encodeURIComponent(drive.name)}`}
              className="group flex items-center gap-3 rounded-xl bg-bg-card p-4 transition-all duration-200 hover:scale-[1.02] hover:bg-bg-elevated hover:shadow-lg"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/20">
                <HardDrive size={24} className="text-accent" />
              </div>
              <div className="flex-1">
                <h2 className="font-semibold text-text-primary group-hover:text-accent">
                  {drive.name}
                </h2>
              </div>
              {drive.protected && (
                <Lock size={14} className="text-text-muted" />
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
