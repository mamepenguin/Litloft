import Link from "next/link";
import type { Category } from "@/types";
import { Folder } from "lucide-react";

export function CategoryNav({
  categories,
  activeCategory,
}: {
  categories: Category[];
  activeCategory?: string;
}) {
  return (
    <nav className="flex flex-wrap gap-2">
      <Link
        href="/"
        className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors ${
          !activeCategory
            ? "bg-accent text-white"
            : "bg-bg-card text-text-muted hover:text-text-primary"
        }`}
      >
        すべて
      </Link>
      {categories.map((cat) => (
        <Link
          key={cat.name}
          href={`/category/${encodeURIComponent(cat.name)}`}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors ${
            activeCategory === cat.name
              ? "bg-accent text-white"
              : "bg-bg-card text-text-muted hover:text-text-primary"
          }`}
        >
          <Folder size={14} />
          {cat.name}
          <span className="ml-1 text-xs opacity-60">{cat.count}</span>
        </Link>
      ))}
    </nav>
  );
}
