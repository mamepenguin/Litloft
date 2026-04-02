"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Menu, User } from "lucide-react";
import { useTranslations } from "next-intl";

import { useSidebar } from "./SidebarProvider";
import { useProfile } from "./ProfileProvider";
import { ProfileSetup } from "./ProfileSetup";
import { GlobalSearch } from "./GlobalSearch";
import { ThemeToggle } from "./ThemeToggle";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ConfirmDialog } from "./ConfirmDialog";

export function Header() {
  const { toggle } = useSidebar();
  const t = useTranslations("header");
  const tp = useTranslations("profile");
  const { nickname, clearNickname } = useProfile();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
      setDropdownOpen(false);
    }
  }, []);

  useEffect(() => {
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [dropdownOpen, handleClickOutside]);

  const handleChangeName = useCallback(() => {
    setDropdownOpen(false);
    setProfileOpen(true);
  }, []);

  const handleClearProfile = useCallback(() => {
    setDropdownOpen(false);
    setConfirmClear(true);
  }, []);

  const handleConfirmClear = useCallback(() => {
    clearNickname();
    setConfirmClear(false);
  }, [clearNickname]);

  return (
    <header className="flex h-14 flex-shrink-0 items-center border-b border-bg-border bg-bg-primary px-4">
      <button
        onClick={toggle}
        className="rounded-lg p-2 text-text-muted hover:bg-bg-elevated hover:text-text-primary md:hidden"
        aria-label={t("menu")}
      >
        <Menu size={20} />
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <GlobalSearch />

        <div className="relative" ref={dropdownRef}>
          {nickname ? (
            <button
              onClick={() => setDropdownOpen((prev) => !prev)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white transition-opacity hover:opacity-80"
              aria-label={nickname}
            >
              {nickname.charAt(0).toUpperCase()}
            </button>
          ) : (
            <button
              onClick={() => setProfileOpen(true)}
              className="rounded-lg p-2 text-text-muted hover:bg-bg-elevated hover:text-text-primary"
              aria-label={tp("setup")}
            >
              <User size={20} />
            </button>
          )}

          {dropdownOpen && nickname && (
            <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-xl border border-bg-border bg-bg-card py-1 shadow-xl">
              <div className="border-b border-bg-border px-3 py-2 text-sm font-medium text-text-primary truncate">
                {nickname}
              </div>
              <button
                onClick={handleChangeName}
                className="w-full px-3 py-2 text-left text-sm text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
              >
                {tp("change")}
              </button>
              <button
                onClick={handleClearProfile}
                className="w-full px-3 py-2 text-left text-sm text-red-400 transition-colors hover:bg-bg-elevated"
              >
                {tp("clear")}
              </button>
            </div>
          )}
        </div>

        <LanguageSwitcher />
        <ThemeToggle />
      </div>

      <ProfileSetup
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
      />

      <ConfirmDialog
        open={confirmClear}
        title={tp("clear")}
        message={tp("clearConfirm")}
        confirmLabel={tp("clear")}
        onConfirm={handleConfirmClear}
        onCancel={() => setConfirmClear(false)}
      />
    </header>
  );
}
