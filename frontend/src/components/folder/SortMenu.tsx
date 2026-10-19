"use client";

import { ArrowDownUp, Shuffle } from "lucide-react";
import { useTranslations } from "next-intl";

import type { SortField, SortOrder } from "@/types";
import { sortOptionsFor } from "@/components/sortOptions";
import { MenuRadioGroup, MenuSeparator, ToolbarMenu } from "@/components/ToolbarMenu";

interface SortProps {
  sort: SortField;
  order: SortOrder;
  onChange: (sort: SortField, order: SortOrder) => void;
  allowRelevance?: boolean;
  onReshuffle?: () => void;
}

type SortValue = { sort: SortField; order: SortOrder };

function useSortRows(sort: SortField, order: SortOrder, allowRelevance?: boolean) {
  const t = useTranslations("sort");
  const options = sortOptionsFor(allowRelevance);
  const active = options.find((o) => o.sort === sort && o.order === order);
  return {
    t,
    options: options.map((o) => ({
      value: { sort: o.sort, order: o.order },
      label: t(o.labelKey),
    })),
    // An order this screen does not offer names the control instead of
    // naming itself; the alternative is a face reading as one of the offered
    // orders while the listing is in another. Reachable: a stored per-folder
    // preference admits `relevance`, while `allowRelevance` is false
    // everywhere but search.
    activeLabel: active ? t(active.labelKey) : t("label"),
  };
}

/**
 * Reshuffle is a `menuitem`, not one of the radios: it does not change which
 * order is selected, it re-runs the one that is.
 */
export function SortGroup({
  sort,
  order,
  onChange,
  allowRelevance,
  onReshuffle,
}: SortProps) {
  const { t, options } = useSortRows(sort, order, allowRelevance);
  const tt = useTranslations("toolbar");
  return (
    <>
      <MenuRadioGroup<SortValue>
        heading={t("label")}
        options={options}
        isSelected={(v) => v.sort === sort && v.order === order}
        onSelect={(v) => onChange(v.sort, v.order)}
      />
      {onReshuffle && (
        <>
          <MenuSeparator />
          <button
            role="menuitem"
            onClick={onReshuffle}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg-elevated"
          >
            <Shuffle size={14} className="w-4 flex-shrink-0" />
            {tt("reshuffle")}
          </button>
        </>
      )}
    </>
  );
}

export function SortMenu({
  sort,
  order,
  onChange,
  allowRelevance,
  onReshuffle,
  className,
  "data-bar": bar,
}: SortProps & { className?: string; "data-bar"?: "wide" }) {
  const { t, activeLabel } = useSortRows(sort, order, allowRelevance);
  return (
    <ToolbarMenu
      label={t("label")}
      value={activeLabel}
      icon={ArrowDownUp}
      className={className}
      data-bar={bar}
    >
      {(close) => (
        <SortGroup
          sort={sort}
          order={order}
          allowRelevance={allowRelevance}
          onChange={(s, o) => {
            onChange(s, o);
            close();
          }}
          onReshuffle={
            onReshuffle &&
            (() => {
              onReshuffle();
              close();
            })
          }
        />
      )}
    </ToolbarMenu>
  );
}
