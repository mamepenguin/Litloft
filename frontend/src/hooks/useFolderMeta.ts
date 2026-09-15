import { useTranslations } from "next-intl";

import { folderKindBreakdown } from "@/lib/folderKindBreakdown";
import type { Folder } from "@/types";

export function useFolderMeta(folder: Folder): {
  count: string;
  kinds: string | null;
} {
  const t = useTranslations("folder");
  const tFilter = useTranslations("filter");
  const breakdown = folderKindBreakdown(folder.kind_counts);
  const kinds =
    breakdown.length === 0
      ? null
      : breakdown.length === 1
        ? tFilter(`type.${breakdown[0].kind}`)
        : breakdown.map((s) => `${tFilter(`type.${s.kind}`)} ${s.count}`).join(" · ");
  return { count: t("items", { count: folder.file_count }), kinds };
}
