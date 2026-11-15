"use client";

import { useEffect, useRef, useState } from "react";
import { ACCENTS, type AccentName } from "@/lib/types";
import { useTheme } from "./ThemeProvider";

interface Props {
  userName: string;
  userImage: string | null;
  userEmail: string | null;
  sheetConnected: boolean;
  onDisconnect: () => void;
  onSignOut: () => void;
}

/**
 * The signed-in user's avatar, opening a menu with theme controls,
 * Disconnect sheet and Sign out. Keeps the header to one row on mobile —
 * the theme dots and the two account buttons used to eat the whole top bar.
 */
export function ProfileMenu({
  userName,
  userImage,
  userEmail,
  sheetConnected,
  onDisconnect,
  onSignOut,
}: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { mode, accent, toggleMode, setAccent } = useTheme();

  // Close on outside tap or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open ]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className={`rounded-full transition ${open ? "ring-2 ring-accent ring-offset-2 dark:ring-offset-zinc-950" : "hover:ring-2 hover:ring-zinc-300 hover:ring-offset-2 dark:hover:ring-zinc-600 dark:ring-offset-zinc-950"}`}
      >
        {userImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={userImage}
            alt=""
            className="block h-9 w-9 rounded-full border border-zinc-200 dark:border-zinc-700"
          />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-sm font-bold text-accent-strong">
            {userName.charAt(0).toUpperCase()}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
            <p className="truncate text-sm font-semibold">{userName}</p>
            {userEmail && (
              <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                {userEmail}
              </p>
            )}
          </div>

          <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Appearance
            </p>
            <div className="flex items-center justify-between gap-2">
              <div
                className="flex items-center gap-1.5"
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
                className="flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium transition hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                {mode === "dark" ? "☀️ Light" : "🌙 Dark"}
              </button>
            </div>
          </div>

          {sheetConnected && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onDisconnect();
              }}
              className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm font-medium transition hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.8}
                stroke="currentColor"
                className="h-[18px] w-[18px] text-zinc-500 dark:text-zinc-400"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.257 4.257a.75.75 0 01-1.06 0l-1.061-1.06a.75.75 0 010-1.06l3.456-3.456m-2.518-3.465a4.5 4.5 0 01-1.242-7.244l4.257-4.257a.75.75 0 011.06 0l1.061 1.06a.75.75 0 010 1.06l-3.456 3.456M6.75 15.75l1.5-1.5m-3.75-9.75l1.5-1.5M6 19.5l-1.5 1.5m12-15l1.5-1.5M15 6.75l1.5-1.5"
                />
              </svg>
              Disconnect sheet
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/50"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.8}
              stroke="currentColor"
              className="h-[18px] w-[18px]"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"
              />
            </svg>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
