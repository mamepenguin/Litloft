"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";
import { getFileExif } from "@/lib/api";
import type { FileExif } from "@/types";
import type { FileType } from "@/types";

interface ExifSectionProps {
  fileId: string;
  fileType: FileType;
}

function formatGpsCoord(lat: number, lon: number): string {
  const latDir = lat >= 0 ? "N" : "S";
  const lonDir = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lon).toFixed(4)}° ${lonDir}`;
}

function formatDatetime(raw: string): string {
  return raw.replace("T", " ").slice(0, 16);
}

function ExifRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(80px,auto)_1fr] gap-x-4 px-4 py-2.5">
      <dt className="self-start pt-0.5 text-xs uppercase tracking-wide text-text-muted">
        {label}
      </dt>
      <dd className="text-sm text-text-primary">{value}</dd>
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 border-t border-bg-border bg-bg-card px-4 py-1.5">
      <span className="text-xs text-text-muted">{label}</span>
    </div>
  );
}

export function ExifSection({ fileId, fileType }: ExifSectionProps) {
  const t = useTranslations("exif");
  const [exif, setExif] = useState<FileExif | null>(null);

  useEffect(() => {
    if (fileType !== "image") return;
    let cancelled = false;
    getFileExif(fileId)
      .then((data) => {
        if (!cancelled) setExif(data);
      })
      .catch(() => {
        // 404 or error — don't show section
      });
    return () => {
      cancelled = true;
    };
  }, [fileId, fileType]);

  if (fileType !== "image" || !exif) return null;

  const hasCamera = exif.make || exif.model;
  const cameraStr = [exif.make, exif.model].filter(Boolean).join(" ");
  const hasExposure =
    exif.f_number != null ||
    exif.exposure_time != null ||
    exif.iso_speed != null ||
    exif.focal_length != null;
  const hasGps = exif.gps_lat != null && exif.gps_lon != null;

  const mapUrl = hasGps
    ? `https://www.openstreetmap.org/?mlat=${exif.gps_lat}&mlon=${exif.gps_lon}#map=15/${exif.gps_lat}/${exif.gps_lon}`
    : null;

  return (
    <div className="overflow-hidden rounded-xl border border-bg-border bg-bg-elevated text-sm">
      <div className="border-b border-bg-border px-4 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          {t("sectionTitle")}
        </h3>
      </div>
      <dl>
        {exif.datetime_original && (
          <ExifRow label={t("datetime")} value={formatDatetime(exif.datetime_original)} />
        )}
        {hasCamera && (
          <ExifRow label={t("camera")} value={cameraStr} />
        )}
        {hasExposure && (
          <>
            <SectionDivider label={t("exposureSection")} />
            {exif.f_number != null && (
              <ExifRow label={t("aperture")} value={`f/${parseFloat(exif.f_number.toFixed(1))}`} />
            )}
            {exif.exposure_time != null && (
              <ExifRow label={t("shutter")} value={`${exif.exposure_time}s`} />
            )}
            {exif.iso_speed != null && (
              <ExifRow label={t("iso")} value={String(exif.iso_speed)} />
            )}
            {exif.focal_length != null && (
              <ExifRow label={t("focalLength")} value={`${Math.round(exif.focal_length)}mm`} />
            )}
          </>
        )}
        {hasGps && mapUrl && (
          <>
            <SectionDivider label={t("locationSection")} />
            <div className="grid grid-cols-[minmax(80px,auto)_1fr] gap-x-4 px-4 py-2.5">
              <dt className="self-start pt-0.5 text-xs uppercase tracking-wide text-text-muted">
                {t("gps")}
              </dt>
              <dd className="flex flex-wrap items-center gap-2 text-text-primary">
                <span className="text-sm">{formatGpsCoord(exif.gps_lat!, exif.gps_lon!)}</span>
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                >
                  {t("openMap")}
                  <ExternalLink size={12} />
                </a>
              </dd>
            </div>
          </>
        )}
      </dl>
    </div>
  );
}
