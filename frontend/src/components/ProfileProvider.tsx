"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

interface ProfileContextValue {
  nickname: string | null;
  setNickname: (name: string) => void;
  clearNickname: () => void;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

const COOKIE_NAME = "lit_viewer";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function readCookie(name: string): string | null {
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  if (!match) return null;
  const value = decodeURIComponent(match.split("=")[1]);
  return value || null;
}

function writeCookie(name: string, value: string): void {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Strict`;
}

function deleteCookie(name: string): void {
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Strict`;
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [nickname, setNicknameState] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = readCookie(COOKIE_NAME);
    setNicknameState(stored);
    setMounted(true);
  }, []);

  const setNickname = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    writeCookie(COOKIE_NAME, trimmed);
    setNicknameState(trimmed);
  }, []);

  const clearNickname = useCallback(() => {
    deleteCookie(COOKIE_NAME);
    setNicknameState(null);
  }, []);

  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <ProfileContext value={{ nickname, setNickname, clearNickname }}>
      {children}
    </ProfileContext>
  );
}

const defaultValue: ProfileContextValue = {
  nickname: null,
  setNickname: () => {},
  clearNickname: () => {},
};

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  return ctx ?? defaultValue;
}
