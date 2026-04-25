"use client";

import { useEffect, useState } from "react";
import { useParams, notFound } from "next/navigation";
import { useAddonSlots } from "@/components/AddonSlotsProvider";

const VALID_ADDON_NAME = /^[a-z][a-z0-9-]*$/;
const VALID_SLUG = /^[a-z][a-z0-9-]*$/;

type AddonModule = { default: React.ComponentType };

const moduleCache = new Map<string, AddonModule>();
const modulePromiseCache = new Map<string, Promise<AddonModule>>();

function loadAddonSubpage(addonName: string, slug: string): Promise<AddonModule> {
  if (!VALID_ADDON_NAME.test(addonName) || !VALID_SLUG.test(slug)) {
    return Promise.reject(new Error(`Invalid addon subpage: ${addonName}/${slug}`));
  }
  const key = `${addonName}/${slug}`;
  const cached = modulePromiseCache.get(key);
  if (cached) return cached;
  const promise = import(`@/addons/${addonName}/pages/${slug}`).then((mod: AddonModule) => {
    moduleCache.set(key, mod);
    return mod;
  });
  modulePromiseCache.set(key, promise);
  return promise;
}

export default function GlobalScopedAddonSubpage() {
  const params = useParams();
  const addonName = decodeURIComponent(params.name as string);
  const slug = decodeURIComponent(params.slug as string);
  const { addons, loading } = useAddonSlots();
  const meta = addons[addonName];
  const cacheKey = `${addonName}/${slug}`;

  const [mod, setMod] = useState<AddonModule | null>(
    () => moduleCache.get(cacheKey) ?? null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!meta) return;
    if (moduleCache.has(cacheKey)) {
      setMod(moduleCache.get(cacheKey)!);
      return;
    }
    loadAddonSubpage(addonName, slug)
      .then(setMod)
      .catch(() => setFailed(true));
  }, [addonName, slug, cacheKey, meta]);

  if (loading) return null;
  if (!meta) notFound();

  const scope = meta.scope ?? "global";
  if (scope !== "global" && scope !== "both") {
    notFound();
  }

  if (failed) notFound();
  if (!mod) return null;

  const Component = mod.default;
  return <Component />;
}
