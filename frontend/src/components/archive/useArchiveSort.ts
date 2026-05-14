"use client";

import { useState } from "react";
import type { ArchiveEntry, FileType } from "@/types";

type ArchiveSortKey = "name" | "size" | "type";
type ArchiveSortOrder = "asc" | "desc";

interface UseArchiveSortResult {
  sort: ArchiveSortKey;
  order: ArchiveSortOrder;
  typeFilter: FileType | null;
  setSort: (sort: ArchiveSortKey) => void;
  setOrder: (order: ArchiveSortOrder) => void;
  setTypeFilter: (filter: FileType | null) => void;
  applySortFilter: (entries: ArchiveEntry[]) => ArchiveEntry[];
}

function compareEntries(
  a: ArchiveEntry,
  b: ArchiveEntry,
  sort: ArchiveSortKey,
  order: ArchiveSortOrder
): number {
  let cmp = 0;
  if (sort === "name") {
    cmp = a.filename.localeCompare(b.filename);
  } else if (sort === "size") {
    const sizeA = a.is_dir ? 0 : a.file_size;
    const sizeB = b.is_dir ? 0 : b.file_size;
    cmp = sizeA - sizeB;
  } else {
    cmp = (a.file_type ?? "").localeCompare(b.file_type ?? "");
  }
  return order === "asc" ? cmp : -cmp;
}

export function useArchiveSort(): UseArchiveSortResult {
  const [sort, setSort] = useState<ArchiveSortKey>("name");
  const [order, setOrder] = useState<ArchiveSortOrder>("asc");
  const [typeFilter, setTypeFilter] = useState<FileType | null>(null);

  function applySortFilter(entries: ArchiveEntry[]): ArchiveEntry[] {
    const dirs = entries.filter((e) => e.is_dir);
    const files = entries.filter((e) => !e.is_dir);

    const filteredFiles =
      typeFilter === null
        ? files
        : files.filter((e) => e.file_type === typeFilter);

    const sortedDirs = [...dirs].sort((a, b) =>
      compareEntries(a, b, sort, order)
    );
    const sortedFiles = [...filteredFiles].sort((a, b) =>
      compareEntries(a, b, sort, order)
    );

    return [...sortedDirs, ...sortedFiles];
  }

  return { sort, order, typeFilter, setSort, setOrder, setTypeFilter, applySortFilter };
}
