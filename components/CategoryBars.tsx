"use client";

import { formatBDT } from "@/lib/types";
import type { CategoryPoint } from "./Charts";

/**
 * Ranked category bars — "Where November went". One row per category:
 * name, amount, share of the total, and a bar scaled to the biggest one.
 */
export function CategoryBars({
  data,
  limit,
}: {
  data: CategoryPoint[];
  limit?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const rows = limit ? data.slice(0, limit) : data;
  const max = rows.length > 0 ? rows[0].value : 0;

  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-zinc-500">Nothing here yet.</p>;
  }

  return (
    <ul className="space-y-3.5">
      {rows.map((d) => (
        <li key={d.name}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium">{d.name}</span>
            <span className="shrink-0 tabular-nums">
              <span className="font-semibold">{formatBDT(d.value)}</span>
              <span className="ml-2 w-9 inline-block text-right text-xs text-zinc-500">
                {total > 0 ? `${Math.round((d.value / total) * 100)}%` : "—"}
              </span>
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${max > 0 ? (d.value / max) * 100 : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
