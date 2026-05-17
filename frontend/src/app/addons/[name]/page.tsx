"use client";

import { useEffect, useState } from "react";
import { useParams, notFound } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAddonSlots } from "@/components/AddonSlotsProvider";

const VALID_ADDON_NAME = /^[a-z][a-z0-9_-]*$/;

type AddonModule = { default: React.ComponentType };

const moduleCache = new Map<string, AddonModule>();
const modulePromiseCache = new Map<string, Promise<AddonModule>>();

function loadAddonPage(addonName: string): Promise<AddonModule> {
  if (!VALID_ADDON_NAME.test(addonName)) {
    return Promise.reject(new Error(`Invalid addon name: ${addonName}`));
  }
  const cached = modulePromiseCache.get(addonName);
  if (cached) return cached;
  const promise = import(`@/addons/${addonName}/Page`).then((mod: AddonModule) => {
    moduleCache.set(addonName, mod);
    return mod;
  });
  modulePromiseCache.set(addonName, promise);
  return promise;
}

export default function GlobalScopedAddonPage() {
  const params = useParams();
  const addonName = decodeURIComponent(params.name as string);
  const { addons, loading } = useAddonSlots();
  const meta = addons[addonName];
  const t = useTranslations("errors");

  const [mod, setMod] = useState<AddonModule | null>(
    () => moduleCache.get(addonName) ?? null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!meta) return;
    if (moduleCache.has(addonName)) {
      setMod(moduleCache.get(addonName)!);
      return;
    }
    loadAddonPage(addonName)
      .then(setMod)
      .catch(() => setFailed(true));
  }, [addonName, meta]);

  if (loading) return null;
  if (!meta) notFound();

  const scope = meta.scope ?? "global";
  if (scope !== "global" && scope !== "both") {
    notFound();
  }

  if (failed) {
    return (
      <div className="flex min-h-[30dvh] flex-col items-center justify-center px-4 text-center">
        <p className="text-sm text-text-muted">{t("addonLoadFailed")}</p>
      </div>
    );
  }
  if (!mod) return null;

  const Component = mod.default;
  return <Component />;
}
