export const APP_FACES = ["discover", "library"] as const;
export type AppFace = (typeof APP_FACES)[number];

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
function keyFor(field: keyof AppPrefs, drive: string): string {
  return `litloft.videoApp.${field}.${encodeURIComponent(drive)}`;
}

function read(field: keyof AppPrefs, drive: string): string | null {
  try {
    return localStorage.getItem(keyFor(field, drive));
  } catch {
    return null;
  }
}

function oneOf<T extends string>(allowed: readonly T[], value: string | null, fallback: T): T {
  return allowed.find((candidate) => candidate === value) ?? fallback;
}

export function readAppPrefs(drive: string): AppPrefs {
  return {
    face: oneOf(APP_FACES, read("face", drive), DEFAULT_APP_PREFS.face),
    classification: oneOf(
      APP_CLASSIFICATIONS,
      read("classification", drive),
      DEFAULT_APP_PREFS.classification,
    ),
    target: read("target", drive) || DEFAULT_APP_PREFS.target,
  };
}

export function writeAppPrefs(drive: string, changes: Partial<AppPrefs>): void {
  for (const field of ["face", "classification", "target"] as const) {
    const value = changes[field];
    if (value === undefined) continue;
    try {
      localStorage.setItem(keyFor(field, drive), value);
    } catch {
      // Losing a preference only resets it to its default.
    }
  }
}
