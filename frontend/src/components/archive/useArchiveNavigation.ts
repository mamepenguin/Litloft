"use client";

import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

import type { ArchiveContents, ArchiveEntry } from "@/types";
import { getDirname, getEntriesInDir, inferDirectories } from "./archiveUtils";

interface ArchiveNavigationResult {
  currentEntries: ArchiveEntry[];
  imageEntries: ArchiveEntry[];
  breadcrumbs: Array<{ label: string; path: string }>;
  navigateArchive: (path: string) => void;
  handleDirClick: (entry: ArchiveEntry) => void;
  handleBreadcrumbClick: (path: string) => void;
}

export function useArchiveNavigation(
  archive: ArchiveContents | null,
  currentPath: string,
  searchParamsString: string,
  router: AppRouterInstance
): ArchiveNavigationResult {
  const t = useTranslations("archive");

  const currentEntries = archive
    ? [
        ...getEntriesInDir(archive.entries, currentPath),
        ...inferDirectories(archive.entries, currentPath),
      ].sort((a, b) => {
        if (a.is_dir && !b.is_dir) return -1;
        if (!a.is_dir && b.is_dir) return 1;
        return a.filename.localeCompare(b.filename);
      })
    : [];

  const imageEntries = useMemo(
    () =>
      archive
        ? archive.entries
            .filter(
              (e) =>
                !e.is_dir &&
                e.file_type === "image" &&
                getDirname(e.path) === currentPath
            )
            .sort((a, b) => a.path.localeCompare(b.path))
        : [],
    [archive, currentPath]
  );

  const pathSegments = currentPath ? currentPath.split("/") : [];
  const breadcrumbs = [
    { label: t("rootBreadcrumb"), path: "" },
    ...pathSegments.map((seg, i) => ({
      label: seg,
      path: pathSegments.slice(0, i + 1).join("/"),
    })),
  ];

  const navigateArchive = useCallback(
    (path: string) => {
      const params = new URLSearchParams(searchParamsString);
      if (path) {
        params.set("archivePath", path);
      } else {
        params.delete("archivePath");
      }
      const qs = params.toString();
      router.push(qs ? `?${qs}` : window.location.pathname);
    },
    [router, searchParamsString]
  );

  const handleDirClick = useCallback(
    (entry: ArchiveEntry) => {
      const dirPath = entry.path.endsWith("/")
        ? entry.path.slice(0, -1)
        : entry.path;
      navigateArchive(dirPath);
    },
    [navigateArchive]
  );

  const handleBreadcrumbClick = useCallback(
    (path: string) => {
      navigateArchive(path);
    },
    [navigateArchive]
  );

  return {
    currentEntries,
    imageEntries,
    breadcrumbs,
    navigateArchive,
    handleDirClick,
    handleBreadcrumbClick,
  };
}
