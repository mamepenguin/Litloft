"use client";

import { forwardRef, type CSSProperties, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/Button";
import { SegmentedControl } from "@/components/SegmentedControl";
import {
  FONT_FAMILIES,
  FONT_SIZE_STEPS,
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

function Field({ label, aside, children }: { label: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-text-muted">{label}</span>
        {aside}
      </div>
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
    const step = typography.fontSize;
    const percent = Math.round(FONT_SIZE_STEPS[step] * 100);
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
        <Field
          label={t("epubTextSize")}
          aside={
            <span className="text-xs tabular-nums text-text-primary" aria-live="polite">
              {percent}%
            </span>
          }
        >
          <div className="flex items-center gap-3 pointer-coarse:min-h-11">
            <Button
              variant="ghost"
              iconOnly
              onClick={() => set({ fontSize: step - 1 })}
              disabled={step === 0}
              aria-label={t("epubTextSmaller")}
            >
              <span aria-hidden="true" className="text-[11px]">A</span>
            </Button>
            <div className="flex flex-1 items-center justify-between px-1" aria-hidden="true">
              {FONT_SIZE_STEPS.map((_, i) => (
                <span
                  key={i}
                  data-testid="epub-size-step"
                  data-current={i === step}
                  className={`h-1.5 w-1.5 rounded-full ${i === step ? "bg-text-primary" : "bg-sand-hover"}`}
                />
              ))}
            </div>
            <Button
              variant="ghost"
              iconOnly
              onClick={() => set({ fontSize: step + 1 })}
              disabled={step === FONT_SIZE_STEPS.length - 1}
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
