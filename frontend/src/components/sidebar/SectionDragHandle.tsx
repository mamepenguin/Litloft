"use client";

import { GripVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import type React from "react";

interface SectionDragHandleProps {
  draggable: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

export function SectionDragHandle({
  draggable,
  onDragStart,
  onDragEnd,
}: SectionDragHandleProps) {
  const t = useTranslations("sidebar");

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  return (
    <span
      role="button"
      tabIndex={-1}
      aria-label={t("reorder.dragSection")}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={handleClick}
      className="absolute left-0 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 cursor-grab active:cursor-grabbing"
    >
      <GripVertical size={12} className="text-text-muted" />
    </span>
  );
}
