import { BookOpen, Film, type LucideIcon } from "lucide-react";

export interface BuiltinApp {
  id: string;
  /** Resolved against the root of the message catalogue. */
  labelKey: string;
  icon: LucideIcon;
  route: (drive: string) => string;
}

/** Apps the core ships. Addon entries come from their manifests, not from here. */
export const builtinApps: readonly BuiltinApp[] = [
  {
    id: "video",
    labelKey: "sidebar.video",
    icon: Film,
    route: (drive) => `/drive/${encodeURIComponent(drive)}/apps/video`,
  },
  {
    id: "reading",
    labelKey: "sidebar.reading",
    icon: BookOpen,
    route: (drive) => `/drive/${encodeURIComponent(drive)}/apps/reading`,
  },
];
