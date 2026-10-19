import { addonUrlFor, type AddonMeta } from "./addons";

export type AddonNavPlacement = "primary" | "sources" | "utility";

/** Validated by the backend registry before it reaches the catalogue. */
export interface AddonNavigation {
  label: string;
  placement: AddonNavPlacement;
  priority: number;
  i18n_key?: string;
  icon?: string;
}

export interface AddonNavEntry {
  name: string;
  navigation: AddonNavigation;
  href: string;
}

export function addonNavEntries(
  addons: Record<string, AddonMeta>,
  currentDrive: string | null,
  placement: AddonNavPlacement,
): AddonNavEntry[] {
  return Object.entries(addons)
    .flatMap(([name, meta]) => {
      const navigation = meta.navigation;
      if (!navigation || navigation.placement !== placement) return [];
      const href = addonUrlFor(name, meta, currentDrive);
      return href === null ? [] : [{ name, navigation, href }];
    })
    .sort(
      (a, b) =>
        a.navigation.priority - b.navigation.priority ||
        (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
    );
}
