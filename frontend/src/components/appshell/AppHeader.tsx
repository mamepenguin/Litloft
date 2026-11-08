"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { PageHeader } from "@/components/PageHeader";
import { TargetMenu, type TargetMenuProps } from "./TargetMenu";

export interface AppHeaderProps {
  drive: string;
  icon: LucideIcon;
  title: string;
  /** The target's count in words; `null` until it is known. */
  countDetail: string | null;
  target: TargetMenuProps;
  breadcrumb?: ReactNode;
  /** Beside the Target button. */
  actions?: ReactNode;
  tabs?: ReactNode;
}

export function AppHeader({
  drive,
  icon,
  title,
  countDetail,
  target,
  breadcrumb,
  actions,
  tabs,
}: AppHeaderProps) {
  const tc = useTranslations("common");
  const scope =
    countDetail === null ? drive : tc("driveScope", { drive, detail: countDetail });

  return (
    <PageHeader
      titleIcon={icon}
      title={title}
      breadcrumb={breadcrumb}
      scope={scope}
      actions={
        <>
          {actions}
          <TargetMenu {...target} />
        </>
      }
      tabs={tabs}
    />
  );
}
