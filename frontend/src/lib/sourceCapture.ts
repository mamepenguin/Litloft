export const SOURCE_CAPTURE_LIMIT = 100;
export const SOURCE_CAPTURE_QUOTE_LIMIT = 4_000;
export const SOURCE_CAPTURE_NOTE_LIMIT = 1_000;

const STORAGE_PREFIX = "litloft:source-captures:";

export type SourceCaptureKind =
  | "media_timestamp"
  | "transcript"
  | "ask_citation";

export interface SourceCaptureLocator {
  seconds?: number;
  endSeconds?: number;
  page?: number;
  label?: string;
}

export interface SourceCapture {
  id: string;
  drive: string;
  sourceFileId: string;
  filename: string;
  fileType: string;
  kind: SourceCaptureKind;
  locator?: SourceCaptureLocator;
  quote?: string;
  note?: string;
  capturedAt: string;
}

export type NewSourceCapture = Omit<
  SourceCapture,
  "id" | "capturedAt" | "note"
> & {
  note?: string;
};

export class SourceCaptureLimitError extends Error {
  constructor() {
    super(`A source capture basket can hold at most ${SOURCE_CAPTURE_LIMIT} items`);
    this.name = "SourceCaptureLimitError";
  }
}

const cache = new Map<string, readonly SourceCapture[]>();
const loaded = new Set<string>();
const listeners = new Map<string, Set<() => void>>();

function storageKey(drive: string): string {
  return `${STORAGE_PREFIX}${drive}`;
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validLocator(value: unknown): value is SourceCaptureLocator {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const locator = value as Record<string, unknown>;
  if (locator.seconds !== undefined && !finiteNonNegative(locator.seconds)) return false;
  if (locator.endSeconds !== undefined && !finiteNonNegative(locator.endSeconds)) return false;
  if (
    locator.page !== undefined &&
    (!Number.isInteger(locator.page) || !finiteNonNegative(locator.page))
  ) {
    return false;
  }
  return locator.label === undefined || typeof locator.label === "string";
}

function validCapture(value: unknown, drive: string): value is SourceCapture {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    item.id.length > 0 &&
    item.drive === drive &&
    typeof item.sourceFileId === "string" &&
    item.sourceFileId.length > 0 &&
    item.sourceFileId.length <= 64 &&
    typeof item.filename === "string" &&
    item.filename.length > 0 &&
    item.filename.length <= 500 &&
    typeof item.fileType === "string" &&
    ["media_timestamp", "transcript", "ask_citation"].includes(
      item.kind as string,
    ) &&
    validLocator(item.locator) &&
    (item.quote === undefined ||
      (typeof item.quote === "string" &&
        item.quote.length <= SOURCE_CAPTURE_QUOTE_LIMIT)) &&
    (item.note === undefined ||
      (typeof item.note === "string" &&
        item.note.length <= SOURCE_CAPTURE_NOTE_LIMIT)) &&
    typeof item.capturedAt === "string"
  );
}

function read(drive: string): readonly SourceCapture[] {
  if (loaded.has(drive)) return cache.get(drive) ?? [];
  loaded.add(drive);
  const raw = storage()?.getItem(storageKey(drive));
  if (!raw) {
    cache.set(drive, []);
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    const items = Array.isArray(parsed)
      ? parsed
          .filter((item): item is SourceCapture => validCapture(item, drive))
          .slice(0, SOURCE_CAPTURE_LIMIT)
      : [];
    cache.set(drive, items);
    return items;
  } catch {
    cache.set(drive, []);
    return [];
  }
}

function write(drive: string, items: readonly SourceCapture[]): void {
  const next = [...items];
  cache.set(drive, next);
  loaded.add(drive);
  try {
    storage()?.setItem(storageKey(drive), JSON.stringify(next));
  } catch {
    // The in-memory basket remains usable when storage is unavailable/full.
  }
  listeners.get(drive)?.forEach((listener) => listener());
}

function trim(value: string | undefined, limit: number): string | undefined {
  const next = value?.trim();
  return next ? next.slice(0, limit) : undefined;
}

function captureKey(capture: Pick<
  SourceCapture,
  "sourceFileId" | "kind" | "locator" | "quote"
>): string {
  return JSON.stringify([
    capture.sourceFileId,
    capture.kind,
    capture.locator?.seconds ?? null,
    capture.locator?.endSeconds ?? null,
    capture.locator?.page ?? null,
    capture.quote?.trim() ?? null,
  ]);
}

function nextId(): string {
  return `cap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getSourceCaptures(drive: string): readonly SourceCapture[] {
  return read(drive);
}

export function subscribeSourceCaptures(
  drive: string,
  listener: () => void,
): () => void {
  const driveListeners = listeners.get(drive) ?? new Set<() => void>();
  driveListeners.add(listener);
  listeners.set(drive, driveListeners);
  return () => {
    driveListeners.delete(listener);
    if (driveListeners.size === 0) listeners.delete(drive);
  };
}

export function addSourceCapture(
  input: NewSourceCapture,
): { item: SourceCapture; added: boolean } {
  if (!input.drive || !input.sourceFileId || !input.filename) {
    throw new TypeError("drive, sourceFileId, and filename are required");
  }
  if (!validLocator(input.locator)) throw new TypeError("Invalid capture locator");

  const current = read(input.drive);
  const candidate: SourceCapture = {
    ...input,
    id: nextId(),
    quote: trim(input.quote, SOURCE_CAPTURE_QUOTE_LIMIT),
    note: trim(input.note, SOURCE_CAPTURE_NOTE_LIMIT),
    capturedAt: new Date().toISOString(),
  };
  const duplicate = current.find(
    (item) => captureKey(item) === captureKey(candidate),
  );
  if (duplicate) return { item: duplicate, added: false };
  if (current.length >= SOURCE_CAPTURE_LIMIT) throw new SourceCaptureLimitError();

  write(input.drive, [...current, candidate]);
  return { item: candidate, added: true };
}

export function updateSourceCaptureNote(
  drive: string,
  id: string,
  note: string,
): void {
  const current = read(drive);
  const nextNote = trim(note, SOURCE_CAPTURE_NOTE_LIMIT);
  write(
    drive,
    current.map((item) => (item.id === id ? { ...item, note: nextNote } : item)),
  );
}

export function removeSourceCapture(drive: string, id: string): void {
  write(
    drive,
    read(drive).filter((item) => item.id !== id),
  );
}

export function removeSourceCaptures(drive: string, ids: readonly string[]): void {
  const removed = new Set(ids);
  write(
    drive,
    read(drive).filter((item) => !removed.has(item.id)),
  );
}

export function reorderSourceCaptures(
  drive: string,
  orderedIds: readonly string[],
): void {
  const current = read(drive);
  const byId = new Map(current.map((item) => [item.id, item]));
  const ordered = orderedIds.flatMap((id) => {
    const item = byId.get(id);
    if (!item) return [];
    byId.delete(id);
    return [item];
  });
  write(drive, [...ordered, ...byId.values()]);
}

export function clearSourceCaptures(
  drive: string,
  options: { persist?: boolean } = {},
): void {
  if (options.persist === false) {
    cache.delete(drive);
    loaded.delete(drive);
    listeners.get(drive)?.forEach((listener) => listener());
    return;
  }
  write(drive, []);
}
