"use client";

import { useMemo, useState } from "react";
import { detectFixedPatterns } from "@/lib/pace";
import {
  formatBDT,
  parseISODate,
  patternKey,
  type MarkedPattern,
  type Transaction,
} from "@/lib/types";
import { Spinner } from "./ui";

interface Props {
  /** Null while loading. */
  patterns: MarkedPattern[] | null;
  transactions: Transaction[];
  expenseCategories: string[];
  onPatternsChanged: (patterns: MarkedPattern[]) => void;
}

async function postRecurring(
  body: Record<string, unknown>
): Promise<{ patterns: MarkedPattern[] }> {
  const res = await fetch("/api/recurring", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "Could not save the change.");
  return data;
}

/** One row of the recurring list — marked by the user, or spotted by the app. */
type Row = {
  key: string;
  category: string;
  description: string;
  label: string;
  amount: number;
  day: number;
  status: "active" | "paused" | "detected";
  monthsSeen?: number;
  paidThisMonth?: boolean;
};

/**
 * Recurring payments: the fixed costs the pace card counts once instead of
 * projecting forward. One list, whether the user marked a pattern or the
 * app detected it from the sheet's history — every row can be edited,
 * paused, or removed. Editing or pausing a detected pattern saves it as
 * the user's own mark; dismissing one hides a false positive for good.
 * Paused patterns stay in the list to be resumed; dismissed ones move to
 * the small section at the bottom, where they can be undone.
 */
