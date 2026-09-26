"use client";

import { forwardRef } from "react";
import { useTranslations } from "next-intl";
import {
  FONT_FAMILIES,
  FONT_SIZE_STEPS,
  LINE_HEIGHTS,
  MARGINS,
  type Typography,
} from "@/lib/epubTypography";

/** Each font choice is drawn in the face it picks; the names are categories. */
const SAMPLE_FACE: Record<Typography["fontFamily"], string | undefined> = {
  original: undefined,
  serif: 'Georgia, "Hiragino Mincho ProN", "Yu Mincho", serif',
  sans: '"Helvetica Neue", Arial, "Hiragino Sans", "Yu Gothic", sans-serif',
};

const SEGMENT =
  "flex h-8 min-w-0 flex-1 items-center justify-center rounded-md px-2 text-xs transition-colors pointer-coarse:min-h-11";

function Segments<T extends string>({
  label,
  options,
  value,
  onChange,
  text,
  face,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  text: (option: T) => string;
  face?: (option: T) => string | undefined;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-xs text-text-muted">{label}</span>
      <div role="group" aria-label={label} className="flex min-w-0 flex-1 gap-0.5 rounded-lg border border-bg-border p-0.5">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={option === value}
            onClick={() => onChange(option)}
            style={face ? { fontFamily: face(option) } : undefined}
            className={`${SEGMENT} ${
              option === value
                ? "bg-bg-elevated text-text-primary"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            <span className="truncate">{text(option)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export interface EpubTypographyPanelProps {
  typography: Typography;
  onChange: (typography: Typography) => void;
}

export const EpubTypographyPanel = forwardRef<HTMLDivElement, EpubTypographyPanelProps>(
  function EpubTypographyPanel({ typography, onChange }, ref) {
    const t = useTranslations("file");
    const set = (patch: Partial<Typography>) => onChange({ ...typography, ...patch });
    const step = typography.fontSize;
    const percent = Math.round(FONT_SIZE_STEPS[step] * 100);
    return (
      <div
        ref={ref}
        role="dialog"
        aria-label={t("epubTypography")}
        tabIndex={-1}
        data-testid="epub-typography-panel"
        className="flex max-h-full flex-col gap-3 overflow-y-auto rounded-xl border border-bg-border bg-bg-card p-3 shadow-lg outline-none"
      >
        <div className="flex items-center gap-3">
          <span className="w-20 shrink-0 text-xs text-text-muted">{t("epubTextSize")}</span>
          <div className="flex flex-1 items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => set({ fontSize: step - 1 })}
              disabled={step === 0}
              aria-label={t("epubTextSmaller")}
              className={`${SEGMENT} max-w-14 border border-bg-border text-text-primary disabled:opacity-30`}
            >
              <span className="text-[11px]">A</span>
            </button>
            <span className="text-xs tabular-nums text-text-primary" aria-live="polite">
              {percent}%
            </span>
            <button
              type="button"
              onClick={() => set({ fontSize: step + 1 })}
              disabled={step === FONT_SIZE_STEPS.length - 1}
              aria-label={t("epubTextLarger")}
              className={`${SEGMENT} max-w-14 border border-bg-border text-text-primary disabled:opacity-30`}
            >
              <span className="text-base">A</span>
            </button>
          </div>
        </div>
        <Segments
          label={t("epubLineSpacing")}
          options={LINE_HEIGHTS}
          value={typography.lineHeight}
          onChange={(lineHeight) => set({ lineHeight })}
          text={(o) => (o === "original" ? t("epubOriginal") : o)}
        />
        <Segments
          label={t("epubMargins")}
          options={MARGINS}
          value={typography.margin}
          onChange={(margin) => set({ margin })}
          text={(o) => t(`epubMargin_${o}`)}
        />
        <Segments
          label={t("epubFont")}
          options={FONT_FAMILIES}
          value={typography.fontFamily}
          onChange={(fontFamily) => set({ fontFamily })}
          text={(o) => (o === "original" ? t("epubOriginal") : t(`epubFont_${o}`))}
          face={(o) => SAMPLE_FACE[o]}
        />
      </div>
    );
  },
);
