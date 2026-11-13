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
  /** Below the tabs on a phone, beside the Target at `sm` and wider. */
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
  // The drive keeps its own span so it can be the first thing cut on a phone;
  // the template's `{drive}` is left empty and only its separator and detail
  // are drawn at the end.
  const scope = (
    <span className="flex min-w-0 items-center gap-1">
      <span className="min-w-0 truncate">{drive}</span>{" "}
      {countDetail !== null && (
        <span className="flex-shrink-0 whitespace-nowrap">
          {tc("driveScope", { drive: "", detail: countDetail }).trimStart()}
        </span>
      )}
    </span>
  );

  return (
    <PageHeader
      titleIcon={icon}
      title={title}
      breadcrumb={breadcrumb}
      scope={scope}
      actions={actions}
      scopeEnd={<TargetMenu {...target} />}
      tabs={tabs}
    />
  );
}
