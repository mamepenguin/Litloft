import { addonUrlFor, type AddonMeta } from "./addons";

export type AddonNavPlacement = "primary" | "sources" | "utility";

/** Validated by the backend registry before it reaches the catalogue. */
export interface AddonNavigation {
  label: string;
  placement: AddonNavPlacement;
  priority: number;
  i18n_key?: string;
  icon?: string;
  /** The addon subpage slug this entrance points at, when it has one. */
  path?: string;
}

export interface AddonNavEntry {
  name: string;
  /** Unique among all entries: the addon name plus `/{path}` when set. */
  key: string;
  navigation: AddonNavigation;
  href: string;
}

interface OrderedEntry extends AddonNavEntry {
  place: number;
}

export function addonNavEntries(
  addons: Record<string, AddonMeta>,
  currentDrive: string | null,
  placement: AddonNavPlacement,
): AddonNavEntry[] {
  return Object.entries(addons)
    .flatMap(([name, meta]) => {
      const navigation = meta.navigation;
      if (!navigation) return [];
      const baseHref = addonUrlFor(name, meta, currentDrive);
      if (baseHref === null) return [];
      const list = Array.isArray(navigation) ? navigation : [navigation];
      return list.flatMap<OrderedEntry>((entry, place) => {
        if (entry.placement !== placement) return [];
        const suffix = entry.path ? `/${entry.path}` : "";
        return [{
          name,
          key: `${name}${suffix}`,
          navigation: entry,
          href: `${baseHref}${suffix}`,
          place,
        }];
      });
    })
    .sort(
      (a, b) =>
        a.navigation.priority - b.navigation.priority ||
        (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) ||
        a.place - b.place,
    )
    .map(({ name, key, navigation, href }) => ({ name, key, navigation, href }));
}
