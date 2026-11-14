export const APP_FACES = ["discover", "library"] as const;
export type AppFace = (typeof APP_FACES)[number];

export const APP_IDS = ["video", "reading"] as const;
export type AppId = (typeof APP_IDS)[number];

/** A built-in app, or an addon by the name the addon loader accepted for it. */
export type AppKey = AppId | { addon: string };

export const APP_CLASSIFICATIONS = ["folder", "tag", "month", "duration", "watch"] as const;
export type AppClassification = (typeof APP_CLASSIFICATIONS)[number];

export interface AppPrefs {
  face: AppFace;
  classification: AppClassification;
  /** `default` or a smart folder id; checked against the drive's list by the caller. */
  target: string;
}

export const READING_GROUPS = ["none", "tag"] as const;
export type ReadingGroup = (typeof READING_GROUPS)[number];

export const DEFAULT_READING_GROUP: ReadingGroup = "none";

export const DEFAULT_APP_PREFS: AppPrefs = {
  face: "discover",
  classification: "folder",
  target: "default",
};

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
    classification: oneOf(
      APP_CLASSIFICATIONS,
      read(app, "classification", drive),
      DEFAULT_APP_PREFS.classification,
    ),
    target: readAppTarget(drive, app),
  };
}

export function writeAppPrefs(
  drive: string,
  changes: Partial<AppPrefs>,
  app: AppId = "video",
): void {
  for (const field of ["face", "classification", "target"] as const) {
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
 * `"default"` or a smart folder id, unchecked against the drive's folders: a
 * caller falls back to the default target for a folder that is gone or
 * unusable and keeps the saved id, as the built-in apps do.
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
 * The smart folders the viewer chose to show in the Target menu. `null` is
 * "never saved", which lists every usable folder; an empty array is a saved
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

function readingGroupKey(drive: string): string {
  return `litloft.readingApp.group.${encodeURIComponent(drive)}`;
}

export function readReadingGroup(drive: string): ReadingGroup {
  let raw: string | null;
  try {
    raw = localStorage.getItem(readingGroupKey(drive));
  } catch {
    return DEFAULT_READING_GROUP;
  }
  return oneOf(READING_GROUPS, raw, DEFAULT_READING_GROUP);
}

export function writeReadingGroup(drive: string, group: ReadingGroup): void {
  try {
    localStorage.setItem(readingGroupKey(drive), group);
  } catch {
    // Losing the choice only returns the face to None on the next visit.
  }
}
