"use client";

import { ACCENTS, type AccentName } from "@/lib/types";
import { useTheme } from "./ThemeProvider";

export function ThemeSwitcher() {
  const { mode, accent, toggleMode, setAccent } = useTheme();

  return (
    <div className="flex items-center gap-2">
      <div
        className="flex items-center gap-1 rounded-full border border-zinc-200 bg-white p-1 shadow-card dark:border-zinc-800 dark:bg-zinc-900"
        role="group"
        aria-label="Accent colour"
      >
        {(Object.keys(ACCENTS) as AccentName[]).map((name) => (
          <button
            key={name}
            type="button"
            title={ACCENTS[name].label}
            aria-label={`${ACCENTS[name].label} theme`}
            aria-pressed={accent === name}
            onClick={() => setAccent(name)}
            className={`h-6 w-6 rounded-full transition-transform hover:scale-110 ${
              accent === name
                ? "ring-2 ring-zinc-900 ring-offset-2 dark:ring-white dark:ring-offset-zinc-900"
                : "opacity-70 hover:opacity-100"
            }`}
            style={{ backgroundColor: ACCENTS[name].swatch }}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={toggleMode}
        aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-lg shadow-card transition hover:shadow-card-hover dark:border-zinc-800 dark:bg-zinc-900"
      >
        {mode === "dark" ? "☀️" : "🌙"}
      </button>
    </div>
  );
}
