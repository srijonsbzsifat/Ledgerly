"use client";

import {
  formatBDT,
  formatDateShort,
  formatDayHeader,
  type Transaction,
} from "@/lib/types";
import { DeleteIcon, EditIcon, IconButton } from "./IconButton";

/**
 * Recent transactions for the Overview: the newest few entries of the
 * selected month, with edit/delete on each row and a "Show all" link into
 * the Transactions tab. Also reused for the Today list (R10) — pass
 * `emptyText` for its empty state and omit `onShowAll` to hide the button.
 *
 * With `groupByDay`, entries are grouped under a light header per day
 * (same pattern as the Transactions tab) and the date drops out of each
 * row's subtitle — the header owns it. Only the multi-day Recent list
 * uses it; the Today list and the calendar's day detail are single-day.
 */
export function RecentList({
  transactions,
  total,
  monthLabel,
  emptyText,
  groupByDay = false,
  onEdit,
  onDelete,
  onShowAll,
}: {
  transactions: Transaction[];
  total: number;
  monthLabel: string;
  emptyText?: string;
  groupByDay?: boolean;
  onEdit: (t: Transaction) => void;
  onDelete: (t: Transaction) => void;
  onShowAll?: () => void;
}) {
  if (transactions.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        {emptyText ?? `No transactions in ${monthLabel.toLowerCase()} yet.`}
      </p>
    );
  }

  const renderRow = (t: Transaction) => {
    const subtitle = groupByDay
      ? t.description
        ? t.category
        : null
      : t.description
        ? `${t.category} · ${formatDateShort(t.date)}`
        : formatDateShort(t.date);
    return (
      <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {t.description || t.category}
          </p>
          {subtitle && (
            <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
              {subtitle}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`whitespace-nowrap text-sm font-semibold tabular-nums ${
              t.type === "Credit"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {t.type === "Credit" ? "+" : "−"}
            {formatBDT(t.amount)}
          </span>
          {t.tab && t.row ? (
            <span className="flex gap-1">
              <IconButton label="Edit" onClick={() => onEdit(t)}>
                <EditIcon />
              </IconButton>
              <IconButton label="Delete" tone="danger" onClick={() => onDelete(t)}>
                <DeleteIcon />
              </IconButton>
            </span>
          ) : null}
        </div>
      </li>
    );
  };

  // Consecutive entries sharing a date form one group (the list arrives
  // date-sorted, newest first).
  const groups = groupByDay
    ? transactions.reduce<{ date: string; entries: Transaction[] }[]>(
        (acc, t) => {
          const last = acc[acc.length - 1];
          if (last && last.date === t.date) last.entries.push(t);
          else acc.push({ date: t.date, entries: [t] });
          return acc;
        },
        []
      )
    : null;

  return (
    <div>
      {groups ? (
        <div>
          {groups.map((g, i) => (
            <div key={g.date}>
              <p
                className={`text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 ${
                  i === 0
                    ? "pt-1"
                    : "border-t border-zinc-100 pt-3 dark:border-zinc-800/70"
                }`}
              >
                {formatDayHeader(g.date)}
              </p>
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                {g.entries.map(renderRow)}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
          {transactions.map(renderRow)}
        </ul>
      )}
      {onShowAll && total > transactions.length && (
        <button
          type="button"
          onClick={onShowAll}
          className="mt-3 w-full rounded-xl border border-zinc-200 py-2 text-sm font-semibold text-accent-ink transition hover:bg-accent-soft/50 dark:border-zinc-700"
        >
          Show all {total} from {monthLabel}
        </button>
      )}
    </div>
  );
}
