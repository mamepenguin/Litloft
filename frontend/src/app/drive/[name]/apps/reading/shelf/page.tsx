"use client";

import { BookOpen } from "lucide-react";
import { useTranslations } from "next-intl";

import { PageFrame } from "@/components/PageFrame";
import { PageHeader } from "@/components/PageHeader";

export default function ReadingShelfPage() {
  const t = useTranslations("readingApp");
  return (
    <PageFrame
      width="wide"
      header={<PageHeader titleIcon={BookOpen} title={t("title")} />}
    />
  );
}
