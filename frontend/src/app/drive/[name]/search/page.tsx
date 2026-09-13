"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback } from "react";

import { FolderBrowser } from "@/components/FolderBrowser";
import type { FileKind } from "@/types";

// `subtitle` is not here for the reason it is not in the toolbar: nothing
// registers a row for it. If this list falls behind the toolbar, the chip is
// selectable, the URL carries the value, and the reload quietly widens the
// listing back to All.
export const VALID_TYPES: ReadonlyArray<FileKind> = [
  "video",
  "image",
  "audio",
  "document",
  "markdown",
  "pdf",
  "archive",
  "other",
];

function parseTypeFilter(raw: string | null): FileKind | null {
  if (!raw) return null;
  return (VALID_TYPES as readonly string[]).includes(raw) ? (raw as FileKind) : null;
}

/**
 * Off by default — most "videos about X" queries get noise from
 * incidental phone/object appearances when scene CLIP is on. Users who
 * specifically want "find a moment with X" can opt in.
 */
function SceneSearchToggle({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: (next: boolean) => void;
}) {
  const t = useTranslations("search");
  return (
    <label className="inline-flex items-center gap-2 text-sm select-none cursor-pointer">
      <input
        type="checkbox"
        checked={active}
        onChange={(e) => onToggle(e.target.checked)}
        className="h-4 w-4"
        aria-describedby="scene-search-hint"
      />
      <span>{t("sceneSearchToggle")}</span>
      <span
        id="scene-search-hint"
        className="text-xs text-[var(--text-muted)]"
      >
        {t("sceneSearchHint")}
      </span>
    </label>
  );
}

export default function SearchPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const driveName = decodeURIComponent(params.name as string);
  const q = searchParams.get("q") ?? "";
  const typeFilter = parseTypeFilter(searchParams.get("type"));
  const smartFolderId = searchParams.get("smart_folder_id");
  const includeSceneClip = searchParams.get("include_scene_clip") === "true";

  const handleToggle = useCallback(
    (next: boolean) => {
      const nextParams = new URLSearchParams(searchParams.toString());
      if (next) {
        nextParams.set("include_scene_clip", "true");
      } else {
        nextParams.delete("include_scene_clip");
      }
      const driveSegment = encodeURIComponent(driveName);
      const qs = nextParams.toString();
      router.replace(`/drive/${driveSegment}/search${qs ? `?${qs}` : ""}`);
    },
    [searchParams, driveName, router],
  );

  return (
    <>
      <div className="px-4 pt-3 pb-1 flex items-center">
        <SceneSearchToggle active={includeSceneClip} onToggle={handleToggle} />
      </div>
      <FolderBrowser
        driveName={driveName}
        searchQuery={q}
        typeFilter={typeFilter}
        smartFolderId={smartFolderId}
        includeSceneClip={includeSceneClip}
      />
    </>
  );
}
