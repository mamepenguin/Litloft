export interface DriveEntry {
  name: string;
  path: string;
  access_group?: string;
  addons?: Record<string, boolean | Record<string, boolean>>;
}

export interface PasswordEntry {
  password: string;
  groups: string[];
}

export type AddonPolicy = Record<
  string,
  Record<string, boolean | Record<string, boolean>>
>;

/**
 * The backend's reading of a stored policy (`config.is_addon_feature_enabled`):
 * anything not stored is on. An addon counts as on when its `index` feature is.
 */
export function isAddonFeatureOn(
  policy: AddonPolicy,
  drive: string,
  addon: string,
  feature: string,
): boolean {
  const value = policy[drive]?.[addon];
  if (typeof value === "boolean") return value;
  if (typeof value === "object" && value !== null && feature in value) {
    return Boolean(value[feature]);
  }
  return true;
}

export function isAddonOn(policy: AddonPolicy, drive: string, addon: string): boolean {
  return isAddonFeatureOn(policy, drive, addon, "index");
}

export interface RestartStatus {
  pending: boolean;
  files: { name: string; count?: number; exists?: boolean }[];
}

export interface SetupStatus {
  completed: boolean;
}

export interface AddonPolicyFeature {
  name: string;
  default: boolean;
  i18n_key: string;
}

export interface AddonStatusEntry {
  name: string;
  scope?: string;
  enabled?: boolean;
  description?: string;
  label?: string;
  policy_features?: AddonPolicyFeature[];
}

export interface ValidationError {
  code: string;
  field?: string;
  message?: string;
}

export class AdminConfigError extends Error {
  status: number;
  detail: ValidationError | string | undefined;

  constructor(status: number, detail: ValidationError | string | undefined) {
    super(
      typeof detail === "object" && detail?.message
        ? detail.message
        : `Admin config error: ${status}`,
    );
    this.status = status;
    this.detail = detail;
  }

  get code(): string | undefined {
    if (typeof this.detail === "object" && this.detail !== null) {
      return this.detail.code;
    }
    return undefined;
  }
}

async function parseError(res: Response): Promise<AdminConfigError> {
  let detail: ValidationError | string | undefined;
  try {
    const body = await res.json();
    detail = body?.detail;
  } catch {
    detail = undefined;
  }
  return new AdminConfigError(res.status, detail);
}

export const SETUP_TOKEN_HEADER = "X-Litloft-Setup-Token";

/** The token is only ever sent by the first-run wizard. */
function setupTokenHeader(token?: string): Record<string, string> {
  return token ? { [SETUP_TOKEN_HEADER]: token } : {};
}

async function requestJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw await parseError(res);
  }
  return (await res.json()) as T;
}

/** Thrown when the install has already been through setup. */
export class SetupAlreadyCompletedError extends Error {}

export async function verifySetupToken(token: string): Promise<void> {
  try {
    await requestJson<unknown>("/api/admin/config/setup-token/verify", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  } catch (err) {
    if (err instanceof AdminConfigError && err.status === 404) {
      throw new SetupAlreadyCompletedError();
    }
    throw err;
  }
}

export async function getDrives(): Promise<DriveEntry[]> {
  return requestJson<DriveEntry[]>("/api/admin/config/drives", {
    method: "GET",
  });
}

export async function putDrives(
  drives: DriveEntry[],
  setupToken?: string,
): Promise<void> {
  await requestJson<unknown>("/api/admin/config/drives", {
    method: "PUT",
    body: JSON.stringify(drives),
    headers: setupTokenHeader(setupToken),
  });
}

export async function getPasswords(): Promise<PasswordEntry[]> {
  return requestJson<PasswordEntry[]>("/api/admin/config/passwords", {
    method: "GET",
  });
}

export async function putPasswords(
  entries: PasswordEntry[],
  setupToken?: string,
): Promise<void> {
  await requestJson<unknown>("/api/admin/config/passwords", {
    method: "PUT",
    body: JSON.stringify(entries),
    headers: setupTokenHeader(setupToken),
  });
}

export async function appendPassword(entry: PasswordEntry): Promise<void> {
  await requestJson<unknown>("/api/admin/config/passwords/append", {
    method: "POST",
    body: JSON.stringify(entry),
  });
}

export async function deletePassword(index: number): Promise<void> {
  await requestJson<unknown>(`/api/admin/config/passwords/${index}`, {
    method: "DELETE",
  });
}

export async function getAddonPolicy(): Promise<AddonPolicy> {
  return requestJson<AddonPolicy>("/api/admin/config/addon-policy", {
    method: "GET",
  });
}

export async function putAddonPolicy(
  policy: AddonPolicy,
  setupToken?: string,
): Promise<void> {
  await requestJson<unknown>("/api/admin/config/addon-policy", {
    method: "PUT",
    body: JSON.stringify(policy),
    headers: setupTokenHeader(setupToken),
  });
}

export async function getRestartStatus(): Promise<RestartStatus> {
  return requestJson<RestartStatus>("/api/admin/config/restart-status", {
    method: "GET",
  });
}

export async function getSetupStatus(): Promise<SetupStatus> {
  return requestJson<SetupStatus>("/api/admin/config/setup-status", {
    method: "GET",
  });
}

export async function postCompleteSetup(setupToken?: string): Promise<void> {
  await requestJson<unknown>("/api/admin/config/complete-setup", {
    method: "POST",
    headers: setupTokenHeader(setupToken),
  });
}

export async function getAddonsStatus(): Promise<AddonStatusEntry[]> {
  // Backend returns { addons: { [name]: meta }, slots: {...} } — normalize
  // to a flat array for callers. Be tolerant: if a future backend regresses
  // to the old array shape (or a test mocks it that way), accept it too.
  const data = await requestJson<
    | { addons?: Record<string, Omit<AddonStatusEntry, "name">> }
    | AddonStatusEntry[]
  >("/api/addons/status", { method: "GET" });
  if (Array.isArray(data)) {
    return data;
  }
  const addons = data?.addons ?? {};
  return Object.entries(addons).map(([name, meta]) => ({ name, ...meta }));
}
