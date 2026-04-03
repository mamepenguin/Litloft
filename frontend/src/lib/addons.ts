export interface AddonMeta {
  label: string;
  icon: string;
  href: string;
}

export async function getEnabledAddons(): Promise<Record<string, AddonMeta>> {
  try {
    const res = await fetch("/api/addons/status", { credentials: "include" });
    if (!res.ok) return {};
    const data = await res.json();
    return (data.addons as Record<string, AddonMeta>) ?? {};
  } catch {
    return {};
  }
}
