"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { AccentName } from "@/lib/types";

type Mode = "light" | "dark";

interface ThemeContextValue {
  mode: Mode;
  accent: AccentName;
  toggleMode: () => void;
  setAccent: (a: AccentName) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: "light",
  accent: "emerald",
  toggleMode: () => {},
  setAccent: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

const MODE_KEY = "cash-theme";
const ACCENT_KEY = "cash-accent";

function readInitial(): { mode: Mode; accent: AccentName } {
  if (typeof window === "undefined") return { mode: "light", accent: "emerald" };
  const storedMode = window.localStorage.getItem(MODE_KEY);
  const storedAccent = window.localStorage.getItem(ACCENT_KEY);
  const mode: Mode =
    storedMode === "dark" || storedMode === "light"
      ? storedMode
      : window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
  const accent: AccentName =
    storedAccent === "indigo" ? storedAccent : "emerald";
  return { mode, accent };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("light");
  const [accent, setAccentState] = useState<AccentName>("emerald");

  // Sync with the pre-hydration script in layout.tsx (avoids a theme flash).
  useEffect(() => {
    const initial = readInitial();
    setMode(initial.mode);
    setAccentState(initial.accent);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", mode === "dark");
    window.localStorage.setItem(MODE_KEY, mode);
  }, [mode]);

  useEffect(() => {
    document.documentElement.setAttribute("data-accent", accent);
    window.localStorage.setItem(ACCENT_KEY, accent);
  }, [accent]);

  const toggleMode = useCallback(
    () => setMode((m) => (m === "dark" ? "light" : "dark")),
    []
  );
  const setAccent = useCallback((a: AccentName) => setAccentState(a), []);

  return (
    <ThemeContext.Provider value={{ mode, accent, toggleMode, setAccent }}>
      {children}
    </ThemeContext.Provider>
  );
}
