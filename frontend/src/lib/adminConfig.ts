// Helpers for /api/admin/config/* endpoints used by the admin settings UI
// and the first-run wizard. Validation errors come back as 422 with a
// `{detail: {code, field?, message?}}` body — the helpers normalize that
// shape so callers can pattern-match on `code`.

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

export async function getDrives(): Promise<DriveEntry[]> {
  return requestJson<DriveEntry[]>("/api/admin/config/drives", {
    method: "GET",
  });
}

export async function putDrives(drives: DriveEntry[]): Promise<void> {
  await requestJson<unknown>("/api/admin/config/drives", {
    method: "PUT",
    body: JSON.stringify(drives),
  });
}

export async function getPasswords(): Promise<PasswordEntry[]> {
  return requestJson<PasswordEntry[]>("/api/admin/config/passwords", {
    method: "GET",
  });
}

export async function putPasswords(entries: PasswordEntry[]): Promise<void> {
  await requestJson<unknown>("/api/admin/config/passwords", {
    method: "PUT",
    body: JSON.stringify(entries),
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

export async function putAddonPolicy(policy: AddonPolicy): Promise<void> {
  await requestJson<unknown>("/api/admin/config/addon-policy", {
    method: "PUT",
    body: JSON.stringify(policy),
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

export async function postCompleteSetup(): Promise<void> {
  await requestJson<unknown>("/api/admin/config/complete-setup", {
    method: "POST",
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
