"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  COOKIE_NAME,
  COOKIE_MAX_AGE,
  sanitizeNickname,
} from "@/lib/nickname";

interface ProfileContextValue {
  nickname: string | null;
  setNickname: (name: string) => void;
  clearNickname: () => void;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

function readCookie(name: string): string | null {
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  if (!match) return null;
  const value = decodeURIComponent(match.split("=")[1]);
  return value || null;
}

function writeCookie(name: string, value: string): void {
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? " Secure;"
      : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Strict;${secure}`;
}

function deleteCookie(name: string): void {
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Strict`;
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [nickname, setNicknameState] = useState<string | null>(null);
  // A child's mount effect runs before this provider's, so a nickname it
  // wrote must not be replaced by the stored value read there.
  const wroteNickname = useRef(false);

  useEffect(() => {
    if (wroteNickname.current) return;
    setNicknameState(readCookie(COOKIE_NAME));
  }, []);

  const setNickname = useCallback((name: string) => {
    const clean = sanitizeNickname(name);
    if (!clean) return;
    writeCookie(COOKIE_NAME, clean);
    wroteNickname.current = true;
    setNicknameState(clean);
  }, []);

  const clearNickname = useCallback(() => {
    deleteCookie(COOKIE_NAME);
    wroteNickname.current = true;
    setNicknameState(null);
  }, []);

  // `children` must keep the same parent element in every render: serving
  // them bare until the cookie has been read would remount the whole page
  // subtree when the provider appears.
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
