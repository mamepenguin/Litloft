"use client";

import { usePathname, useRouter } from "next/navigation";

export function TagList({
  tags,
  maxVisible = 2,
}: {
  tags: string[];
  maxVisible?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const visible = tags.slice(0, maxVisible);
  const remaining = tags.length - maxVisible;

  function getDriveBase(): string {
    const match = pathname.match(/^\/drive\/([^/]+)/);
    if (match) {
      return `/drive/${encodeURIComponent(decodeURIComponent(match[1]))}`;
    }
    return "/";
  }

  return (
    <span className="flex items-center gap-1">
      {visible.map((tag) => (
        <button
          key={tag}
          type="button"
          title={tag}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            router.push(`${getDriveBase()}?tag=${encodeURIComponent(tag)}`);
          }}
          className="block max-w-[12rem] cursor-pointer truncate rounded-full bg-accent-teal/15 px-2.5 py-0.5 text-xs font-medium text-accent-teal transition-colors hover:bg-accent-teal/25"
        >
          {tag}
        </button>
      ))}
      {remaining > 0 && (
        <span className="text-xs text-text-muted">+{remaining}</span>
      )}
    </span>
  );
}
