"use client";

import { useMemo, useState } from "react";
import {
  accountBalances,
  formatBDT,
  type Account,
  type Transaction,
} from "@/lib/types";

interface Props {
  accounts: Account[];
  transactions: Transaction[];
  onAccountsChanged: (accounts: Account[]) => void;
  onTransactionsChanged: () => void;
}

const ACCOUNT_TYPES = ["Cash", "Bank", "Mobile money", "Other"];

async function postAccounts(
  body: Record<string, unknown>
): Promise<{ accounts: Account[]; renamed?: number }> {
  const res = await fetch("/api/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "Could not save the change.");
  return data;
}

/**
 * Managed accounts: every entry belongs to an account. Entries with no
 * account belong to the first account in the list (normally Cash).
 * Renaming an account moves its entries with it; an account with entries
 * can't be deleted until they move.
 */
export function AccountsSection({
  accounts,
  transactions,
  onAccountsChanged,
  onTransactionsChanged,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [newAccount, setNewAccount] = useState("");
  const [newType, setNewType] = useState("Cash");

  const balances = useMemo(
    () => accountBalances(transactions, accounts),
    [transactions, accounts]
  );

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    const defaultName = accounts[0]?.name ?? "Cash";
    for (const t of transactions) {
      const name = (t.linkedAccount ?? "").trim() || defaultName;
      map.set(name, (map.get(name) ?? 0) + 1);
    }
    return map;
  }, [transactions, accounts]);

  async function run(
    fn: () => Promise<{ accounts: Account[]; renamed?: number }>,
    reloadTx: boolean
  ) {
    setBusy(true);
    setError(null);
    try {
      const data = await fn();
      onAccountsChanged(data.accounts);
      if (reloadTx) onTransactionsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30 dark:border-zinc-700 dark:bg-zinc-950";

  return (
    <div>
      <p className="text-sm text-zinc-500">
        Every entry belongs to an account. Entries with no account belong to
        the first account here. Transfers move money between accounts.
      </p>
      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </p>
      )}
      <ul className="mt-4 divide-y divide-zinc-100 rounded-2xl border border-zinc-200 dark:divide-zinc-800/70 dark:border-zinc-800">
        {balances.map((b, i) => {
          const count = counts.get(b.name) ?? 0;
          const isRenaming = renaming === b.name;
          const isConfirming = confirmDelete === b.name;
          const isListed = accounts.some((a) => a.name === b.name);
          return (
            <li key={b.name} className="px-4 py-3">
              {isRenaming ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    autoFocus
                    maxLength={50}
                    className={`${inputCls} max-w-56`}
                  />
                  <button
                    type="button"
                    disabled={busy || !newName.trim()}
                    onClick={() => {
                      void run(
                        () =>
                          postAccounts({ action: "rename", name: b.name, newName }),
                        true
                      );
                      setRenaming(null);
                    }}
                    className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setRenaming(null)}
                    className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium dark:border-zinc-700"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {b.name}
                      {i === 0 && (
                        <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-ink">
                          default
                        </span>
                      )}
                      {!isListed && (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                          not in the list
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {b.type} · {count} entr{count === 1 ? "y" : "ies"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-sm font-semibold tabular-nums ${
                      b.balance >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {formatBDT(b.balance)}
                  </span>
                  {isListed && (
                    <>
                      <button
                        type="button"
                        aria-label={`Rename ${b.name}`}
                        title="Rename (entries move with it)"
                        disabled={busy}
                        onClick={() => {
                          setRenaming(b.name);
                          setNewName(b.name);
                        }}
                        className="rounded-full px-2 py-1 text-sm text-zinc-500 transition hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        aria-label={
                          count > 0
                            ? `${b.name} still has entries and can't be deleted`
                            : isConfirming
                              ? `Confirm deleting ${b.name}`
                              : `Delete ${b.name}`
                        }
                        title={
                          count > 0
                            ? `Has ${count} entries — move or delete them first`
                            : "Delete"
                        }
                        disabled={busy || count > 0 || accounts.length === 1}
                        onClick={() => {
                          if (isConfirming) {
                            setConfirmDelete(null);
                            void run(
                              () => postAccounts({ action: "delete", name: b.name }),
                              false
                            );
                          } else {
                            setConfirmDelete(b.name);
                          }
                        }}
                        className={`rounded-full px-2 py-1 text-xs font-semibold transition disabled:opacity-40 ${
                          isConfirming
                            ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                            : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        }`}
                      >
                        {isConfirming ? "Delete?" : "🗑️"}
                      </button>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newAccount.trim()) return;
          void run(
            () => postAccounts({ action: "add", name: newAccount, type: newType }),
            false
          );
          setNewAccount("");
        }}
      >
        <input
          type="text"
          value={newAccount}
          onChange={(e) => setNewAccount(e.target.value)}
          placeholder="New account, e.g. bKash"
          maxLength={50}
          autoComplete="off"
          className={`${inputCls} min-w-44 flex-1`}
        />
        <select
          value={newType}
          onChange={(e) => setNewType(e.target.value)}
          aria-label="Account type"
          className={`${inputCls} w-auto`}
        >
          {ACCOUNT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={busy || !newAccount.trim()}
          className="shrink-0 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-50"
        >
          Add
        </button>
      </form>
    </div>
  );
}
