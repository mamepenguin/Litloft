import type React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

interface SidebarSectionHeadingProps {
  label: string;
  /** Omit both `collapsed` and `onToggle` for a heading that cannot collapse. */
  collapsed?: boolean;
  onToggle?: () => void;
  dragHandle?: React.ReactNode;
  actions?: React.ReactNode;
}

/**
 * The margin lives
 * here, never on a parent, which is what kept the spacing from being
 * re-derived per section.
 *
 * `uppercase` is deliberately absent: it does nothing to Japanese, so in
 * a column that mixes scripts it stops being the thing that makes the
 * headings look alike.
 */
export function SidebarSectionHeading({
  label,
  collapsed,
  onToggle,
  dragHandle,
  actions,
}: SidebarSectionHeadingProps) {
  const t = useTranslations("sidebar");
  // `min-w-0` on both the row and the label: a flex item defaults to
  // `min-width: auto`, which for `truncate` (`white-space: nowrap`)
  // is the full width of the text.
  const labelClass =
    "flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-3 text-[11px] font-semibold text-text-muted transition-colors";
  const Chevron = collapsed ? ChevronRight : ChevronDown;

  // `title` on the row: the scoped tags heading puts its variable part
  // last ("Tags — under {folder}"), so the folder name is the half that
  // ellipses away. The
  // attribute is the hover disclosure for it.
  return (
    <div
      title={label}
      className="group relative mb-1 mt-4 flex items-center justify-between pr-3"
    >
      {dragHandle}
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? t("sectionExpand") : t("sectionCollapse")}
          className={`${labelClass} hover:text-text-primary`}
        >
          <Chevron size={12} className="shrink-0" />
          <span className="min-w-0 truncate">{label}</span>
        </button>
      ) : (
        <div className={labelClass}>
          {/* Holds the chevron's place so every label starts on the
              same vertical line, collapsible or not. */}
          <span className="w-3 shrink-0" aria-hidden />
          <span className="min-w-0 truncate">{label}</span>
        </div>
      )}
      {actions}
    </div>
  );
}
