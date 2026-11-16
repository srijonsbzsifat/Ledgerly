"use client";

import { useMemo, useState } from "react";
import { isTransfer, type Transaction, type TxType } from "@/lib/types";

export type DescriptionSuggestion = {
  /** The description as most recently written. */
  description: string;
  /** The category of the most recent entry with this description. */
  category: string;
  /** Date of the most recent entry with this description (YYYY-MM-DD). */
  lastDate: string;
};

/**
 * One entry per description previously used, most recently used first.
 * Debit/Credit indexes exclude transfers (their "Transfer" category is not
 * pickable); the Transfer index holds transfer descriptions only.
 */
export function buildDescriptionIndex(
  transactions: Transaction[],
  mode: TxType | "Transfer"
): DescriptionSuggestion[] {
  const byKey = new Map<string, DescriptionSuggestion>();
  const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date));
  for (const t of sorted) {
    const transfer = isTransfer(t);
    if (mode === "Transfer" ? !transfer : transfer) continue;
    if (mode !== "Transfer" && t.type !== mode) continue;
    const desc = (t.description ?? "").trim();
    if (!desc) continue;
    const key = desc.toLowerCase();
    if (!byKey.has(key)) {
      byKey.set(key, { description: desc, category: t.category, lastDate: t.date });
    }
  }
  return [...byKey.values()];
}

const MAX_SUGGESTIONS = 5;

/**
 * A description field with suggestions from descriptions already in the
 * sheet. Typing shows up to five previous descriptions (most recently used
 * first) with the category each one used; tapping one fills the description
 * and hands the suggestion back so the caller can pick up its category.
 * Once the text exactly matches a previous description the list hides —
 * the description is already complete.
 */
export function DescriptionInput({
  id,
  value,
  onChange,
  onPick,
  index,
  showCategory,
  inputClassName,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (text: string) => void;
  onPick: (suggestion: DescriptionSuggestion) => void;
  index: DescriptionSuggestion[];
  showCategory: boolean;
  inputClassName: string;
  placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);

  const query = value.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (query.length < 2) return [];
    if (index.some((s) => s.description.toLowerCase() === query)) return [];
    return index
      .filter((s) => s.description.toLowerCase().includes(query))
      .slice(0, MAX_SUGGESTIONS);
  }, [index, query]);

  const show = focused && open && suggestions.length > 0;

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setFocused(true);
          setOpen(true);
        }}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={show}
        aria-autocomplete="list"
        className={inputClassName}
      />
      {show && (
        <ul
          role="listbox"
          aria-label="Previous descriptions"
          className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        >
          {suggestions.map((s) => (
            <li key={s.description.toLowerCase()}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onMouseDown={(e) => {
                  // Fires before the input blurs, so the tap registers.
                  e.preventDefault();
                  onPick(s);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-sm transition hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <span className="truncate font-medium">{s.description}</span>
                {showCategory && (
                  <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                    {s.category}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
