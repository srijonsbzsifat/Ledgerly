"use client";

import { useEffect, useRef, useState } from "react";

export type TabId = "overview" | "transactions" | "reports" | "manage";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "🏠" },
  { id: "transactions", label: "Transactions", icon: "📋" },
  { id: "reports", label: "Reports", icon: "📊" },
  { id: "manage", label: "Manage", icon: "⚙️" },
];

/**
 * The main tab navigation. On desktop it's the pill tab bar. On mobile the
 * four tabs don't fit side by side — a horizontal scroll hid the active tab
 * entirely — so it's a burger menu instead: one button showing the current
 * tab, opening a menu with all four.
 */
export function TabMenu({
  activeTab,
  onChange,
  transactionCount,
}: {
  activeTab: TabId;
  onChange: (tab: TabId) => void;
  transactionCount: number;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = TABS.find((t) => t.id === activeTab) ?? TABS[0];

  return (
    <>
      {/* Desktop: the pill tab bar. */}
      <div
        role="tablist"
        aria-label="Dashboard views"
        className="hidden rounded-full bg-zinc-200/70 p-1 dark:bg-zinc-800 sm:inline-flex"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => onChange(tab.id)}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
              activeTab === tab.id
                ? "bg-accent text-white shadow-card"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            {tab.label}
            {tab.id === "transactions" && transactionCount > 0 && (
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
                  activeTab === tab.id
                    ? "bg-white/25 text-white"
                    : "bg-zinc-300/70 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
                }`}
              >
                {transactionCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Mobile: a burger menu. */}
      <div ref={menuRef} className="relative sm:hidden">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 rounded-full bg-zinc-200/70 px-4 py-2.5 text-sm font-semibold dark:bg-zinc-800"
        >
          <span aria-hidden="true">☰</span>
          <span aria-hidden="true">{active.icon}</span>
          {active.label}
          {activeTab === "transactions" && transactionCount > 0 && (
            <span className="rounded-full bg-zinc-300/70 px-2 py-0.5 text-xs font-bold tabular-nums dark:bg-zinc-700 dark:text-zinc-200">
              {transactionCount}
            </span>
          )}
          <span
            aria-hidden="true"
            className={`text-xs transition-transform ${open ? "rotate-180" : ""}`}
          >
            ▾
          </span>
        </button>
        {open && (
          <div
            role="menu"
            aria-label="Dashboard views"
            className="absolute left-0 top-full z-30 mt-2 w-64 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
          >
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="menuitem"
                aria-current={activeTab === tab.id}
                onClick={() => {
                  onChange(tab.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium transition hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
                  activeTab === tab.id
                    ? "bg-accent-soft text-accent-ink"
                    : ""
                }`}
              >
                <span aria-hidden="true">{tab.icon}</span>
                {tab.label}
                {tab.id === "transactions" && transactionCount > 0 && (
                  <span className="ml-auto rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-bold tabular-nums dark:bg-zinc-700 dark:text-zinc-200">
                    {transactionCount}
                  </span>
                )}
                {activeTab === tab.id && (
                  <span className={tab.id === "transactions" ? "" : "ml-auto"} aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
