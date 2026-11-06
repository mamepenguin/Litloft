"use client";

import { useEffect, useState } from "react";

export const IMAGE_QUERY_LIMIT_BYTES = 20 * 1024 * 1024;
export const IMAGE_QUERY_AVAILABLE_PATH =
  "/api/addons/intelligence/search/by-image/available";
export const IMAGE_QUERY_PATH = "/api/addons/intelligence/search/by-image";

const ADDON_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/heic",
  "image/heif",
]);

const STORE_LIMIT = 5;
const RETRYABLE_STATUS = new Set([500, 502, 503]);

export type ImageAvailability = "pending" | "available" | "unavailable";

export type ImageTextStatus = "read" | "too_short" | "off" | "failed";

export interface ImageHit {
  file_id: string;
  drive: string;
  filename: string;
  file_type: string;
  score: number;
  match_types: string[];
  file: unknown;
}

export interface SceneHit {
  file_id: string;
  drive: string;
  filename: string;
  start: number;
  end: number;
  peak: number;
  score: number;
  frame_url: string;
  file: unknown;
}

export interface ImagePassage {
  kind: "page" | "section" | "text" | string;
  start: number | null;
  end: number | null;
  page: number | null;
  section: number | null;
  section_title: string | null;
  chunk_index: number | null;
  text: string;
  score: number;
  keyword: boolean;
  highlight_terms: string[];
  frame_url: string | null;
}

export interface DocumentHit {
  file_id: string;
  drive: string;
  filename: string;
  file_type: string;
  score: number;
  passages: ImagePassage[];
  file: unknown;
}

export interface ImageAnswer {
  images: ImageHit[];
  scenes: SceneHit[];
  scenes_partial: boolean;
  documents: DocumentHit[];
  text: { status: ImageTextStatus; excerpt: string | null };
}

export interface ImageFailure {
  status: number | "network";
  retryable: boolean;
}

export interface ImageEntry {
  id: string;
  blob: Blob;
  type: string;
  objectUrl: string;
  state: "pending" | "loading" | "answered" | "failed";
  answer: ImageAnswer | null;
  failure: ImageFailure | null;
  controller: AbortController | null;
  used: number;
}

const availability = new Map<string, Promise<boolean>>();
const store = new Map<string, ImageEntry>();
const listeners = new Set<() => void>();
let clock = 0;

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeImageStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function askImageAvailability(drive: string): Promise<boolean> {
  const cached = availability.get(drive);
  if (cached) return cached;
  const asked = (async () => {
    try {
      const response = await fetch(IMAGE_QUERY_AVAILABLE_PATH, {
        headers: { "X-Lit-Drive": drive },
      });
      if (response.status !== 200) return false;
      const body = (await response.json().catch(() => ({}))) as {
        available?: unknown;
      };
      return body?.available !== false;
    } catch {
      return false;
    }
  })();
  availability.set(drive, asked);
  return asked;
}

export function useImageAvailability(drive: string | null): ImageAvailability {
  const [state, setState] = useState<ImageAvailability>("pending");
  useEffect(() => {
    let live = true;
    if (!drive) {
      setState("unavailable");
      return;
    }
    setState("pending");
    askImageAvailability(drive).then((available) => {
      if (live) setState(available ? "available" : "unavailable");
    });
    return () => {
      live = false;
    };
  }, [drive]);
  return state;
}

function queryId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export function storeImage(blob: Blob, type: string): string {
  const id = queryId();
  const entry: ImageEntry = {
    id,
    blob,
    type,
    objectUrl: URL.createObjectURL(blob),
    state: "pending",
    answer: null,
    failure: null,
    controller: null,
    used: ++clock,
  };
  store.set(id, entry);
  while (store.size > STORE_LIMIT) {
    const oldest = [...store.values()].sort((a, b) => a.used - b.used)[0];
    oldest.controller?.abort();
    URL.revokeObjectURL(oldest.objectUrl);
    store.delete(oldest.id);
  }
  emit();
  return id;
}

export function getImageEntry(id: string): ImageEntry | undefined {
  return store.get(id);
}

export function touchImageEntry(id: string): void {
  const entry = store.get(id);
  if (entry) entry.used = ++clock;
}

