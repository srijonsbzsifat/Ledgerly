"use client";

import { useMemo } from "react";
import {
  accountBalances,
  formatBDT,
  type Account,
  type ManagedCategory,
  type MarkedPattern,
  type Transaction,
} from "@/lib/types";
import { AccountsSection } from "./AccountsSection";
import { CategoriesSection } from "./CategoriesSection";
import { ImportExportSection } from "./ImportExportSection";
import { NotesSection } from "./NotesSection";
import { RecurringSection } from "./RecurringSection";
import { TrashSection } from "./TrashSection";
import { Card, Spinner } from "./ui";

export type ManageSection = "categories" | "accounts" | "recurring" | "import" | "trash" | "notes";

type SectionMeta = {
  id: ManageSection;
  label: string;
  icon: string;
  group: "Organise" | "Data & notes";
  subtitle: string;
};

/**
 * Manage: the lists and tools behind the dashboard — categories, accounts,
 * recurring payments, import/export, the 30-day trash, and notes. A
 * settings-style list: tap a row to open that section, back to return. Six
 * sections in one tab felt crowded as a pill bar; a grouped list keeps
 * every feature one tap away without showing them all at once.
 */
export function ManageView({
  categories,
  accounts,
  recurringPatterns,
  transactions,
  sheetTitle,
  section,
  onSectionChange,
  onCategoriesChanged,
  onAccountsChanged,
  onRecurringChanged,
  onTransactionsChanged,
}: {
  categories: ManagedCategory[] | null;
  accounts: Account[] | null;
  recurringPatterns: MarkedPattern[] | null;
  transactions: Transaction[];
  sheetTitle: string;
  /** Null = the list; otherwise the open section. Controlled by Dashboard. */
  section: ManageSection | null;
  onSectionChange: (section: ManageSection | null) => void;
  onCategoriesChanged: (cats: ManagedCategory[]) => void;
  onAccountsChanged: (accounts: Account[]) => void;
  onRecurringChanged: (patterns: MarkedPattern[]) => void;
  onTransactionsChanged: () => void;
}) {
  const listsLoading = categories === null || accounts === null;

  const netPosition = useMemo(() => {
    if (!accounts) return null;
    return accountBalances(transactions, accounts).reduce(
      (sum, b) => sum + b.balance,
      0
    );
  }, [transactions, accounts]);

  const sections: SectionMeta[] = [
    {
      id: "categories",
      label: "Categories",
      icon: "🏷️",
      group: "Organise",
      subtitle: categories
        ? `${categories.length} categor${categories.length === 1 ? "y" : "ies"}`
        : "Money out and money in lists",
    },
    {
      id: "accounts",
      label: "Accounts",
      icon: "💳",
      group: "Organise",
      subtitle:
        accounts && netPosition !== null
          ? `${accounts.length} account${accounts.length === 1 ? "" : "s"} · Net ${formatBDT(netPosition)}`
          : "Cash, bank, mobile money",
    },
    {
      id: "recurring",
      label: "Recurring",
      icon: "🔁",
      group: "Organise",
      subtitle: recurringPatterns
        ? (() => {
            const live = recurringPatterns.filter((p) => p.status !== "dismissed");
            const paused = live.filter((p) => p.status === "paused").length;
            return live.length === 0
              ? "No patterns marked yet"
              : `${live.length} pattern${live.length === 1 ? "" : "s"}${
                  paused > 0 ? ` · ${paused} paused` : ""
                }`;
          })()
        : "Monthly payments the pace card counts once",
    },
    {
      id: "import",
      label: "Import & export",
      icon: "⇅",
      group: "Data & notes",
      subtitle: "Backup, statements and CSV import",
    },
    {
      id: "trash",
      label: "Trash",
      icon: "🗑️",
      group: "Data & notes",
      subtitle: "Deleted entries, kept for 30 days",
    },
    {
      id: "notes",
      label: "Notes",
      icon: "📝",
      group: "Data & notes",
      subtitle: "Lists and reminders, kept in your sheet",
    },
  ];

  if (section === null) {
    return (
      <div className="mt-4 space-y-5">
        {(["Organise", "Data & notes"] as const).map((group) => (
          <div key={group}>
            <p className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {group}
            </p>
            <Card className="!p-0">
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                {sections
                  .filter((s) => s.group === group)
                  .map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => onSectionChange(s.id)}
                        className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-800/50 sm:px-6"
                      >
                        <span aria-hidden="true" className="text-xl">
                          {s.icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-semibold">
                            {s.label}
                          </span>
                          <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                            {s.subtitle}
                          </span>
                        </span>
                        <span
                          aria-hidden="true"
                          className="text-lg text-zinc-400 dark:text-zinc-500"
                        >
                          ›
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            </Card>
          </div>
        ))}
      </div>
    );
  }

  const active = sections.find((s) => s.id === section) ?? sections[0];

  return (
    <div>
      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onSectionChange(null)}
          className="rounded-full bg-zinc-200/70 px-3.5 py-1.5 text-sm font-semibold transition hover:bg-zinc-300/70 dark:bg-zinc-800 dark:hover:bg-zinc-700"
        >
          ‹ Manage
        </button>
        <h2 className="text-base font-bold tracking-tight">
          <span aria-hidden="true">{active.icon} </span>
          {active.label}
        </h2>
      </div>

      <Card className="mt-4">
        {(section === "categories" || section === "accounts") && listsLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-sm font-medium text-zinc-500">
            <Spinner className="h-6 w-6 text-accent" />
            Loading…
          </div>
        ) : section === "categories" ? (
          <CategoriesSection
            categories={categories ?? []}
            transactions={transactions}
            onCategoriesChanged={onCategoriesChanged}
            onTransactionsChanged={onTransactionsChanged}
          />
        ) : section === "accounts" ? (
          <AccountsSection
            accounts={accounts ?? []}
            transactions={transactions}
            onAccountsChanged={onAccountsChanged}
            onTransactionsChanged={onTransactionsChanged}
          />
        ) : section === "recurring" ? (
          <RecurringSection
            patterns={recurringPatterns}
            transactions={transactions}
            expenseCategories={
              categories
                ? categories
                    .filter((c) => c.type === "Debit")
                    .map((c) => c.name)
                : [...new Set(transactions.filter((t) => t.type === "Debit").map((t) => t.category))].sort()
            }
            onPatternsChanged={onRecurringChanged}
          />
        ) : section === "import" ? (
          <ImportExportSection
            transactions={transactions}
            sheetTitle={sheetTitle}
            onTransactionsChanged={onTransactionsChanged}
          />
        ) : section === "trash" ? (
          <TrashSection onTransactionsChanged={onTransactionsChanged} />
        ) : (
          <NotesSection />
        )}
      </Card>
    </div>
  );
}
