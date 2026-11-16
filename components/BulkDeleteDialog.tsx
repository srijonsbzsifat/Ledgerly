"use client";

import { formatBDT, type Transaction } from "@/lib/types";

/**
 * Confirmation for deleting several entries at once. Deleted entries go to
 * Trash (30 days), and any transfer in the selection takes its other half
 * with it.
 */
export function BulkDeleteDialog({
  entries,
  busy = false,
  onCancel,
  onConfirm,
}: {
  entries: Transaction[];
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const total = entries.reduce((s, t) => s + t.amount, 0);
  const transfers = entries.filter((t) => t.linkId && t.linkId.trim()).length;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Delete entries"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-card dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-extrabold tracking-tight">
          Delete {entries.length} entr{entries.length === 1 ? "y" : "ies"}?
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Total {formatBDT(total)}. They wait in Trash for 30 days before
          going for good.
        </p>
        {transfers > 0 && (
          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
            {transfers} of these {transfers === 1 ? "is" : "are"} half of a
            transfer — the other half goes too.
          </p>
        )}
        <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-sm">
          {entries.slice(0, 8).map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3">
              <span className="truncate text-zinc-600 dark:text-zinc-400">
                {t.description || t.category} · {t.date}
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{formatBDT(t.amount)}</span>
            </li>
          ))}
          {entries.length > 8 && (
            <li className="text-xs text-zinc-500">…and {entries.length - 8} more</li>
          )}
        </ul>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-semibold transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
