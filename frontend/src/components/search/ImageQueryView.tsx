"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  abortImageEntry,
  classifyDrag,
  getImageEntry,
  isRetryableFailure,
  requestImageAnswer,
  setImageAnswer,
  setImageFailure,
  setImageState,
  subscribeImageStore,
  touchImageEntry,
  type DragClass,
  type ImageAvailability,
} from "@/lib/imageQuery";

import { ImageQueryViewPresenter } from "./ImageQueryViewPresenter";
import { useImageInput } from "./useImageInput";

function useImageEntry(id: string) {
  const [, force] = useReducer((value: number) => value + 1, 0);
  useEffect(() => subscribeImageStore(() => force()), []);
  return getImageEntry(id);
}

export interface ImageQueryViewProps {
  drive: string;
  id: string;
  availability: ImageAvailability;
}

export default function ImageQueryView({
  drive,
  id,
  availability,
}: ImageQueryViewProps) {
  const router = useRouter();
  const input = useImageInput((newId) => {
    router.push(`/drive/${encodeURIComponent(drive)}/search?img=${newId}`);
  });
  const entry = useImageEntry(id);
  const [attempt, setAttempt] = useState(0);
  const [overlay, setOverlay] = useState(false);
  const dragClassRef = useRef<DragClass | null>(null);
  const dragDepth = useRef(0);

  useEffect(() => {
    touchImageEntry(id);
    return () => abortImageEntry(id);
  }, [id]);

  useEffect(() => {
    const current = getImageEntry(id);
    if (!current || current.state !== "pending") return;
    const controller = new AbortController();
    setImageState(id, "loading", controller);
    let live = true;
    requestImageAnswer(drive, current, controller.signal).then((result) => {
      if (!live || controller.signal.aborted) return;
      if ("answer" in result) setImageAnswer(id, result.answer);
      else setImageFailure(id, result.failure);
    });
    return () => {
      live = false;
    };
  }, [id, drive, attempt]);

  const available = availability === "available";

  const handleDragEnter = (event: React.DragEvent) => {
    if (!available) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current += 1;
    if (dragClassRef.current === null) {
      dragClassRef.current = classifyDrag(event.dataTransfer);
      setOverlay(dragClassRef.current === "one_image");
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!available || dragClassRef.current !== "one_image") {
      event.dataTransfer.dropEffect = "none";
    } else {
      event.dataTransfer.dropEffect = "copy";
    }
  };

  const handleDragLeave = (event: React.DragEvent) => {
    if (!available) return;
    event.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      dragClassRef.current = null;
      setOverlay(false);
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const kept = dragClassRef.current;
    dragDepth.current = 0;
    dragClassRef.current = null;
    setOverlay(false);
    if (!available || kept !== "one_image") return;
    const files = Array.from(event.dataTransfer.files);
    if (files.length === 1 && files[0].type.startsWith("image/")) {
      input.give(files[0]);
    }
  };

  const retry = () => {
    if (!entry || entry.state !== "failed") return;
    if (!isRetryableFailure(entry.failure)) return;
    setImageState(id, "pending");
    setAttempt((value) => value + 1);
  };

  return (
    <ImageQueryViewPresenter
      drive={drive}
      availability={availability}
      entry={entry}
      error={input.error}
      preparing={input.preparing}
      overlay={overlay}
      onRemoveImage={() => router.push(`/drive/${encodeURIComponent(drive)}`)}
      onImagePick={input.give}
      onImagePaste={input.give}
      onImageMany={() => input.setError("one_image")}
      onEdit={input.clearError}
      onRetry={retry}
      onDrop={handleDrop}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    />
  );
}
