"use client";

import { useEffect, useMemo, useState } from "react";
import { formatBDT, type Transaction, type TxType } from "@/lib/types";
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

/**
 * Inline quick-add for the Overview: money out, money in, or a transfer
 * between accounts. Category comes from the managed list for that type
 * (plus "New category…"), and the account from the managed accounts. Saves
 * through the same endpoints as the modal. After a save the mode, category
 * and date stay put, so adding several entries in a row is one field at a
 * time.
 */
export function QuickAdd({
  expenseCategories,
  incomeCategories,
  accounts,
  transactions,
  onSaved,
  onManageAccounts,
}: {
  expenseCategories: string[];
  incomeCategories: string[];
  accounts: string[];
  transactions: Transaction[];
  onSaved: () => void;
  onManageAccounts: () => void;
}) {
  const [mode, setMode] = useState<Mode>("Debit");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [account, setAccount] = useState("");
  const [fromAccount, setFromAccount] = useState("");
  const [toAccount, setToAccount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayLocal());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  // Shown when Transfer is tapped while there's only one account — the
  // toggle used to be silently disabled with only a hover tooltip, so on
  // mobile there was no way to learn why (or how to fix it).
  const [showTransferHint, setShowTransferHint] = useState(false);

  const options = mode === "Debit" ? expenseCategories : incomeCategories;
  const effectiveAccount = account || accounts[0] || "Cash";
  const effectiveFrom = fromAccount || accounts[0] || "Cash";
  const effectiveTo = toAccount || accounts[1] || accounts[0] || "Cash";
  const canTransfer = accounts.length >= 2;

  // Once a second account exists, the hint has done its job.
  useEffect(() => {
    if (canTransfer) setShowTransferHint(false);
  }, [canTransfer]);

  // Keep the selected category valid when the mode changes.
  useEffect(() => {
    if (category && category !== NEW_CATEGORY && !options.includes(category)) {
      setCategory("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Descriptions already in the sheet, for suggestions + auto-category.
  const descIndex = useMemo(
    () => buildDescriptionIndex(transactions, mode),
    [transactions, mode]
  );

  /** Typing a description used before auto-picks its category — but only
      while no category is chosen, so a deliberate choice is never
      overridden. */
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

  // An auto-picked category may not be in the managed list (typed in the
  // sheet, or imported) — keep it selectable instead of blanking the field.
  const categoryOptions =
    category && category !== NEW_CATEGORY && !options.includes(category)
      ? [category, ...options]
      : options;

  const effectiveCategory = category === NEW_CATEGORY ? newCategory.trim() : category;
  const parsed = Number(amount);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter an amount above 0.");
      return;
    }
    if (mode === "Transfer") {
      if (effectiveFrom === effectiveTo) {
        setError("Pick two different accounts.");
        return;
      }
    } else if (!effectiveCategory) {
      setError("Pick a category.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
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
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date,
            type: mode,
            category: effectiveCategory,
            description: description.trim(),
            amount: parsed,
            linkedAccount: effectiveAccount,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Could not save the entry.");
      }
      setAmount("");
      setDescription("");
      setNewCategory("");
      if (category === NEW_CATEGORY) setCategory("");
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 2000);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30 dark:border-zinc-700 dark:bg-zinc-950";

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-3 gap-2 rounded-2xl bg-zinc-100 p-1 dark:bg-zinc-800">
        {(
          [
            { value: "Debit", label: "💸 Money out" },
            { value: "Credit", label: "💰 Money in" },
            { value: "Transfer", label: "⇄ Transfer" },
          ] as const
        ).map((opt) => (
          <button
            key={opt.value}
            type="button"
            aria-disabled={opt.value === "Transfer" && !canTransfer}
            onClick={() => {
              if (opt.value === "Transfer" && !canTransfer) {
                // Stays tappable on purpose: tapping explains why it's
                // off and offers the fix, instead of doing nothing.
                setShowTransferHint(true);
                return;
              }
              setMode(opt.value);
            }}
            aria-pressed={mode === opt.value}
            className={`rounded-xl py-2 text-sm font-semibold transition ${
              opt.value === "Transfer" && !canTransfer ? "opacity-40" : ""
            } ${
              mode === opt.value
                ? "bg-white text-zinc-900 shadow-card dark:bg-zinc-900 dark:text-white"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {showTransferHint && !canTransfer && (
        <div className="rounded-xl bg-accent-soft px-3.5 py-3 text-sm text-accent-ink">
          <p className="font-semibold">Transfers need two accounts.</p>
          <p className="mt-0.5 text-xs leading-relaxed opacity-80">
            A transfer moves money from one of your accounts to another. Add
            a second account and the Transfer option unlocks.
          </p>
          <button
            type="button"
            onClick={onManageAccounts}
            className="mt-2 text-sm font-semibold underline underline-offset-2"
          >
            Add an account →
          </button>
        </div>
      )}

      {mode === "Transfer" ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500" htmlFor="qa-from">
              From
            </label>
            <select
              id="qa-from"
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
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500" htmlFor="qa-to">
              To
            </label>
            <select
              id="qa-to"
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
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500" htmlFor="qa-category">
              Category
            </label>
            {options.length === 0 && category !== NEW_CATEGORY ? (
              <input
                id="qa-category"
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
                id="qa-category"
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
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500" htmlFor="qa-account">
              Account
            </label>
            <select
              id="qa-account"
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
        </div>
      )}

      {category === NEW_CATEGORY && options.length > 0 && mode !== "Transfer" && (
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

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500" htmlFor="qa-amount">
            Amount (৳)
          </label>
          <input
            id="qa-amount"
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
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500" htmlFor="qa-date">
            Date
          </label>
          <input
            id="qa-date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-500" htmlFor="qa-description">
          Description <span className="font-normal text-zinc-400">(optional)</span>
        </label>
        <DescriptionInput
          id="qa-description"
          value={description}
          onChange={handleDescriptionChange}
          onPick={handleDescriptionPick}
          index={descIndex}
          showCategory={mode !== "Transfer"}
          inputClassName={inputCls}
          placeholder={mode === "Transfer" ? "e.g. Monthly savings" : "e.g. Rickshaw"}
        />
      </div>

      {Number.isFinite(parsed) && parsed > 0 && (
        <p className="text-xs text-zinc-500">
          {mode === "Transfer" ? (
            <>
              Moves {formatBDT(parsed)} from{" "}
              <span className="font-medium text-zinc-700 dark:text-zinc-300">{effectiveFrom}</span>{" "}
              to{" "}
              <span className="font-medium text-zinc-700 dark:text-zinc-300">{effectiveTo}</span>,{" "}
              {date === todayLocal() ? "today" : date}. Transfers don&apos;t count as income or spending.
            </>
          ) : (
            effectiveCategory && (
              <>
                Records {formatBDT(parsed)} {mode === "Debit" ? "out of" : "into"}{" "}
                <span className="font-medium text-zinc-700 dark:text-zinc-300">{effectiveAccount}</span>{" "}
                under{" "}
                <span className="font-medium text-zinc-700 dark:text-zinc-300">{effectiveCategory}</span>
                {description.trim() ? ` (${description.trim()})` : ""},{" "}
                {date === todayLocal() ? "today" : date}.
              </>
            )
          )}
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-accent py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-accent-strong hover:shadow-card-hover disabled:opacity-50"
      >
        {busy
          ? "Saving…"
          : justSaved
            ? "✅ Saved"
            : mode === "Transfer"
              ? "⇄ Move money"
              : `+ Add money ${mode === "Debit" ? "out" : "in"}`}
      </button>
    </form>
  );
}
