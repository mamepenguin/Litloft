import {
  Download,
  Images,
  MessageCircleQuestion,
  NotebookPen,
  Package,
  Rss,
  type LucideIcon,
} from "lucide-react";

/** The manifest's `navigation.icon` token, as the sidebar, page jump and Home draw it. */
export const ADDON_NAV_ICONS: Record<string, LucideIcon> = {
  download: Download,
  images: Images,
  "message-circle-question": MessageCircleQuestion,
  "notebook-pen": NotebookPen,
  package: Package,
  rss: Rss,
};
