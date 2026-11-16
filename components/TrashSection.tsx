"use client";

import { useCallback, useEffect, useState } from "react";
import {
  formatBDT,
  formatDateShort,
  isTransfer,
  type TrashEntry,
} from "@/lib/types";

/**
 * Recently deleted: entries deleted in the app wait here for 30 days, then
 * go for good. Restore puts one back in its monthly tab; Delete forever
 * removes it now.
 */
export function TrashSection({
  onTransactionsChanged,
}: {
  onTransactionsChanged: () => void;
}) {
  const [entries, setEntries] = useState<TrashEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyRow, setBusyRow] = useState<number | null>(null);
  const [confirmRow, setConfirmRow] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/trash", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Could not load the trash.");
      setEntries(data.entries as TrashEntry[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(row: number, action: "restore" | "delete") {
    setBusyRow(row);
    setError(null);
    try {
      const res = await fetch("/api/trash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, row }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Could not update the trash.");
      if (action === "restore") onTransactionsChanged();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusyRow(null);
    }
  }

  function daysLeft(deletedAt: string): number | null {
    if (!deletedAt) return null;
    const deleted = new Date(`${deletedAt}T00:00:00Z`).getTime();
    if (!Number.isFinite(deleted)) return null;
    const left = 30 - Math.floor((Date.now() - deleted) / 86_400_000);
    return Math.max(0, left);
  }

  if (loading) {
    return <p className="py-8 text-center text-sm text-zinc-500">Loading…</p>;
  }

  return (
    <div>
      <p className="text-sm text-zinc-500">
        A transaction you delete in the app waits here for 30 days, then goes
        for good. Restore puts it back where it was.
      </p>
      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </p>
      )}
      {entries.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-zinc-300 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          Nothing deleted in the last 30 days. If you delete a transaction by
          mistake, restore it here.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-zinc-100 rounded-2xl border border-zinc-200 dark:divide-zinc-800/70 dark:border-zinc-800">
          {entries.map((t) => {
            const left = daysLeft(t.deletedAt);
            const isConfirming = confirmRow === t.trashRow;
            return (
              <li key={`${t.trashRow}-${t.id}`} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {isTransfer(t) ? "⇄ " : ""}
                    {t.description || t.category}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">
                    {t.description ? `${t.category} · ` : ""}
                    {formatDateShort(t.date)}
                    {left !== null && ` · ${left} day${left === 1 ? "" : "s"} left`}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-sm font-semibold tabular-nums ${
                    t.type === "Credit"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  {t.type === "Credit" ? "+" : "−"}
                  {formatBDT(t.amount)}
                </span>
                <button
                  type="button"
                  disabled={busyRow === t.trashRow}
                  onClick={() => void act(t.trashRow, "restore")}
                  className="shrink-0 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent-ink transition hover:bg-accent-soft/70 disabled:opacity-50"
                >
                  Restore
                </button>
                <button
                  type="button"
                  disabled={busyRow === t.trashRow}
                  onClick={() => {
                    if (isConfirming) {
                      setConfirmRow(null);
                      void act(t.trashRow, "delete");
                    } else {
                      setConfirmRow(t.trashRow);
                    }
                  }}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                    isConfirming
                      ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                      : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  {isConfirming ? "Delete forever?" : "Delete forever"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
