"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import type { FindRow } from "@/lib/fileFind";
import { useFind } from "./FindContext";
import {
  categoryOf,
  presentCategories,
  showsCategoryChips,
} from "./categories";
import { FindTabPresenter, type FindChip } from "./FindTabPresenter";
import type { FindCategory } from "./types";

const PAGE_SIZE = 200;

export function FindTab() {
  const find = useFind();
  const t = useTranslations("find");
  const [shown, setShown] = useState(PAGE_SIZE);
  const listRef = useRef<HTMLDivElement | null>(null);

  const categories = presentCategories(find.rows);
  const chips: FindChip[] = showsCategoryChips(find.rows)
    ? [
        {
          id: "all",
          label: t("category.all"),
          count: find.rows.length,
          selected: find.filter === "all",
        },
        ...categories.map((category) => ({
          id: category,
          label: t(`category.${category}`),
          count: find.rows.filter((row) => categoryOf(row.kind) === category).length,
          selected: find.filter === category,
        })),
      ]
    : [];

  useEffect(() => {
    setShown(PAGE_SIZE);
  }, [find.rows]);

  useEffect(() => {
    if (find.currentIndex === null) return;
    setShown((current) =>
      Math.max(current, Math.min(find.visibleRows.length, find.currentIndex! + 1)),
    );
  }, [find.currentIndex, find.visibleRows.length]);

  useEffect(() => {
    if (!find.currentRow) return;
    const node = listRef.current?.querySelector<HTMLElement>('[data-find-current="true"]');
    node?.scrollIntoView?.({ block: "nearest" });
  }, [find.currentRow]);

  return (
    <FindTabPresenter
      listRef={listRef}
      chips={chips}
      rows={find.visibleRows.slice(0, shown)}
      currentRow={find.currentRow}
      truncated={find.truncated}
      onScroll={(event) => {
        const element = event.currentTarget;
        if (element.scrollTop + element.clientHeight < element.scrollHeight - 48) return;
        setShown((current) =>
          Math.min(find.visibleRows.length, current + PAGE_SIZE),
        );
      }}
      onSelectRow={find.selectRow}
      onSelectFilter={(id) => find.selectFilter(id as FindCategory)}
      onFormatLocator={(row) => locatorText(t, row)}
      rowKey={(row, index) => `${row.kind}-${row.page ?? ""}-${row.section ?? ""}-${row.ordinal}-${index}`}
    />
  );
}

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${pad(minutes)}:${pad(secs)}`;
}

function locatorText(
  t: ReturnType<typeof useTranslations>,
  row: FindRow,
): string {
  switch (row.kind) {
    case "utterance":
      return `${formatTime(row.start ?? 0)} ${t("category.utterance")}`;
    case "scene":
      return `${formatTime(row.start ?? 0)} ${t("category.scene")}`;
    case "page":
      return t("locator.page", { page: row.page ?? 0 });
    case "section":
      return row.section_title || t("locator.section", { section: row.section ?? 0 });
    case "picture_text":
      return t("category.picture_text");
    case "text":
      return t("category.text");
  }
}
