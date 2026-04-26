"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    const initial = stored === "light" || stored === "dark" || stored === "system"
      ? stored
      : "system";
    setThemeState(initial);
    applyTheme(resolveTheme(initial));
    setMounted(true);
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
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(resolveTheme(next));
  }, []);

  if (!mounted) {
    return <>{children}</>;
  }

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
