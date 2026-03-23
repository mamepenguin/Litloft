"use client";

import { useRouter } from "next/navigation";

export function TagList({
  tags,
  maxVisible = 2,
}: {
  tags: string[];
  maxVisible?: number;
}) {
  const router = useRouter();
  const visible = tags.slice(0, maxVisible);
  const remaining = tags.length - maxVisible;

  return (
    <span className="flex items-center gap-1">
      {visible.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            router.push(`/category/all?tag=${encodeURIComponent(tag)}`);
          }}
          className="cursor-pointer rounded-full bg-bg-elevated px-2 py-0.5 text-[10px] text-text-muted transition-colors hover:bg-accent/20 hover:text-accent"
        >
          {tag}
        </button>
      ))}
      {remaining > 0 && (
        <span className="text-[10px] text-text-muted">+{remaining}</span>
      )}
    </span>
  );
}