export function RecurringSection({
  patterns,
  transactions,
  expenseCategories,
  onPatternsChanged,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editDay, setEditDay] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newDay, setNewDay] = useState("1");
  const [newPaused, setNewPaused] = useState(false);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // The unified list: the user's marks (active + paused) plus the patterns
  // the app detected for the current month — shown when they were paid
  // this month or have enough history to be trusted, and never when the
  // user already marked them (they live in that list instead).
  const { rows, dismissed } = useMemo(() => {
    const marked = patterns ?? [];
    const out: Row[] = marked
      .filter(
        (p): p is MarkedPattern & { status: "active" | "paused" } =>
          p.status !== "dismissed"
      )
      .map((p) => ({
        key: patternKey(p.category, p.description),
        category: p.category,
        description: p.description,
        label: p.description || p.category,
        amount: p.amount,
        day: p.day,
        status: p.status,
      }));
    const dismissedRows: Row[] = marked
      .filter((p) => p.status === "dismissed")
      .map((p) => ({
        key: patternKey(p.category, p.description),
        category: p.category,
        description: p.description,
        label: p.description || p.category,
        amount: p.amount,
        day: p.day,
        status: "paused" as const, // rendered in its own section
      }));
    const markedKeys = new Set(
      marked.map((p) => patternKey(p.category, p.description))
    );
    const thisMonthKeys = new Set<string>();
    for (const t of transactions) {
      const p = parseISODate(t.date);
      if (p && p.year === currentYear && p.month === currentMonth) {
        thisMonthKeys.add(patternKey(t.category, t.description));
      }
    }
    for (const p of detectFixedPatterns(transactions, currentYear, currentMonth)) {
      if (markedKeys.has(p.key)) continue;
      if (!thisMonthKeys.has(p.key) && p.monthsSeen < 2) continue;
      const [category, ...rest] = p.key.split(" / ");
      out.push({
        key: p.key,
        category,
        description: rest.join(" / "),
        label: p.label,
        amount: Math.round(p.medianAmount),
        day: p.medianDay,
        status: "detected",
        monthsSeen: p.monthsSeen,
        paidThisMonth: thisMonthKeys.has(p.key),
      });
    }
    out.sort((a, b) => b.amount - a.amount);
    dismissedRows.sort((a, b) => b.amount - a.amount);
    return { rows: out, dismissed: dismissedRows };
  }, [transactions, patterns, currentYear, currentMonth]);

  // Descriptions already used with the chosen category, for the add form.
  const descriptionOptions = useMemo(() => {
    if (!newCategory) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    const sorted = [...transactions]
      .filter((t) => t.type === "Debit" && t.category === newCategory)
      .sort((a, b) => b.date.localeCompare(a.date));
    for (const t of sorted) {
      if (t.description && !seen.has(t.description)) {
        seen.add(t.description);
        out.push(t.description);
      }
      if (out.length >= 20) break;
    }
    return out;
  }, [transactions, newCategory]);

  /** Picking a known description prefills the amount + day from its most recent entry. */
  function handleDescriptionChange(text: string) {
    setNewDescription(text);
    if (!newCategory || !text.trim()) return;
    const match = [...transactions]
      .filter(
        (t) =>
          t.type === "Debit" &&
          t.category === newCategory &&
          t.description.toLowerCase() === text.trim().toLowerCase()
      )
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (match) {
      setNewAmount(String(match.amount));
      setNewDay(String(parseISODate(match.date)?.day ?? 1));
    }
  }

  async function run(fn: () => Promise<{ patterns: MarkedPattern[] }>) {
    setBusy(true);
    setError(null);
    try {
      const data = await fn();
      onPatternsChanged(data.patterns);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  /** Save a row's amount/day (and, for a detected row, adopt it as the user's own mark). */
  function saveRow(row: Row, amount: number, day: number, status?: "active" | "paused" | "dismissed") {
    return postRecurring({
      action: "upsert",
      category: row.category,
      description: row.description,
      amount,
      day,
      status: status ?? (row.status === "paused" ? "paused" : "active"),
    });
  }

  const inputCls =
    "w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30 dark:border-zinc-700 dark:bg-zinc-950";

  if (patterns === null) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-sm font-medium text-zinc-500">
        <Spinner className="h-6 w-6 text-accent" />
        Loading…
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-zinc-500">
        Payments that repeat every month. The pace card counts these once
        instead of projecting them forward, and reserves for them before
        they&rsquo;re due. Everything here — marked by you or spotted by the
        app — can be edited, paused, or removed. Pause one while it&rsquo;s
        on hold; dismiss one the app got wrong.
      </p>
      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
          Nothing here yet. Add one below, or tick &ldquo;Repeats every
          month&rdquo; when adding or editing an entry.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-zinc-100 rounded-2xl border border-zinc-200 dark:divide-zinc-800/70 dark:border-zinc-800">
          {rows.map((row) => {
            const isEditing = editingKey === row.key;
            const isConfirming = confirmDelete === row.key;
            const isDetected = row.status === "detected";
            return (
              <li key={row.key} className="px-4 py-3">
                {isEditing ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-full text-sm font-medium">{row.label}</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={1}
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      aria-label="Amount"
                      placeholder="Amount"
                      autoFocus
                      className={`${inputCls} max-w-36`}
                    />
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={31}
                      value={editDay}
                      onChange={(e) => setEditDay(e.target.value)}
                      aria-label="Day of the month"
                      placeholder="Day"
                      className={`${inputCls} max-w-20`}
                    />
                    <button
                      type="button"
                      disabled={
                        busy ||
                        !Number(editAmount) ||
                        Number(editAmount) <= 0 ||
                        !Number(editDay) ||
                        Number(editDay) < 1 ||
                        Number(editDay) > 31
                      }
                      onClick={() => {
                        void run(() =>
                          saveRow(row, Number(editAmount), Number(editDay))
                        );
                        setEditingKey(null);
                      }}
                      className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingKey(null)}
                      className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium dark:border-zinc-700"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {row.label}
                        <span
                          className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            row.status === "paused"
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                              : row.status === "detected"
                                ? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                          }`}
                        >
                          {row.status === "paused"
                            ? "Paused"
                            : row.status === "detected"
                              ? "Auto-detected"
                              : "Active"}
                        </span>
                      </p>
                      <p className="text-xs text-zinc-500">
                        {row.category} · Day {row.day} of the month
                        {isDetected && row.monthsSeen !== undefined && (
                          <>
                            {" · "}seen in {row.monthsSeen} month
                            {row.monthsSeen === 1 ? "" : "s"}
                            {" · "}
                            {row.paidThisMonth
                              ? "✓ paid this month"
                              : "⏳ not yet this month"}
                          </>
                        )}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatBDT(row.amount)}
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          saveRow(
                            row,
                            row.amount,
                            row.day,
                            row.status === "paused" ? "active" : "paused"
                          )
                        )
                      }
                      className="shrink-0 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    >
                      {row.status === "paused" ? "Resume" : "Pause"}
                    </button>
                    <button
                      type="button"
                      aria-label={`Edit ${row.label}`}
                      title="Edit amount or day"
                      disabled={busy}
                      onClick={() => {
                        setEditingKey(row.key);
                        setEditAmount(String(row.amount));
                        setEditDay(String(row.day));
                      }}
                      className="rounded-full px-2 py-1 text-sm text-zinc-500 transition hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      aria-label={
                        isDetected
                          ? isConfirming
                            ? `Confirm dismissing ${row.label}`
                            : `Dismiss ${row.label}`
                          : isConfirming
                            ? `Confirm removing ${row.label}`
                            : `Remove ${row.label}`
                      }
                      title={
                        isDetected
                          ? "Dismiss — the app won't suggest this again"
                          : "Remove this mark"
                      }
                      disabled={busy}
                      onClick={() => {
                        if (isConfirming) {
                          setConfirmDelete(null);
                          if (isDetected) {
                            void run(() =>
                              saveRow(row, row.amount, row.day, "dismissed")
                            );
                          } else {
                            void run(() =>
                              postRecurring({
                                action: "delete",
                                category: row.category,
                                description: row.description,
                              })
                            );
                          }
                        } else {
                          setConfirmDelete(row.key);
                        }
                      }}
                      className={`rounded-full px-2 py-1 text-xs font-semibold transition disabled:opacity-40 ${
                        isConfirming
                          ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                          : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      }`}
                    >
                      {isConfirming
                        ? isDetected
                          ? "Dismiss?"
                          : "Remove?"
                        : isDetected
                          ? "✕"
                          : "🗑️"}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <form
        className="mt-4 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newCategory || !Number(newAmount) || Number(newAmount) <= 0)
            return;
          void run(() =>
            postRecurring({
              action: "upsert",
              category: newCategory,
              description: newDescription,
              amount: Number(newAmount),
              day: Number(newDay) || 1,
              status: newPaused ? "paused" : "active",
            })
          );
          setNewCategory("");
          setNewDescription("");
          setNewAmount("");
          setNewDay("1");
          setNewPaused(false);
        }}
      >
        <p className="text-sm font-semibold">Add a recurring payment</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">
              Category
            </span>
            <select
              value={newCategory}
              onChange={(e) => {
                setNewCategory(e.target.value);
                setNewDescription("");
              }}
              required
              className={inputCls}
            >
              <option value="">Choose a category…</option>
              {expenseCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">
              Description
            </span>
            <input
              type="text"
              value={newDescription}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              placeholder="As it appears on the entry"
              maxLength={100}
              autoComplete="off"
              list="recurring-descriptions"
              className={inputCls}
            />
            <datalist id="recurring-descriptions">
              {descriptionOptions.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">
              Amount
            </span>
            <input
              type="number"
              inputMode="decimal"
              min={1}
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              placeholder="e.g. 16667"
              required
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">
              Day of the month
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={31}
              value={newDay}
              onChange={(e) => setNewDay(e.target.value)}
              required
              className={inputCls}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={newPaused}
              onChange={(e) => setNewPaused(e.target.checked)}
              className="h-4 w-4 accent-emerald-600"
            />
            Add as paused
          </label>
          <button
            type="submit"
            disabled={
              busy ||
              !newCategory ||
              !Number(newAmount) ||
              Number(newAmount) <= 0
            }
            className="ml-auto rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-50"
          >
            Add pattern
          </button>
        </div>
      </form>

      {dismissed.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-bold tracking-tight">
            Dismissed
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            Patterns you told the app to ignore. They aren&rsquo;t counted
            and won&rsquo;t be suggested again — undo one to let the app
            detect it again.
          </p>
          <ul className="mt-3 divide-y divide-zinc-100 rounded-2xl border border-zinc-200 dark:divide-zinc-800/70 dark:border-zinc-800">
            {dismissed.map((row) => (
              <li key={row.key} className="flex items-center gap-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-500 dark:text-zinc-400">
                    {row.label}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {row.category} · {formatBDT(row.amount)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      postRecurring({
                        action: "delete",
                        category: row.category,
                        description: row.description,
                      })
                    )
                  }
                  className="shrink-0 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  Undo
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
