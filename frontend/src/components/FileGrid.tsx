import type { FileItem } from "@/types";
import { FileCard } from "./FileCard";

export function FileGrid({
  files,
  onFavoriteToggle,
}: {
  files: FileItem[];
  onFavoriteToggle?: (file: FileItem) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 sm:gap-4">
      {files.map((file) => (
        <FileCard
          key={file.id}
          file={file}
          onFavoriteToggle={onFavoriteToggle}
        />
      ))}
    </div>
  );
}
