"use client";

import { useMemo, useState } from "react";
import {
  MONTHS,
  formatBDT,
  formatBDTCompact,
  isTransfer,
  parseISODate,
  type Transaction,
} from "@/lib/types";
import { RecentList } from "./RecentList";
import { Card } from "./ui";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/** Heatmap shade by the day's spend, relative to the month's biggest day. */
function heatClass(ratio: number): string {
  if (ratio <= 0) return "";
  if (ratio <= 0.25)
    return "bg-rose-50 dark:bg-rose-950/60";
  if (ratio <= 0.5) return "bg-rose-100 dark:bg-rose-900/50";
  if (ratio <= 0.75) return "bg-rose-200 dark:bg-rose-800/50";
  return "bg-rose-300 dark:bg-rose-700/50";
}

/**
 * Calendar grid (R13): the selected month as a heatmap — each day's spend
 * (and income, when there is any), shaded by how heavy the day was.
 * Sunday-start, matching the local week. Tap a day to see its entries.
 */
export function MonthCalendar({
  transactions,
  year,
  month,
  onEdit,
  onDelete,
}: {
  transactions: Transaction[];
  year: number; // e.g. 2026
  month: number; // 1-12
  onEdit: (t: Transaction) => void;
  onDelete: (t: Transaction) => void;
}) {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const dim = new Date(year, month, 0).getDate();
  const firstWeekday = new Date(year, month - 1, 1).getDay(); // 0 = Sunday
  const now = new Date();
  const isCurrentMonth =
    year === now.getFullYear() && month === now.getMonth() + 1;
  const todayDay = isCurrentMonth ? now.getDate() : null;

  const { byDay, maxSpend } = useMemo(() => {
    const map = new Map<
      number,
      { spend: number; income: number; entries: Transaction[] }
    >();
    let max = 0;
    for (const t of transactions) {
      const p = parseISODate(t.date);
      if (!p || p.year !== year || p.month !== month) continue;
      if (isTransfer(t)) continue;
      let day = map.get(p.day);
      if (!day) {
        day = { spend: 0, income: 0, entries: [] };
        map.set(p.day, day);
      }
      if (t.type === "Credit") day.income += t.amount;
      else {
        day.spend += t.amount;
        if (day.spend > max) max = day.spend;
      }
      day.entries.push(t);
    }
    for (const day of map.values()) {
      day.entries.sort((a, b) => b.amount - a.amount);
    }
    return { byDay: map, maxSpend: max };
  }, [transactions, year, month]);

  const monthName = `${MONTHS[month - 1]} ${year}`;
  const selected = selectedDay !== null ? byDay.get(selectedDay) : undefined;
  const selectedEntries = selected?.entries ?? [];

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: dim }, (_, i) => i + 1),
  ];

  return (
    <Card className="mt-4">
      <h2 className="text-base font-bold tracking-tight">Calendar</h2>
      <p className="mt-0.5 text-xs text-zinc-500">
        {monthName} · tap a day to see its entries
      </p>

      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-zinc-500">
        {WEEKDAYS.map((d, i) => (
          <div key={i} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`blank-${i}`} className="min-h-14" />;
          }
          const data = byDay.get(day);
          const spend = data?.spend ?? 0;
          const income = data?.income ?? 0;
          const isToday = day === todayDay;
          const isSelected = day === selectedDay;
          return (
            <button
              key={day}
              type="button"
              onClick={() =>
                setSelectedDay((prev) => (prev === day ? null : day))
              }
              aria-label={`${day} ${monthName}${spend > 0 ? `, ${formatBDT(Math.round(spend))} spent` : ""}${income > 0 ? `, ${formatBDT(Math.round(income))} income` : ""}`}
              aria-pressed={isSelected}
              className={`flex min-h-14 flex-col items-start rounded-lg px-1.5 py-1 text-left transition hover:ring-2 hover:ring-zinc-300 dark:hover:ring-zinc-600 ${heatClass(maxSpend > 0 ? spend / maxSpend : 0)} ${
                isSelected
                  ? "ring-2 ring-zinc-900 dark:ring-white"
                  : isToday
                    ? "ring-2 ring-accent"
                    : ""
              }`}
            >
              <span
                className={`text-xs font-bold ${
                  isToday ? "text-accent-ink" : ""
                }`}
              >
                {day}
              </span>
              {spend > 0 && (
                <span className="text-[11px] font-semibold leading-tight text-rose-600 dark:text-rose-400">
                  {formatBDTCompact(spend)}
                </span>
              )}
              {income > 0 && (
                <span className="text-[11px] font-semibold leading-tight text-emerald-600 dark:text-emerald-400">
                  +{formatBDTCompact(income)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedDay !== null && (
        <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-800/70">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-bold">
              {selectedDay} {monthName}
              {selected && selected.spend > 0 && (
                <span className="ml-2 text-sm font-semibold text-rose-600 dark:text-rose-400">
                  {formatBDT(Math.round(selected.spend))} spent
                </span>
              )}
              {selected && selected.income > 0 && (
                <span className="ml-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  +{formatBDT(Math.round(selected.income))}
                </span>
              )}
            </h3>
            <button
              type="button"
              onClick={() => setSelectedDay(null)}
              aria-label="Close day detail"
              className="rounded-full px-2 py-0.5 text-lg leading-none text-zinc-500 transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              ×
            </button>
          </div>
          <div className="mt-2">
            <RecentList
              transactions={selectedEntries}
              total={selectedEntries.length}
              monthLabel={`${selectedDay} ${monthName}`}
              emptyText="Nothing logged on this day."
              onEdit={onEdit}
              onDelete={onDelete}
            />
          </div>
        </div>
      )}
    </Card>
  );
}