export function setImageState(
  id: string,
  state: ImageEntry["state"],
  controller?: AbortController | null,
): void {
  const entry = store.get(id);
  if (!entry) return;
  entry.state = state;
  if (controller !== undefined) entry.controller = controller;
  emit();
}

export function setImageAnswer(id: string, answer: ImageAnswer): void {
  const entry = store.get(id);
  if (!entry) return;
  entry.state = "answered";
  entry.answer = answer;
  entry.failure = null;
  entry.controller = null;
  emit();
}

export function setImageFailure(id: string, failure: ImageFailure): void {
  const entry = store.get(id);
  if (!entry) return;
  entry.state = "failed";
  entry.failure = failure;
  entry.controller = null;
  emit();
}

export function abortImageEntry(id: string): void {
  const entry = store.get(id);
  if (!entry) return;
  if (entry.state === "loading") entry.state = "pending";
  entry.controller?.abort();
  entry.controller = null;
  emit();
}

export function isRetryableFailure(failure: ImageFailure | null): boolean {
  return !!failure?.retryable;
}

export function failureForStatus(status: number): ImageFailure {
  return { status, retryable: RETRYABLE_STATUS.has(status) };
}

export type PreparedImage =
  | { blob: Blob; type: string }
  | { error: "too_large" | "unreadable" }
  | null;

function encodeJpeg(
  bitmap: ImageBitmap,
  width: number,
  height: number,
): Promise<Blob> {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    context?.drawImage(bitmap, 0, 0, width, height);
    return canvas.convertToBlob({ type: "image/jpeg", quality: 0.9 });
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context?.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("encode failed"))),
      "image/jpeg",
      0.9,
    );
  });
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (file.size === 0) return null;
  const kind = file.type;
  const allowed = ADDON_IMAGE_TYPES.has(kind);
  if (allowed && file.size <= IMAGE_QUERY_LIMIT_BYTES) {
    return { blob: file, type: kind };
  }

  const oversized = file.size > IMAGE_QUERY_LIMIT_BYTES;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { error: oversized ? "too_large" : "unreadable" };
  }

  try {
    const scale = Math.min(1, 4096 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const blob = await encodeJpeg(bitmap, width, height);
    if (blob.size > IMAGE_QUERY_LIMIT_BYTES) return { error: "too_large" };
    return { blob, type: "image/jpeg" };
  } catch {
    return { error: oversized ? "too_large" : "unreadable" };
  } finally {
    bitmap.close?.();
  }
}

export type ClipboardImage =
  | { kind: "text" }
  | { kind: "one"; file: File }
  | { kind: "several" }
  | { kind: "none" };

export function classifyClipboard(data: DataTransfer | null): ClipboardImage {
  if (!data) return { kind: "none" };
  const plain = data.getData?.("text/plain") ?? "";
  if (plain.trim() !== "") return { kind: "text" };
  const files = Array.from(data.files ?? []).filter((file) =>
    file.type.startsWith("image/"),
  );
  if (files.length === 0) return { kind: "none" };
  if (files.length === 1) return { kind: "one", file: files[0] };
  return { kind: "several" };
}

export type DragClass = "one_image" | "upload";

export function classifyDrag(data: DataTransfer | null): DragClass {
  const items = Array.from(data?.items ?? []);
  if (items.length !== 1) return "upload";
  const [item] = items;
  if (item.kind !== "file") return "upload";
  if (!item.type || !item.type.startsWith("image/")) return "upload";
  return "one_image";
}

export async function requestImageAnswer(
  drive: string,
  entry: ImageEntry,
  signal: AbortSignal,
): Promise<{ answer: ImageAnswer } | { failure: ImageFailure }> {
  let response: Response;
  try {
    response = await fetch(IMAGE_QUERY_PATH, {
      method: "POST",
      headers: {
        "X-Lit-Drive": drive,
        "Content-Type": entry.type,
      },
      body: entry.blob,
      signal,
    });
  } catch {
    return { failure: { status: "network", retryable: true } };
  }

  if (response.status === 200) {
    const body = (await response.json().catch(() => null)) as
      | (ImageAnswer & { available?: unknown })
      | null;
    if (body && body.available === false) {
      return { failure: { status: 200, retryable: true } };
    }
    if (!body) return { failure: { status: 200, retryable: true } };
    return { answer: body };
  }
  return { failure: failureForStatus(response.status) };
}
