"use client";

import { useTranslations } from "next-intl";

import type { FileRelationItem, RelatedFileSummary } from "@/lib/api";
import { AddonSlot } from "../../AddonSlot";
import { groupRelations } from "./groupRelations";
import { RelatedFileRow } from "./RelatedFileRow";

function RelatedSection({
  label,
  files,
}: {
  label: string;
  files: RelatedFileSummary[];
}) {
  if (files.length === 0) return null;
  return (
    <section>
      <h3 className="flex items-center gap-1.5 px-2.5 pb-1.5 text-xs font-medium text-text-muted">
        {label}
        <span className="font-normal">{files.length}</span>
      </h3>
      {/* The column count is asked of this list's own width: the same
          markup renders in the inspector rail and in the full-width
          collection stack. */}
      <div className="related-files-host">
        <div className="related-files-grid grid gap-x-2 gap-y-0.5">
          {files.map((file) => (
            <RelatedFileRow key={file.id} file={file} />
          ))}
        </div>
      </div>
    </section>
  );
}

export function RelatedPanel({
  relations,
  addonSlotProps,
}: {
  relations: FileRelationItem[];
  addonSlotProps: Record<string, unknown>;
}) {
  const t = useTranslations("file");
  const { linksFrom, linksTo, related } = groupRelations(relations);

  return (
    <div className="space-y-5">
      <RelatedSection label={t("relatedLinksFrom")} files={linksFrom} />
      <RelatedSection label={t("relatedLinksTo")} files={linksTo} />
      <RelatedSection label={t("relatedFilesTitle")} files={related} />
      {/* The addon half arrives through a slot rather than by id: core
          naming an addon's entry here would be the core-to-addon
          dependency the rules forbid. */}
      <div className="flex flex-col gap-5 px-2.5 empty:hidden">
        <AddonSlot id="file-relations" layout="stack" props={addonSlotProps} />
      </div>
    </div>
  );
}
