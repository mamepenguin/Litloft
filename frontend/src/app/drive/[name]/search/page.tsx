"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback } from "react";

import { FolderBrowser } from "@/components/FolderBrowser";
import type { FileKind } from "@/types";

// The kinds a search can honour end to end.
//
// `markdown` and `pdf` are missing on purpose: the core listing
// understands them, but intelligence's semantic index stores
// `file_type`, which never holds either — a search narrowed to one
// would drop every semantic hit and quietly degrade to filename
// matches. The search toolbar hides those two for the same reason
// (`FolderToolbar`), so a URL cannot carry a value the picker will not
// produce. Widening both belongs with the addon change that teaches the
// index the nested kinds.
const VALID_TYPES: ReadonlyArray<FileKind> = [
  "video",
  "image",
  "audio",
  "document",
  "archive",
  "other",
];

function parseTypeFilter(raw: string | null): FileKind | null {
  if (!raw) return null;
  return (VALID_TYPES as readonly string[]).includes(raw) ? (raw as FileKind) : null;
}

/**
 * Scene-search toggle. When checked, semantic search unions in
 * scene-frame CLIP embeddings (`embedding_type="clip"`) alongside the
 * default representative-frame route (`embedding_type="clip_thumbnail"`).
 * Spec `2026-05-02-thumbnail-clip-default-shallow-search.md`.
 *
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
      // Push a fresh URLSearchParams so we don't accidentally drop
      // unrelated params (e.g. type, smart_folder_id) and so the
      // browser back button restores the previous toggle state.
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
