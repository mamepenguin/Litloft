"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Camera, ExternalLink, MapPin } from "lucide-react";
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

function ExifRow({ label, value, numeric = false }: { label: string; value: string; numeric?: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(80px,auto)_1fr] gap-x-4 px-4 py-2.5">
      <dt className="self-start pt-0.5 text-xs uppercase tracking-wide text-text-muted">
        {label}
      </dt>
      <dd
        className="text-sm text-text-primary"
        style={numeric ? { fontVariantNumeric: "tabular-nums" } : undefined}
      >
        {value}
      </dd>
    </div>
  );
}

function GroupLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 border-t border-bg-border px-4 pt-3 pb-1">
      <span className="text-[11px] font-semibold text-text-muted">{label}</span>
      <div className="flex-1 border-t border-bg-border" />
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
    <div className="animate-fade-in overflow-hidden rounded-xl border border-bg-border bg-bg-elevated text-sm">
      <div className="flex items-center gap-2 border-b border-bg-border px-4 py-2.5">
        <Camera size={13} className="shrink-0 text-text-muted" />
        <h3 className="text-xs font-semibold text-text-muted">
          {t("sectionTitle")}
        </h3>
      </div>
      <dl className="pb-1">
        {exif.datetime_original && (
          <ExifRow label={t("datetime")} value={formatDatetime(exif.datetime_original)} />
        )}
        {hasCamera && (
          <ExifRow label={t("camera")} value={cameraStr} />
        )}
        {hasExposure && (
          <>
            <GroupLabel label={t("exposureSection")} />
            {exif.f_number != null && (
              <ExifRow label={t("aperture")} value={`f/${parseFloat(exif.f_number.toFixed(1))}`} numeric />
            )}
            {exif.exposure_time != null && (
              <ExifRow label={t("shutter")} value={`${exif.exposure_time}s`} numeric />
            )}
            {exif.iso_speed != null && (
              <ExifRow label={t("iso")} value={String(exif.iso_speed)} numeric />
            )}
            {exif.focal_length != null && (
              <ExifRow label={t("focalLength")} value={`${Math.round(exif.focal_length)}mm`} numeric />
            )}
          </>
        )}
        {hasGps && mapUrl && (
          <>
            <GroupLabel label={t("locationSection")} />
            <div className="grid grid-cols-[minmax(80px,auto)_1fr] gap-x-4 px-4 py-2.5">
              <dt className="self-start pt-0.5 text-xs uppercase tracking-wide text-text-muted">
                {t("gps")}
              </dt>
              <dd className="flex flex-wrap items-center gap-2">
                <span
                  className="text-sm text-text-primary"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {formatGpsCoord(exif.gps_lat!, exif.gps_lon!)}
                </span>
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-full bg-sand px-2 py-0.5 text-xs text-text-muted transition-colors hover:bg-sand-hover hover:text-text-primary"
                >
                  <MapPin size={10} />
                  {t("openMap")}
                  <ExternalLink size={10} />
                </a>
              </dd>
            </div>
          </>
        )}
      </dl>
    </div>
  );
}
