"use client";

import { useEffect, useState } from "react";
import type { Transaction, TxType } from "@/lib/types";

function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface Props {
  open: boolean;
  categories: string[];
  /** When set, the modal edits this entry instead of adding a new one. */
  editing?: Transaction | null;
  onClose: () => void;
  onSaved: () => void;
}

export function AddTransactionModal({ open, categories, editing, onClose, onSaved }: Props) {
  const [date, setDate] = useState(todayLocal());
  const [type, setType] = useState<TxType>("Debit");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Reset the form each time the modal opens — blank for a new entry,
  // prefilled from the entry being edited.
  useEffect(() => {
    if (open) {
      if (editing) {
        setDate(editing.date);
        setType(editing.type);
        setCategory(editing.category);
        setDescription(editing.description);
        setAmount(String(editing.amount));
      } else {
        setDate(todayLocal());
        setType("Debit");
        setCategory("");
        setDescription("");
        setAmount("");
      }
      setError(null);
      setSaved(false);
    }
  }, [open, editing]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = Number(amount);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !category.trim() || !Number.isFinite(parsed) || parsed <= 0) {
      setError("Please fill in a valid date, category and an amount above 0.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/transactions", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editing
            ? {
                id: editing.id,
                tab: editing.tab,
                row: editing.row,
                originalDate: editing.date,
                originalType: editing.type,
                originalAmount: editing.amount,
                date,
                type,
                category: category.trim(),
                description: description.trim(),
                amount: parsed,
              }
            : {
                date,
                type,
                category: category.trim(),
                description: description.trim(),
                amount: parsed,
              }
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Could not save the entry.");
      setSaved(true);
      onSaved();
      window.setTimeout(onClose, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30 dark:border-zinc-700 dark:bg-zinc-950";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={editing ? "Edit transaction" : "Add transaction"}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl dark:bg-zinc-900 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {saved ? (
          <div className="py-10 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-3xl">
              ✅
            </div>
            <p className="text-lg font-bold">{editing ? "Entry updated" : "Entry saved"}</p>
            <p className="mt-1 text-sm text-zinc-500">Your dashboard is updating…</p>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="mb-5 flex items-start justify-between">
              <h2 className="text-lg font-bold tracking-tight">{editing ? "Edit transaction" : "Add transaction"}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-full px-2 py-1 text-lg leading-none text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white"
              >
                ×
              </button>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-zinc-100 p-1 dark:bg-zinc-800">
              {(
                [
                  { value: "Debit", label: "💸 Expense" },
                  { value: "Credit", label: "💰 Income" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setType(opt.value)}
                  aria-pressed={type === opt.value}
                  className={`rounded-xl py-2.5 text-sm font-semibold transition ${
                    type === opt.value
                      ? "bg-white text-zinc-900 shadow-card dark:bg-zinc-900 dark:text-white"
                      : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="tx-amount">
                  Amount (৳)
                </label>
                <input
                  id="tx-amount"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className={inputCls}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium" htmlFor="tx-date">
                    Date
                  </label>
                  <input
                    id="tx-date"
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium" htmlFor="tx-category">
                    Category
                  </label>
                  <input
                    id="tx-category"
                    type="text"
                    list="tx-categories"
                    required
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="e.g. Transport"
                    autoComplete="off"
                    className={inputCls}
                  />
                  <datalist id="tx-categories">
                    {categories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="tx-description">
                  Description <span className="font-normal text-zinc-400">(optional)</span>
                </label>
                <input
                  id="tx-description"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Rickshaw"
                  autoComplete="off"
                  className={inputCls}
                />
              </div>
            </div>

            {error && (
              <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="mt-5 w-full rounded-xl bg-accent py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-accent-strong hover:shadow-card-hover disabled:opacity-50"
            >
              {busy ? "Saving…" : editing ? "Save changes" : `Save ${type === "Debit" ? "expense" : "income"}`}
            </button>
            <p className="mt-3 text-center text-xs text-zinc-500">
              {editing
                ? "Edits save to the same row. Changing the month moves the entry to that month's tab."
                : "Saved to the tab for the month of the date above."}
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
