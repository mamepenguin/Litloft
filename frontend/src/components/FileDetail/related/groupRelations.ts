import type { FileRelationItem, RelatedFileSummary } from "@/lib/api";

export interface RelationGroups {
  linksFrom: RelatedFileSummary[];
  linksTo: RelatedFileSummary[];
  related: RelatedFileSummary[];
}

function sectionOf(item: FileRelationItem): keyof RelationGroups {
  if (item.origin !== "markdown") return "related";
  return item.direction === "outgoing" ? "linksFrom" : "linksTo";
}

export function groupRelations(items: FileRelationItem[]): RelationGroups {
  const groups: RelationGroups = { linksFrom: [], linksTo: [], related: [] };
  const seen = {
    linksFrom: new Set<string>(),
    linksTo: new Set<string>(),
    related: new Set<string>(),
  };
  for (const item of items) {
    const section = sectionOf(item);
    if (seen[section].has(item.file.id)) continue;
    seen[section].add(item.file.id);
    groups[section].push(item.file);
  }
  return groups;
}
