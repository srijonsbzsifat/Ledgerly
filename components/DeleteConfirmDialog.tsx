"use client";

import { useState } from "react";
import { formatBDT, type Transaction } from "@/lib/types";

interface Props {
  /** The entry to delete; null closes the dialog. */
  transaction: Transaction | null;
  onClose: () => void;
  onDeleted: () => void;
}

/**
 * Confirmation dialog for deleting a transaction. Nothing is deleted until
 * the user reads the entry's details here and taps Delete — a stray tap on
 * the row's delete button only opens this dialog.
 */
export function DeleteConfirmDialog({ transaction, onClose, onDeleted }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!transaction) return null;

  async function confirm() {
    if (!transaction?.tab || !transaction.row) {
      setError("That entry could not be identified. Refresh the dashboard and try again.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/transactions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: transaction.id,
          tab: transaction.tab,
          row: transaction.row,
          originalDate: transaction.date,
          originalType: transaction.type,
          originalAmount: transaction.amount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Could not delete the entry.");
      onDeleted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
      aria-describedby="delete-dialog-desc"
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl dark:bg-zinc-900 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <h2 id="delete-dialog-title" className="text-lg font-bold tracking-tight">
            Delete this entry?
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full px-2 py-1 text-lg leading-none text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white"
          >
            ×
          </button>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/50">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{transaction.date}</p>
          <p className="mt-1 font-semibold">
            {transaction.description || transaction.category}
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {transaction.category} · {transaction.type === "Credit" ? "Income" : "Expense"}
          </p>
          <p
            className={`mt-2 text-xl font-extrabold tracking-tight tabular-nums ${
              transaction.type === "Credit"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {transaction.type === "Credit" ? "+" : "−"}
            {formatBDT(transaction.amount)}
          </p>
        </div>

        <p id="delete-dialog-desc" className="mt-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          This removes the entry from your sheet. It can&apos;t be undone from
          the app — only the sheet&apos;s own version history can bring it back.
        </p>

        {error && (
          <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-zinc-300 bg-white py-2.5 text-sm font-semibold transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={busy}
            className="rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-rose-700 disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
