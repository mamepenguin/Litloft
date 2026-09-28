"use client";

import { forwardRef, type CSSProperties, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/Button";
import { SegmentedControl } from "@/components/SegmentedControl";
import {
  FONT_FAMILIES,
  FONT_PERCENT_MAX,
  FONT_PERCENT_MIN,
  FONT_PERCENT_STEP,
  LINE_HEIGHTS,
  MARGINS,
  TYPOGRAPHY_DEFAULTS,
  isDefaultTypography,
  type Typography,
} from "@/lib/epubTypography";

/** Each font choice is drawn in the face it picks; the names are categories. */
const SAMPLE_FACE: Record<Typography["fontFamily"], string | undefined> = {
  original: undefined,
  serif: 'Georgia, "Hiragino Mincho ProN", "Yu Mincho", serif',
  sans: '"Helvetica Neue", Arial, "Hiragino Sans", "Yu Gothic", sans-serif',
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-text-muted">{label}</span>
      {children}
    </div>
  );
}

export interface EpubTypographyPanelProps {
  typography: Typography;
  onChange: (typography: Typography) => void;
  className?: string;
  style?: CSSProperties;
}

export const EpubTypographyPanel = forwardRef<HTMLDivElement, EpubTypographyPanelProps>(
  function EpubTypographyPanel({ typography, onChange, className = "", style }, ref) {
    const t = useTranslations("file");
    const set = (patch: Partial<Typography>) => onChange({ ...typography, ...patch });
    const percent = typography.fontPercent;
    return (
      <div
        ref={ref}
        role="dialog"
        aria-label={t("epubTypography")}
        tabIndex={-1}
        data-testid="epub-typography-panel"
        data-swipe-exempt
        style={style}
        className={`flex flex-col gap-3 overflow-y-auto bg-bg-card p-3 outline-none ${className}`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-text-primary">{t("epubTypography")}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (!isDefaultTypography(typography)) onChange(TYPOGRAPHY_DEFAULTS);
            }}
          >
            {t("epubTypographyReset")}
          </Button>
        </div>
        <Field label={t("epubTextSize")}>
          <div className="flex items-center gap-3 pointer-coarse:min-h-11">
            <Button
              variant="ghost"
              iconOnly
              onClick={() => set({ fontPercent: percent - FONT_PERCENT_STEP })}
              disabled={percent <= FONT_PERCENT_MIN}
              aria-label={t("epubTextSmaller")}
            >
              <span aria-hidden="true" className="text-[11px]">A</span>
            </Button>
            <span
              data-testid="epub-size-value"
              aria-live="polite"
              className="flex-1 text-center text-sm tabular-nums text-text-primary"
            >
              {percent}%
            </span>
            <Button
              variant="ghost"
              iconOnly
              onClick={() => set({ fontPercent: percent + FONT_PERCENT_STEP })}
              disabled={percent >= FONT_PERCENT_MAX}
              aria-label={t("epubTextLarger")}
            >
              <span aria-hidden="true" className="text-base">A</span>
            </Button>
          </div>
        </Field>
        <Field label={t("epubLineSpacing")}>
          <SegmentedControl
            label={t("epubLineSpacing")}
            options={LINE_HEIGHTS.map((o) => ({ value: o, label: o === "original" ? t("epubOriginal") : o }))}
            value={typography.lineHeight}
            onChange={(lineHeight) => set({ lineHeight })}
          />
        </Field>
        <Field label={t("epubMargins")}>
          <SegmentedControl
            label={t("epubMargins")}
            options={MARGINS.map((o) => ({ value: o, label: t(`epubMargin_${o}`) }))}
            value={typography.margin}
            onChange={(margin) => set({ margin })}
          />
        </Field>
        <Field label={t("epubFont")}>
          <SegmentedControl
            label={t("epubFont")}
            options={FONT_FAMILIES.map((o) => ({
              value: o,
              label: o === "original" ? t("epubOriginal") : t(`epubFont_${o}`),
              style: { fontFamily: SAMPLE_FACE[o] },
            }))}
            value={typography.fontFamily}
            onChange={(fontFamily) => set({ fontFamily })}
          />
        </Field>
      </div>
    );
  },
);
