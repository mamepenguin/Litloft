import Link from "next/link";
import { Folder } from "lucide-react";
import type { Category } from "@/types";

async function fetchCategories(): Promise<Category[]> {
  const res = await fetch("http://backend:8000/api/categories", {
    cache: "no-store",
  });
  if (!res.ok) return [];
  return res.json();
}

export default async function Home() {
  const categories = await fetchCategories();

  return (
    <div className="w-full flex-1 px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">カテゴリ</h1>
      </div>

      {categories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Folder size={48} className="mb-4 text-text-muted" />
          <h2 className="text-lg font-semibold text-text-primary">
            カテゴリがありません
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            videos/ ディレクトリに動画を配置してスキャンを実行してください。
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {categories.map((cat) => (
            <Link
              key={cat.name}
              href={`/category/${encodeURIComponent(cat.name)}`}
              className="group flex items-center gap-3 rounded-xl bg-bg-card p-4 transition-all duration-200 hover:scale-[1.02] hover:bg-bg-elevated hover:shadow-lg"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/20">
                <Folder size={24} className="text-accent" />
              </div>
              <div>
                <h2 className="font-semibold text-text-primary group-hover:text-accent">
                  {cat.name}
                </h2>
                <p className="text-sm text-text-muted">{cat.count} 本の動画</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
