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
      className="cursor-grab active:cursor-grabbing shrink-0"
    >
      <GripVertical size={12} className="text-text-muted" />
    </span>
  );
}
