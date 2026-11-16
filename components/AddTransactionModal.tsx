"use client";

import { useEffect, useMemo, useState } from "react";
import {
  isTransfer,
  patternKey,
  type MarkedPattern,
  type Transaction,
  type TxType,
} from "@/lib/types";
import {
  buildDescriptionIndex,
  DescriptionInput,
  type DescriptionSuggestion,
} from "./DescriptionInput";

function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const NEW_CATEGORY = "__new__";

type Mode = TxType | "Transfer";

interface Props {
  open: boolean;
  expenseCategories: string[];
  incomeCategories: string[];
  accounts: string[];
  transactions: Transaction[];
  /** When set, the modal edits this entry instead of adding a new one. */
  editing?: Transaction | null;
  markedPatterns: MarkedPattern[];
  onRecurringChanged: (patterns: MarkedPattern[]) => void;
  onClose: () => void;
  onSaved: () => void;
}

export function AddTransactionModal({
  open,
  expenseCategories,
  incomeCategories,
  accounts,
  transactions,
  editing,
  markedPatterns,
  onRecurringChanged,
  onClose,
  onSaved,
}: Props) {
  const [date, setDate] = useState(todayLocal());
  const [mode, setMode] = useState<Mode>("Debit");
  const [category, setCategory] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [account, setAccount] = useState("");
  const [fromAccount, setFromAccount] = useState("");
  const [toAccount, setToAccount] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // The recurring checkbox follows the mark for the current
  // category+description — unless the user toggled it this session, in
  // which case their toggle wins until the modal reopens.
  const [recurringOverride, setRecurringOverride] = useState<boolean | null>(null);

  const editingTransfer = !!editing && isTransfer(editing);
  const options = mode === "Debit" ? expenseCategories : incomeCategories;
  const effectiveAccount = account || accounts[0] || "Cash";
  const effectiveFrom = fromAccount || accounts[0] || "Cash";
  const effectiveTo = toAccount || accounts[1] || accounts[0] || "Cash";
  const canTransfer = accounts.length >= 2;

  // Reset the form each time the modal opens — blank for a new entry,
  // prefilled from the entry being edited.
  useEffect(() => {
    if (open) {
      if (editing) {
        setDate(editing.date);
        setMode(editing.type);
        setCategory(editing.category);
        setAccount((editing.linkedAccount ?? "").trim());
        setDescription(editing.description);
        setAmount(String(editing.amount));
      } else {
        setDate(todayLocal());
        setMode("Debit");
        setCategory("");
        setAccount("");
        setDescription("");
        setAmount("");
      }
      setNewCategory("");
      setFromAccount("");
      setToAccount("");
      setRecurringOverride(null);
      setError(null);
      setSaved(false);
    }
  }, [open, editing]);

  // Descriptions already in the sheet, for suggestions + auto-category.
  const descIndex = useMemo(
    () => buildDescriptionIndex(transactions, mode),
    [transactions, mode]
  );

  /** Typing a description used before auto-picks its category — but only
      while no category is chosen, so a deliberate choice (or the entry
      being edited) is never overridden. */
  function handleDescriptionChange(text: string) {
    setDescription(text);
    if (mode === "Transfer" || category) return;
    const match = descIndex.find(
      (s) => s.description.toLowerCase() === text.trim().toLowerCase()
    );
    if (match) setCategory(match.category);
  }

  /** Tapping a suggestion fills the description and takes its category. */
  function handleDescriptionPick(s: DescriptionSuggestion) {
    setDescription(s.description);
    if (mode !== "Transfer") setCategory(s.category);
  }

  if (!open) return null;

  // A category may not be in the managed list — the entry being edited, or
  // one auto-picked from a previous description (typed in the sheet, or
  // imported). Keep any such category selectable instead of blanking the
  // field.
  const extraCategories = new Set<string>();
  if (category && category !== NEW_CATEGORY && !options.includes(category)) {
    extraCategories.add(category);
  }
  if (editing && !options.includes(editing.category)) {
    extraCategories.add(editing.category);
  }
  const categoryOptions = [...extraCategories, ...options];

  const effectiveCategory = category === NEW_CATEGORY ? newCategory.trim() : category;

  // Whether this entry's pattern is marked as recurring (active). Follows
  // the mark for the current category+description as the user types, unless
  // they toggled the checkbox this session.
  const derivedRecurring =
    mode === "Debit" &&
    !!effectiveCategory &&
    markedPatterns.some(
      (p) =>
        p.status === "active" &&
        patternKey(p.category, p.description) ===
          patternKey(effectiveCategory, description.trim())
    );
  const recurring = recurringOverride ?? derivedRecurring;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = Number(amount);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed) || parsed <= 0) {
      setError("Please fill in a valid date and an amount above 0.");
      return;
    }
    if (mode === "Transfer") {
      if (effectiveFrom === effectiveTo) {
        setError("Pick two different accounts.");
        return;
      }
    } else if (!effectiveCategory) {
      setError("Please pick a category.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Recurring mark (expenses only). Saved BEFORE the entry: the upsert
      // is idempotent, so retrying after an entry failure is safe, and a
      // mark failure leaves no half-saved entry behind.
      if (mode === "Debit") {
        const savePattern = async (body: Record<string, unknown>) => {
          const res = await fetch("/api/recurring", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const data = await res.json();
          if (!res.ok)
            throw new Error(data?.error ?? "Could not save the recurring mark.");
          return data.patterns as MarkedPattern[];
        };
        const newKey = patternKey(effectiveCategory, description.trim());
        const oldKey = editing
          ? patternKey(editing.category, editing.description)
          : null;
        if (recurring) {
          const patterns = await savePattern({
            action: "upsert",
            category: effectiveCategory,
            description: description.trim(),
            amount: parsed,
            day: Number(date.slice(8, 10)) || 1,
            status: "active",
          });
          onRecurringChanged(patterns);
          // If the entry moved to a new pattern, drop the old key's mark.
          if (oldKey && oldKey !== newKey) {
            const old = markedPatterns.find(
              (p) => patternKey(p.category, p.description) === oldKey
            );
            if (old) {
              const patterns2 = await savePattern({
                action: "delete",
                category: old.category,
                description: old.description,
              });
              onRecurringChanged(patterns2);
            }
          }
        } else if (editing && oldKey) {
          const wasMarkedActive = markedPatterns.some(
            (p) =>
              p.status === "active" &&
              patternKey(p.category, p.description) === oldKey
          );
          // Unticked on an entry whose pattern was marked: unmark it. A
          // paused mark is left alone — unticking isn't a deletion.
          if (wasMarkedActive) {
            const old = markedPatterns.find(
              (p) => patternKey(p.category, p.description) === oldKey
            );
            if (old) {
              const patterns = await savePattern({
                action: "delete",
                category: old.category,
                description: old.description,
              });
              onRecurringChanged(patterns);
            }
          }
        }
      }
      if (mode === "Transfer") {
        const res = await fetch("/api/transfers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromAccount: effectiveFrom,
            toAccount: effectiveTo,
            amount: parsed,
            date,
            description: description.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Could not save the transfer.");
      } else {
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
                  type: mode,
                  category: effectiveCategory,
                  description: description.trim(),
                  amount: parsed,
                  linkedAccount: effectiveAccount,
                }
              : {
                  date,
                  type: mode,
                  category: effectiveCategory,
                  description: description.trim(),
                  amount: parsed,
                  linkedAccount: effectiveAccount,
                }
          ),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Could not save the entry.");
      }
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
            <p className="text-lg font-bold">
              {editing ? "Entry updated" : mode === "Transfer" ? "Transfer saved" : "Entry saved"}
            </p>
            <p className="mt-1 text-sm text-zinc-500">Your dashboard is updating…</p>
          </div>
        ) : editingTransfer ? (
          <div>
            <div className="mb-5 flex items-start justify-between">
              <h2 className="text-lg font-bold tracking-tight">Edit transaction</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-full px-2 py-1 text-lg leading-none text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white"
              >
                ×
              </button>
            </div>
            <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              This is one half of a transfer between two accounts, so it
              can&apos;t be edited on its own — changing one half would break
              the pair. To change it, delete it (both halves go to Trash) and
              add the transfer again.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full rounded-xl bg-accent py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-accent-strong"
            >
              Close
            </button>
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

            <div className={`mb-4 grid gap-2 rounded-2xl bg-zinc-100 p-1 dark:bg-zinc-800 ${editing ? "grid-cols-2" : "grid-cols-3"}`}>
              {(
                [
                  { value: "Debit", label: "💸 Expense" },
                  { value: "Credit", label: "💰 Income" },
                  ...(editing
                    ? []
                    : [{ value: "Transfer", label: "⇄ Transfer" } as const]),
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={opt.value === "Transfer" && !canTransfer}
                  title={
                    opt.value === "Transfer" && !canTransfer
                      ? "Add a second account in Manage → Accounts first"
                      : undefined
                  }
                  onClick={() => setMode(opt.value)}
                  aria-pressed={mode === opt.value}
                  className={`rounded-xl py-2.5 text-sm font-semibold transition disabled:opacity-40 ${
                    mode === opt.value
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
                {mode === "Transfer" ? (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="tx-from">
                      From
                    </label>
                    <select
                      id="tx-from"
                      value={effectiveFrom}
                      onChange={(e) => setFromAccount(e.target.value)}
                      className={inputCls}
                    >
                      {accounts.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="tx-category">
                      Category
                    </label>
                    {categoryOptions.length === 0 && category !== NEW_CATEGORY ? (
                      <input
                        id="tx-category"
                        type="text"
                        required
                        value={newCategory}
                        onChange={(e) => {
                          setNewCategory(e.target.value);
                          setCategory(NEW_CATEGORY);
                        }}
                        placeholder="e.g. Transport"
                        autoComplete="off"
                        className={inputCls}
                      />
                    ) : (
                      <select
                        id="tx-category"
                        required
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className={inputCls}
                      >
                        <option value="" disabled>
                          Pick a category
                        </option>
                        {categoryOptions.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                        <option value={NEW_CATEGORY}>+ New category…</option>
                      </select>
                    )}
                  </div>
                )}
              </div>
              {mode === "Transfer" ? (
                <div>
                  <label className="mb-1.5 block text-sm font-medium" htmlFor="tx-to">
                    To
                  </label>
                  <select
                    id="tx-to"
                    value={effectiveTo}
                    onChange={(e) => setToAccount(e.target.value)}
                    className={inputCls}
                  >
                    {accounts.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  {category === NEW_CATEGORY && categoryOptions.length > 0 && (
                    <input
                      type="text"
                      required
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      placeholder="New category name"
                      autoComplete="off"
                      className={inputCls}
                    />
                  )}
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="tx-account">
                      Account
                    </label>
                    <select
                      id="tx-account"
                      value={effectiveAccount}
                      onChange={(e) => setAccount(e.target.value)}
                      className={inputCls}
                    >
                      {accounts.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="tx-description">
                  Description <span className="font-normal text-zinc-400">(optional)</span>
                </label>
                <DescriptionInput
                  id="tx-description"
                  value={description}
                  onChange={handleDescriptionChange}
                  onPick={handleDescriptionPick}
                  index={descIndex}
                  showCategory={mode !== "Transfer"}
                  inputClassName={inputCls}
                  placeholder={mode === "Transfer" ? "e.g. Monthly savings" : "e.g. Rickshaw"}
                />
              </div>
              {mode === "Debit" && (
                <label className="flex items-start gap-2.5 rounded-2xl border border-zinc-200 px-3.5 py-3 text-sm dark:border-zinc-800">
                  <input
                    type="checkbox"
                    checked={recurring}
                    onChange={(e) => setRecurringOverride(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600"
                  />
                  <span>
                    <span className="font-medium">Repeats every month</span>
                    <span className="block text-xs text-zinc-500">
                      The pace card counts it once as a fixed cost instead of
                      projecting it forward. Manage it in Manage → Recurring.
                    </span>
                  </span>
                </label>
              )}
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
              {busy
                ? "Saving…"
                : editing
                  ? "Save changes"
                  : mode === "Transfer"
                    ? "Move money"
                    : `Save ${mode === "Debit" ? "expense" : "income"}`}
            </button>
            <p className="mt-3 text-center text-xs text-zinc-500">
              {editing
                ? "Edits save to the same row. Changing the month moves the entry to that month's tab."
                : mode === "Transfer"
                  ? "Transfers don't count as income or spending."
                  : "Saved to the tab for the month of the date above."}
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
