"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { readStored, writeStored } from "@/lib/safeStorage";

type Theme = "system" | "light" | "dark";
type Resolved = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "theme-preference";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function resolveTheme(theme: Theme): Resolved {
  if (theme === "light" || theme === "dark") return theme;
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function applyTheme(resolved: Resolved) {
  document.documentElement.setAttribute("data-theme", resolved);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");

  useEffect(() => {
    const stored = readStored(STORAGE_KEY) as Theme | null;
    const initial = stored === "light" || stored === "dark" || stored === "system"
      ? stored
      : "system";
    setThemeState(initial);
    applyTheme(resolveTheme(initial));
  }, []);

  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia(DARK_QUERY);
    const handler = () => applyTheme(resolveTheme("system"));
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    writeStored(STORAGE_KEY, next);
    applyTheme(resolveTheme(next));
  }, []);

  // `children` must keep the same parent element in every render: serving
  // them bare until the stored theme has been read would remount the whole
  // page subtree when the provider appears.
  return (
    <ThemeContext value={{ theme, setTheme }}>
      {children}
    </ThemeContext>
  );
}

const defaultValue: ThemeContextValue = {
  theme: "system",
  setTheme: () => {},
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  return ctx ?? defaultValue;
}
