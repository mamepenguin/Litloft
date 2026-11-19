export const APP_FACES = ["discover", "library"] as const;
export type AppFace = (typeof APP_FACES)[number];

export const APP_IDS = ["video", "reading"] as const;
export type AppId = (typeof APP_IDS)[number];

/** A built-in app, or an addon by the name the addon loader accepted for it. */
export type AppKey = AppId | { addon: string };

export interface AppPrefs {
  face: AppFace;
  /** `default` or a smart folder id; checked against the drive's list by the caller. */
  target: string;
}

export const DEFAULT_APP_PREFS: AppPrefs = {
  face: "discover",
  target: "default",
};

/** The grouping and the sort the viewer last chose for one Target. */
export interface TargetView {
  group?: string;
  sort?: string;
}

/** Encoded, so one drive's name can never be the prefix of another's key. */
function keyPrefix(app: AppKey): string {
  return typeof app === "string" ? `litloft.${app}App` : `litloft.addon.${app.addon}`;
}

function keyFor(app: AppKey, field: keyof AppPrefs, drive: string): string {
  return `${keyPrefix(app)}.${field}.${encodeURIComponent(drive)}`;
}

function shownKeyFor(app: AppKey, drive: string): string {
  return `${keyPrefix(app)}.targets.${encodeURIComponent(drive)}`;
}

function viewKeyFor(app: AppKey, drive: string): string {
  return `${keyPrefix(app)}.view.${encodeURIComponent(drive)}`;
}

/** Distinct for `video` and `{ addon: "video" }`, which are different keys. */
export function appKeyId(app: AppKey): string {
  return typeof app === "string" ? app : `addon:${app.addon}`;
}

export function appKeyFromId(id: string): AppKey {
  return id.startsWith("addon:") ? { addon: id.slice("addon:".length) } : (id as AppId);
}

function read(app: AppId, field: keyof AppPrefs, drive: string): string | null {
  try {
    return localStorage.getItem(keyFor(app, field, drive));
  } catch {
    return null;
  }
}

function oneOf<T extends string>(allowed: readonly T[], value: string | null, fallback: T): T {
  return allowed.find((candidate) => candidate === value) ?? fallback;
}

export function readAppPrefs(drive: string, app: AppId = "video"): AppPrefs {
  return {
    face: oneOf(APP_FACES, read(app, "face", drive), DEFAULT_APP_PREFS.face),
    target: readAppTarget(drive, app),
  };
}

export function writeAppPrefs(
  drive: string,
  changes: Partial<AppPrefs>,
  app: AppId = "video",
): void {
  for (const field of ["face", "target"] as const) {
    const value = changes[field];
    if (value === undefined) continue;
    try {
      localStorage.setItem(keyFor(app, field, drive), value);
    } catch {
      // Losing a preference only resets it to its default.
    }
  }
}

/**
 * `"default"`, a Smart Collection id or `collection:<id>` (read it with
 * `parseAppTargetId`), unchecked against the drive's lists: a caller falls
 * back to the default target for one that is gone or unusable and keeps the
 * saved id, as the built-in apps do.
 */
export function readAppTarget(drive: string, app: AppKey): string {
  try {
    return localStorage.getItem(keyFor(app, "target", drive)) || DEFAULT_APP_PREFS.target;
  } catch {
    return DEFAULT_APP_PREFS.target;
  }
}

export function writeAppTarget(drive: string, app: AppKey, id: string): void {
  try {
    localStorage.setItem(keyFor(app, "target", drive), id);
  } catch {
    // Losing a choice only returns the menu to the default target.
  }
}

/**
 * The targets the viewer chose to show in the Target menu, as target ids.
 * `null` is "never saved", which lists every target; an empty array is a saved
 * set that lists none.
 */
export function readShownTargets(drive: string, app: AppKey = "video"): string[] | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(shownKeyFor(app, drive));
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((id): id is string => typeof id === "string")) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeShownTargets(
  drive: string,
  ids: readonly string[],
  app: AppKey = "video",
): void {
  try {
    localStorage.setItem(shownKeyFor(app, drive), JSON.stringify(ids));
  } catch {
    // The open page keeps the toggle; a reload reads the previous set.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every Target's entry on one app and drive, or `{}` when the key is unusable. */
function readViewMap(app: AppKey, drive: string): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(viewKeyFor(app, drive));
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function sanitizeView(value: unknown): TargetView {
  if (!isRecord(value)) return {};
  const view: TargetView = {};
  if (typeof value.group === "string") view.group = value.group;
  if (typeof value.sort === "string") view.sort = value.sort;
  return view;
}

/** The stored view of one Target; `{}` when it was never written or cannot be read. */
export function readTargetView(app: AppKey, drive: string, targetId: string): TargetView {
  return sanitizeView(readViewMap(app, drive)[targetId]);
}

/**
 * Merges `change` into one Target's entry and leaves every other Target alone.
 * A key holding unreadable JSON is replaced by an object of the new entry only,
 * which loses the other entries because they were unreadable already.
 */
export function writeTargetView(
  app: AppKey,
  drive: string,
  targetId: string,
  change: TargetView,
): void {
  const next = readViewMap(app, drive);
  const held = isRecord(next[targetId]) ? next[targetId] : {};
  const entry: Record<string, string> = {};
  for (const [field, value] of Object.entries(held)) {
    if (typeof value === "string") entry[field] = value;
  }
  for (const [field, value] of Object.entries(change)) {
    if (typeof value === "string") entry[field] = value;
  }
  next[targetId] = entry;
  try {
    localStorage.setItem(viewKeyFor(app, drive), JSON.stringify(next));
  } catch {
    // The open page keeps the choice; the next mount reads its default.
  }
}

/**
 * The app's per-drive grouping from before views were kept per Target. Only
 * the default Target falls back to it, and nothing writes it any more.
 */
export function readLegacyGroup(drive: string, app: AppKey): string | null {
  const field = app === "reading" ? "group" : "classification";
  try {
    return localStorage.getItem(`${keyPrefix(app)}.${field}.${encodeURIComponent(drive)}`);
  } catch {
    return null;
  }
}
