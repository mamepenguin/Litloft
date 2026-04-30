"use client";

// SetupWizard: drives the first-run flow. Owns the cross-step state
// (locale, drive draft, access mode, master password, addon policy)
// and orchestrates the final submit.
//
// Step order: Language -> Drive -> AccessMode -> [Password] -> AddonPolicy -> Complete
// Password is skipped when access mode is "public".

import { useCallback, useMemo, useState } from "react";

import { LanguageStep } from "./steps/LanguageStep";
import { DriveStep, type DriveDraft } from "./steps/DriveStep";
import {
  AccessModeStep,
  type AccessMode,
} from "./steps/AccessModeStep";
import {
  PasswordStep,
  type PasswordDraft,
} from "./steps/PasswordStep";
import { AddonPolicyStep } from "./steps/AddonPolicyStep";
import { CompleteStep } from "./steps/CompleteStep";
import type { Locale } from "@/i18n/config";
import type { AddonPolicy } from "@/lib/adminConfig";

type StepId =
  | "language"
  | "drive"
  | "accessMode"
  | "password"
  | "addonPolicy"
  | "complete";

const ORDER_PROTECTED: StepId[] = [
  "language",
  "drive",
  "accessMode",
  "password",
  "addonPolicy",
  "complete",
];

const ORDER_PUBLIC: StepId[] = [
  "language",
  "drive",
  "accessMode",
  "addonPolicy",
  "complete",
];

export function SetupWizard(): React.ReactElement {
  const [stepIndex, setStepIndex] = useState(0);
  const [locale, setLocaleState] = useState<Locale>("ja");

  // Persist locale to the NEXT_LOCALE cookie so next-intl picks it up
  // immediately (the wizard re-renders) and after the post-complete
  // redirect to /admin. Without this the LanguageStep selection silently
  // drops on the cookie boundary.
  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    if (typeof document !== "undefined") {
      const oneYear = 365 * 24 * 60 * 60;
      document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=${oneYear}`;
    }
  }, []);
  const [drive, setDrive] = useState<DriveDraft>({
    name: "",
    path: "",
    access_group: "",
  });
  const [accessMode, setAccessMode] = useState<AccessMode>("public");
  const [password, setPassword] = useState<PasswordDraft>({
    password: "",
    groups: [],
  });
  const [addonPolicy, setAddonPolicy] = useState<AddonPolicy>({});

  const order = useMemo(
    () => (accessMode === "protected" ? ORDER_PROTECTED : ORDER_PUBLIC),
    [accessMode],
  );

  const current = order[Math.min(stepIndex, order.length - 1)];

  const goNext = useCallback(() => {
    setStepIndex((idx) => Math.min(idx + 1, order.length - 1));
  }, [order.length]);

  const goBack = useCallback(() => {
    setStepIndex((idx) => Math.max(idx - 1, 0));
  }, []);

  // Sync the master password's groups with the drive group so the UI can
  // pre-check it without further user action.
  const passwordValue = useMemo<PasswordDraft>(() => {
    if (password.groups.length === 0 && drive.access_group) {
      return { ...password, groups: [drive.access_group] };
    }
    return password;
  }, [drive.access_group, password]);

  const groupsForPassword = useMemo(() => {
    const set = new Set<string>();
    if (drive.access_group) set.add(drive.access_group);
    return Array.from(set);
  }, [drive.access_group]);

  // Drive list to ship to the backend on final submit. The wizard
  // currently collects exactly one drive entry — keep this as a list for
  // future expansion.
  const drivesForSubmit = useMemo(() => [drive], [drive]);

  const handleBeforeSubmit = useCallback(async () => {
    // Re-PUT drives to make sure the on-disk state matches the wizard
    // state even if the user changed something between DriveStep
    // validation and here.
    await fetch("/api/admin/config/drives", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(drivesForSubmit),
    });

    if (accessMode === "protected" && password.password) {
      await fetch("/api/admin/config/passwords", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([
          { password: password.password, groups: passwordValue.groups },
        ]),
      });
    }

    await fetch("/api/admin/config/addon-policy", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addonPolicy),
    });
  }, [accessMode, addonPolicy, drivesForSubmit, password, passwordValue.groups]);

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-6">
      {current === "language" && (
        <LanguageStep
          value={locale}
          onChange={setLocale}
          onNext={goNext}
        />
      )}
      {current === "drive" && (
        <DriveStep
          value={drive}
          onChange={setDrive}
          onNext={goNext}
          onBack={goBack}
          skipValidate
        />
      )}
      {current === "accessMode" && (
        <AccessModeStep
          value={accessMode}
          onChange={setAccessMode}
          onNext={goNext}
          onBack={goBack}
        />
      )}
      {current === "password" && (
        <PasswordStep
          groups={groupsForPassword}
          value={passwordValue}
          onChange={setPassword}
          onNext={goNext}
          onBack={goBack}
        />
      )}
      {current === "addonPolicy" && (
        <AddonPolicyStep
          drives={drivesForSubmit}
          value={addonPolicy}
          onChange={setAddonPolicy}
          onNext={goNext}
          onBack={goBack}
        />
      )}
      {current === "complete" && (
        <CompleteStep
          onBack={goBack}
          onBeforeSubmit={handleBeforeSubmit}
        />
      )}
    </div>
  );
}

export default SetupWizard;
