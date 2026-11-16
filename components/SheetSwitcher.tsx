"use client";

import { useEffect, useRef, useState } from "react";
import type { ConnectedSheet } from "@/lib/types";

interface Props {
  sheets: ConnectedSheet[];
  activeId: string;
  switching: boolean;
  onSwitch: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}

/**
 * The active sheet's name in the header, opening a dropdown to switch
 * between the user's connected sheets, remove one, or add another.
 *
 * Removing a sheet only unlinks it from Ledgerly — the spreadsheet itself
 * is untouched in Google Drive, and it can be connected again any time.
 * Removal is two-tap: the first tap arms it, the second confirms.
 */
export function SheetSwitcher({
  sheets,
  activeId,
  switching,
  onSwitch,
  onRemove,
  onAdd,
}: Props) {
  const [open, setOpen] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const active = sheets.find((s) => s.id === activeId) ?? {
    id: activeId,
    title: "Sheet",
  };

  // Close on outside tap or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setConfirmRemoveId(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setConfirmRemoveId(null);
      }
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
    <div ref={containerRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Current sheet: ${active.title}. Switch sheet.`}
        disabled={switching}
        className="flex max-w-40 items-center gap-1.5 truncate rounded-full bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent-ink transition hover:bg-accent-soft/70 sm:max-w-56"
      >
        {switching ? (
          <span
            aria-hidden="true"
            className="inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        ) : (
          <span aria-hidden="true">📗</span>
        )}
        <span className="truncate">
          {switching ? "Switching…" : active.title}
        </span>
        <span aria-hidden="true" className="shrink-0 text-[10px]">
          ▾
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
        >
          <p className="border-b border-zinc-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:border-zinc-800">
            Your sheets
          </p>
          <ul className="max-h-64 overflow-y-auto py-1">
            {sheets.map((s) => {
              const isActive = s.id === activeId;
              const confirming = confirmRemoveId === s.id;
              return (
                <li
                  key={s.id}
                  className="flex items-center gap-1 px-2 py-0.5"
                >
                  <button
                    type="button"
                    role="menuitem"
                    disabled={switching}
                    onClick={() => {
                      setOpen(false);
                      setConfirmRemoveId(null);
                      onSwitch(s.id);
                    }}
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-2 text-left text-sm transition hover:bg-zinc-50 disabled:opacity-50 dark:hover:bg-zinc-800 ${
                      isActive ? "font-semibold" : "font-medium"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="w-4 shrink-0 text-center text-accent-ink"
                    >
                      {isActive ? "✓" : ""}
                    </span>
                    <span className="truncate">{s.title}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={
                      confirming
                        ? `Confirm removing ${s.title} from Ledgerly`
                        : `Remove ${s.title} from Ledgerly`
                    }
                    title="Remove from Ledgerly (the sheet itself is untouched)"
                    disabled={switching}
                    onClick={() => {
                      if (confirming) {
                        setConfirmRemoveId(null);
                        onRemove(s.id);
                      } else {
                        setConfirmRemoveId(s.id);
                      }
                    }}
                    className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold transition disabled:opacity-50 ${
                      confirming
                        ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                        : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                    }`}
                  >
                    {confirming ? "Remove?" : "✕"}
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            role="menuitem"
            disabled={switching}
            onClick={() => {
              setOpen(false);
              setConfirmRemoveId(null);
              onAdd();
            }}
            className="flex w-full items-center gap-2 border-t border-zinc-100 px-4 py-3 text-left text-sm font-semibold text-accent-ink transition hover:bg-accent-soft/50 disabled:opacity-50 dark:border-zinc-800"
          >
            <span aria-hidden="true">+</span> Add another sheet
          </button>
        </div>
      )}
    </div>
  );
}
