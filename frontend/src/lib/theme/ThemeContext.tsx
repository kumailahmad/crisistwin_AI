"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark";

interface ThemeCtx {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeCtx>({
  theme: "light",
  setTheme: () => {},
  toggleTheme: () => {},
});

const STORAGE_KEY = "ct_theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("light");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "dark" || saved === "light") {
        setThemeState(saved);
        document.documentElement.classList.toggle("dark", saved === "dark");
        return;
      }
    } catch {
      /* ignore */
    }
    document.documentElement.classList.remove("dark");
  }, []);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", mode === "dark");
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
