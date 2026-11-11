"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { FolderBrowser } from "@/components/FolderBrowser";
import ImageQueryView from "@/components/search/ImageQueryView";
import type { ImageInputError } from "@/components/search/useImageInput";
import type { FileKind } from "@/types";
import {
  prepareImage,
  storeImage,
  useImageAvailability,
} from "@/lib/imageQuery";

// `subtitle` is not here for the reason it is not in the toolbar: nothing
// registers a row for it. If this list falls behind the toolbar, the chip is
// selectable, the URL carries the value, and the reload quietly widens the
// listing back to All.
export const VALID_TYPES: ReadonlyArray<FileKind> = [
  "video",
  "image",
  "audio",
  "document",
  "text",
  "pdf",
  "archive",
  "other",
];

function parseTypeFilter(raw: string | null): FileKind | null {
  if (!raw) return null;
  const kind = raw === "markdown" ? "text" : raw;
  return (VALID_TYPES as readonly string[]).includes(kind) ? (kind as FileKind) : null;
}

export default function SearchPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const driveName = decodeURIComponent(params.name as string);
  const availability = useImageAvailability(driveName);
  const img = searchParams.get("img");
  const [imagePreparing, setImagePreparing] = useState(false);
  const [imageError, setImageError] = useState<ImageInputError | null>(null);

  const handleImageQuery = async (file: File) => {
    setImageError(null);
    setImagePreparing(true);
    const prepared = await prepareImage(file);
    setImagePreparing(false);
    if (prepared === null) return;
    if ("error" in prepared) {
      setImageError(prepared.error);
      return;
    }
    const id = storeImage(prepared.blob, prepared.type);
    router.push(`/drive/${encodeURIComponent(driveName)}/search?img=${id}`);
  };

  const q = searchParams.get("q") ?? "";
  const typeFilter = parseTypeFilter(searchParams.get("type"));
  const smartFolderId = searchParams.get("smart_folder_id");
  const includeSceneClip = searchParams.get("include_scene_clip") === "true";
  const show = searchParams.get("show");

  if (img) {
    return (
      <ImageQueryView
        drive={driveName}
        id={img}
        availability={availability}
      />
    );
  }

  return (
    <FolderBrowser
      driveName={driveName}
      searchQuery={q}
      typeFilter={typeFilter}
      smartFolderId={smartFolderId}
      includeSceneClip={includeSceneClip}
      show={show ?? undefined}
      onImageQuery={availability === "available" ? handleImageQuery : undefined}
      imageError={imageError}
      imagePreparing={imagePreparing}
      onImageEdit={() => setImageError(null)}
    />
  );
}
