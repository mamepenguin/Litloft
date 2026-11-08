export const APP_FACES = ["discover", "library"] as const;
export type AppFace = (typeof APP_FACES)[number];

export const APP_IDS = ["video", "reading"] as const;
export type AppId = (typeof APP_IDS)[number];

export const APP_CLASSIFICATIONS = ["folder", "tag", "month", "duration", "watch"] as const;
export type AppClassification = (typeof APP_CLASSIFICATIONS)[number];

export interface AppPrefs {
  face: AppFace;
  classification: AppClassification;
  /** `default` or a smart folder id; checked against the drive's list by the caller. */
  target: string;
}

export const DEFAULT_APP_PREFS: AppPrefs = {
  face: "discover",
  classification: "folder",
  target: "default",
};

/** Encoded, so one drive's name can never be the prefix of another's key. */
function keyFor(app: AppId, field: keyof AppPrefs, drive: string): string {
  return `litloft.${app}App.${field}.${encodeURIComponent(drive)}`;
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
    target: read(app, "target", drive) || DEFAULT_APP_PREFS.target,
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
 * The smart folders the viewer chose to show in the Target menu. `null` is
 * "never saved", which lists every usable folder; an empty array is a saved
 * set that lists none.
 */
export function readShownTargets(drive: string, app: AppId = "video"): string[] | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(`litloft.${app}App.targets.${encodeURIComponent(drive)}`);
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
  app: AppId = "video",
): void {
  try {
    localStorage.setItem(
      `litloft.${app}App.targets.${encodeURIComponent(drive)}`,
      JSON.stringify(ids),
    );
  } catch {
    // The open page keeps the toggle; a reload reads the previous set.
  }
}
