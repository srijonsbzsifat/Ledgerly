"use client";

import { useMemo } from "react";
import { expectedPayments } from "@/lib/pace";
import {
  MONTHS,
  formatBDT,
  formatDateShort,
  type MarkedPattern,
  type Transaction,
} from "@/lib/types";
import { Card } from "./ui";

/**
 * Expected this month (R12): the recurring payments the pace card counts
 * as fixed costs, shown as a visible list — what has landed and what is
 * still to come. An overdue payment (its usual day passed and it hasn't
 * landed) is still reserved for by the pace card, so the list and the
 * safe-to-spend number always agree.
 */
export function ExpectedList({
  transactions,
  year,
  month,
  marked,
  onManage,
}: {
  transactions: Transaction[];
  year: number; // e.g. 2026
  month: number; // 1-12
  /** Patterns the user marked in Manage > Recurring. */
  marked: MarkedPattern[];
  onManage: () => void;
}) {
  const expected = useMemo(
    () => expectedPayments(transactions, year, month, new Date(), marked),
    [transactions, year, month, marked]
  );

  const monthName = `${MONTHS[month - 1]} ${year}`;
  const monthShort = MONTHS[month - 1].slice(0, 3);
  const pending = expected.filter(
    (p) => p.status === "upcoming" || p.status === "overdue"
  );
  const stillToCome = pending.reduce((s, p) => s + p.amount, 0);

  return (
    <Card className="mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold tracking-tight">
          Expected in {monthName}
        </h2>
        {expected.length > 0 && pending.length > 0 && (
          <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">
            {formatBDT(Math.round(stillToCome))} still to come
          </span>
        )}
      </div>

      {expected.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">
          No recurring payments detected for {monthName} yet. Mark one in{" "}
          <button
            type="button"
            onClick={onManage}
            className="font-semibold text-accent-ink hover:underline"
          >
            Manage → Recurring
          </button>
          , or tick &ldquo;Repeats every month&rdquo; on an entry.
        </p>
      ) : (
        <>
          {pending.length === 0 && (
            <p className="mt-2 text-sm text-zinc-500">
              All expected payments have landed.
            </p>
          )}
          <ul className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800/70">
            {expected.map((p) => (
              <li key={p.key} className="flex items-center gap-2 py-2.5">
                <span aria-hidden="true" className="shrink-0 text-base">
                  {p.status === "paid"
                    ? "✅"
                    : p.status === "upcoming"
                      ? "⏳"
                      : p.status === "overdue"
                        ? "⚠️"
                        : "✗"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.label}</p>
                  <p className="text-xs text-zinc-500">
                    {p.status === "paid" && p.paidDate
                      ? `Paid ${formatDateShort(p.paidDate)}`
                      : p.status === "upcoming"
                        ? `Expected ${p.day} ${monthShort}`
                        : p.status === "overdue"
                          ? `Was due ${p.day} ${monthShort}`
                          : `Didn't land`}
                    {p.status === "paid" &&
                      p.paidAmount !== undefined &&
                      Math.round(p.paidAmount) !== Math.round(p.amount) && (
                        <> · expected {formatBDT(Math.round(p.amount))}</>
                      )}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-sm font-semibold tabular-nums ${
                    p.status === "paid"
                      ? "text-zinc-500"
                      : p.status === "overdue"
                        ? "text-amber-700 dark:text-amber-400"
                        : ""
                  }`}
                >
                  {formatBDT(
                    Math.round(
                      p.status === "paid" && p.paidAmount !== undefined
                        ? p.paidAmount
                        : p.amount
                    )
                  )}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={onManage}
            className="mt-2 text-sm font-semibold text-accent-ink hover:underline"
          >
            Manage recurring →
          </button>
        </>
      )}
    </Card>
  );
}
