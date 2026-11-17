"use client";

import { LogoLockup } from "./Logo";
import type { TabId } from "./TabMenu";
import type { ManageSection } from "./ManageView";

export type SidebarId = TabId | "notes";

const ITEMS: { id: SidebarId; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "🏠" },
  { id: "transactions", label: "Transactions", icon: "📋" },
  { id: "reports", label: "Reports", icon: "📊" },
  { id: "notes", label: "Notes", icon: "📝" },
  { id: "manage", label: "Manage", icon: "⚙️" },
];

/**
 * Desktop left navigation (lg and up). The sticky header's tab bar covers
 * smaller screens; on a wide screen the sidebar is the navigation instead
 * — logo on top, one item per view, help at the bottom. Notes jumps
 * straight to Manage → Notes rather than the Manage list.
 */
export function Sidebar({
  activeTab,
  manageSection,
  transactionCount,
  onSelect,
  onHelp,
}: {
  activeTab: TabId;
  manageSection: ManageSection | null;
  transactionCount: number;
  onSelect: (id: SidebarId) => void;
  onHelp: () => void;
}) {
  const activeId: SidebarId =
    activeTab === "manage" && manageSection === "notes" ? "notes" : activeTab;

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-zinc-200/70 bg-white dark:border-zinc-800/70 dark:bg-zinc-950 lg:flex">
      <div className="px-5 pb-4 pt-5">
        <LogoLockup />
      </div>
      <nav aria-label="Dashboard views" className="flex-1 space-y-1 px-3">
        {ITEMS.map((item) => {
          const active = activeId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active}
              onClick={() => onSelect(item.id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                active
                  ? "bg-accent-soft text-accent-ink"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
              }`}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
              {item.id === "transactions" && transactionCount > 0 && (
                <span className="ml-auto rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-bold tabular-nums dark:bg-zinc-700 dark:text-zinc-200">
                  {transactionCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>
      <div className="p-3">
        <button
          type="button"
          onClick={onHelp}
          className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          <span aria-hidden="true" className="font-bold">
            ?
          </span>
          Ask for help
          <kbd className="ml-auto rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800">
            Ctrl K
          </kbd>
        </button>
      </div>
    </aside>
  );
}
