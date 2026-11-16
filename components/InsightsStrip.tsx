"use client";

import { useMemo } from "react";
import {
  MONTHS,
  formatBDT,
  isTransfer,
  parseISODate,
  type Transaction,
} from "@/lib/types";
import { Card } from "./ui";

/** An unusual-spend flag fires above this multiple of the usual amount. */
const UNUSUAL_RATIO = 2;
/** ...and only when the category's spend is big enough to matter. */
const UNUSUAL_MIN_AMOUNT = 1000;

/**
 * Insights strip (R7): the selected month's top spending categories plus
 * unusual-spend flags — a category running at more than twice its usual
 * (its average over up to 6 prior months). Best apps go quiet when
 * nothing is wrong, so the flags area shows a calm line instead of an
 * empty box, and a category with no history is never flagged (there is
 * nothing to compare it against).
 */
export function InsightsStrip({
  transactions,
  year,
  month,
}: {
  transactions: Transaction[];
  year: number; // e.g. 2026
  month: number; // 1-12
}) {
  const { top, flags, total } = useMemo(() => {
    const selIdx = year * 12 + (month - 1);
    const thisMonth = new Map<string, number>();
    // Prior months' spend by category, per month index (up to 6 back).
    const priorByCat = new Map<string, Map<number, number>>();
    for (const t of transactions) {
      const p = parseISODate(t.date);
      if (!p || isTransfer(t) || t.type !== "Debit") continue;
      const idx = p.year * 12 + (p.month - 1);
      if (idx === selIdx) {
        thisMonth.set(t.category, (thisMonth.get(t.category) ?? 0) + t.amount);
      } else if (idx < selIdx && idx >= selIdx - 6) {
        let byMonth = priorByCat.get(t.category);
        if (!byMonth) {
          byMonth = new Map();
          priorByCat.set(t.category, byMonth);
        }
        byMonth.set(idx, (byMonth.get(idx) ?? 0) + t.amount);
      }
    }
    const total = [...thisMonth.values()].reduce((a, b) => a + b, 0);
    const top = [...thisMonth.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3);
    const flags: { name: string; amount: number; avg: number; ratio: number }[] = [];
    for (const [name, amount] of thisMonth) {
      const byMonth = priorByCat.get(name);
      if (!byMonth || byMonth.size === 0) continue;
      const avg =
        [...byMonth.values()].reduce((a, b) => a + b, 0) / byMonth.size;
      if (avg <= 0) continue;
      const ratio = amount / avg;
      if (ratio > UNUSUAL_RATIO && amount > UNUSUAL_MIN_AMOUNT) {
        flags.push({ name, amount, avg, ratio });
      }
    }
    flags.sort((a, b) => b.ratio - a.ratio);
    return { top, flags, total };
  }, [transactions, year, month]);

  const monthName = `${MONTHS[month - 1]} ${year}`;

  return (
    <Card className="mt-4">
      <h2 className="text-base font-bold tracking-tight">Insights</h2>
      {total === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">
          No spending logged in {monthName} yet.
        </p>
      ) : (
        <>
          <p className="mt-3 text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Top spending · {monthName}
          </p>
          <ul className="mt-2 space-y-2">
            {top.map((c) => (
              <li key={c.name} className="flex items-baseline gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">
                  {c.name}
                </span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {formatBDT(Math.round(c.amount))}
                </span>
                <span className="w-10 shrink-0 text-right text-xs text-zinc-500">
                  {Math.round((c.amount / total) * 100)}%
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-800/70">
            {flags.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Nothing unusual this month — no category is running far above
                its usual.
              </p>
            ) : (
              <ul className="space-y-2">
                {flags.map((f) => (
                  <li key={f.name} className="flex items-start gap-2 text-sm">
                    <span aria-hidden="true" className="mt-0.5 shrink-0">
                      ⚠️
                    </span>
                    <span>
                      <span className="font-semibold">{f.name}</span> is{" "}
                      <span className="font-semibold">
                        {f.ratio.toFixed(1)}× your usual
                      </span>{" "}
                      <span className="text-zinc-500">
                        ({formatBDT(Math.round(f.amount))} vs{" "}
                        {formatBDT(Math.round(f.avg))} on average)
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
