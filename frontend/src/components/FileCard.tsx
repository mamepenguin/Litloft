import Link from "next/link";
import type { FileItem } from "@/types";
import { formatDuration, formatFileSize, formatRelativeDate } from "@/lib/format";
import { getThumbnailUrl } from "@/lib/api";
import { FavoriteButton } from "./FavoriteButton";
import { TagList } from "./TagList";
import { FileTypeIcon } from "./FileTypeIcon";

export function FileCard({
  file,
  onFavoriteToggle,
  onContextMenu,
  selectable,
  selected,
  onSelect,
}: {
  file: FileItem;
  onFavoriteToggle?: (file: FileItem) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (id: number) => void;
}) {
  const hasThumbnail = file.file_type === "video" || file.file_type === "image";

  const Wrapper = selectable ? "div" : Link;
  const wrapperProps = selectable
    ? {
        onClick: () => onSelect?.(file.id),
        role: "button" as const,
        tabIndex: 0,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.(file.id); }
        },
      }
    : { href: `/files/${file.id}` };

  return (
    <div className="relative">
      {selectable && (
        <div
          className="absolute top-2 left-2 z-10 opacity-100 transition-opacity"
        >
          <div
            className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-colors pointer-events-none ${
              selected
                ? "border-accent bg-accent text-white"
                : "border-text-muted/50 bg-black/40"
            }`}
            aria-hidden
          >
            {selected && (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        </div>
      )}
      <Wrapper
        {...wrapperProps as any}
        className={`group block rounded-xl bg-bg-card overflow-hidden transition-transform duration-200 ease-out hover:scale-[1.02] hover:shadow-lg ${
          selectable ? "cursor-pointer select-none" : ""
        } ${selected ? "ring-2 ring-accent" : ""}`}
        onContextMenu={selectable ? undefined : onContextMenu}
      >
        <div className="relative aspect-video bg-bg-elevated">
          {hasThumbnail ? (
            <img
              src={getThumbnailUrl(file.id)}
              alt={file.title}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <FileTypeIcon fileType={file.file_type} size={48} className="text-text-muted" />
            </div>
          )}
          {(file.file_type === "video" || file.file_type === "audio") && file.duration != null && (
            <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white">
              {formatDuration(file.duration)}
            </span>
          )}
          {onFavoriteToggle && (
            <div className={`absolute top-2 right-2 ${file.is_favorite ? "opacity-100" : "opacity-0 group-hover:opacity-100"} transition-opacity`}>
              <FavoriteButton
                fileId={file.id}
                isFavorite={file.is_favorite}
                onToggle={onFavoriteToggle}
              />
            </div>
          )}
        </div>
        <div className="p-3">
          <h3 className="line-clamp-2 text-sm font-semibold text-text-primary group-hover:text-accent">
            {file.title}
          </h3>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-text-muted">
            <span className="tabular-nums">{formatFileSize(file.file_size)}</span>
            <span className="opacity-40">·</span>
            <span className="tabular-nums">{formatRelativeDate(file.updated_at)}</span>
            {file.tags.length > 0 && (
              <>
                <span className="opacity-40">·</span>
                <TagList tags={file.tags} maxVisible={2} />
              </>
            )}
          </div>
        </div>
      </Wrapper>
    </div>
  );
}
